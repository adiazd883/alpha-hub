import { NextRequest, NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/session";
import { isCelula } from "@/lib/celulas";
import {
  areasFor,
  canClose,
  canEdit,
  canSee,
  isDateOnly,
  todayMx,
  type Person,
  type Regreso,
  type Viewer,
} from "@/lib/regresos";
import {
  deleteRegreso,
  getRegreso,
  getRoster,
  listRegresos,
  newId,
  personIdFor,
  saveRegreso,
} from "@/lib/regresos-store";

export const dynamic = "force-dynamic";

const str = (v: unknown, max = 500) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

function viewerFor(session: Session, roster: Person[]): Viewer {
  return {
    email: session.email,
    personId: personIdFor(roster, session.email),
    role: session.role,
    celulas: session.celulas,
  };
}

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function serverError(e: unknown) {
  return fail(e instanceof Error ? e.message : "Error inesperado", 500);
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);

  try {
    const roster = await getRoster();
    const viewer = viewerFor(session, roster);
    const items = (await listRegresos()).filter((r) => canSee(viewer, r));
    return NextResponse.json({
      items,
      roster,
      me: viewer.personId,
      today: todayMx(),
    });
  } catch (e) {
    return serverError(e);
  }
}

/*
 * Campos que manda el formulario. Lo valida igual al crear y
 * al editar para no aceptar personas o células que no existen.
 */
function readFields(
  body: Record<string, unknown>,
  roster: Person[],
  session: Session
) {
  const tipo = body.tipo;
  if (tipo !== "regreso" && tipo !== "actualizacion") {
    return { error: "Elige si es regreso o actualización" } as const;
  }
  const celula = body.celula;
  if (!isCelula(celula) || !session.celulas.includes(celula)) {
    return { error: "Célula inválida" } as const;
  }
  const ids = new Set(roster.map((p) => p.id));
  const para = str(body.para, 200);
  const de = str(body.de, 200);
  if (!ids.has(para)) return { error: "Elige para quién va" } as const;
  if (!ids.has(de)) return { error: "Elige quién lo manda" } as const;
  const cliente = str(body.cliente, 200);
  if (!cliente) return { error: "Escribe el cliente" } as const;
  const origen =
    body.origen === "informacion" || body.origen === "documento"
      ? body.origen
      : undefined;
  if (tipo === "actualizacion" && !origen) {
    return { error: "Elige qué trajo el cliente" } as const;
  }
  const area = areasFor(session.role).find((a) => a === body.area);
  if (!area) return { error: "Elige para qué área va" } as const;
  const motivo = str(body.motivo, 120);
  if (!motivo) return { error: "Elige qué se pide" } as const;
  const enviado = isDateOnly(body.enviado) ? body.enviado : todayMx();
  const limite = isDateOnly(body.limite) ? body.limite : undefined;
  if (limite && limite < enviado) {
    return { error: "La fecha límite no puede ser antes del envío" } as const;
  }

  return {
    fields: {
      tipo,
      celula,
      cliente,
      clienteId: str(body.clienteId, 60) || undefined,
      receipt: str(body.receipt, 60) || undefined,
      etapa: str(body.etapa, 80) || "Otra",
      origen: tipo === "actualizacion" ? origen : undefined,
      area,
      motivo,
      detalle: str(body.detalle, 2000),
      para,
      de,
      enviado,
      limite,
    },
  } as const;
}

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);

  try {
    const body = await req.json().catch(() => ({}));
    const roster = await getRoster();
    const read = readFields(body, roster, session);
    if ("error" in read) return fail(read.error!);

    const now = new Date().toISOString();
    const item: Regreso = {
      id: newId(),
      ...read.fields,
      deEmail: session.email,
      estado: "pendiente",
      creado: now,
      actualizado: now,
    };
    await saveRegreso(item);
    return NextResponse.json({ item });
  } catch (e) {
    return serverError(e);
  }
}

/*
 * action "concretar" / "reabrir" cambia el estado; "editar"
 * reemplaza los campos del formulario.
 */
export async function PATCH(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);

  try {
    const body = await req.json().catch(() => ({}));
    const roster = await getRoster();
    const viewer = viewerFor(session, roster);
    const current = await getRegreso(str(body.id, 80));
    if (!current || !canSee(viewer, current)) {
      return fail("No se encontró el registro", 404);
    }

    let next: Regreso;
    const now = new Date().toISOString();

    if (body.action === "concretar") {
      if (!canClose(viewer, current)) return fail("Sin permiso", 403);
      const fecha = isDateOnly(body.fecha) ? body.fecha : todayMx();
      next = {
        ...current,
        estado: "concretado",
        concretado: fecha < current.enviado ? current.enviado : fecha,
        nota: str(body.nota, 1000) || current.nota,
        actualizado: now,
      };
    } else if (body.action === "reabrir") {
      if (!canClose(viewer, current)) return fail("Sin permiso", 403);
      next = {
        ...current,
        estado: "pendiente",
        concretado: undefined,
        actualizado: now,
      };
    } else if (body.action === "editar") {
      if (!canEdit(viewer, current)) return fail("Sin permiso", 403);
      const read = readFields(body, roster, session);
      if ("error" in read) return fail(read.error!);
      next = { ...current, ...read.fields, actualizado: now };
    } else {
      return fail("Acción inválida");
    }

    await saveRegreso(next);
    return NextResponse.json({ item: next });
  } catch (e) {
    return serverError(e);
  }
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  // Nadie más borra registros: el histórico del 80/20 depende de ellos.
  if (session.role !== "ADMIN") return fail("Solo Admin puede borrar registros", 403);

  try {
    const id = req.nextUrl.searchParams.get("id") || "";
    const current = await getRegreso(id);
    if (!current) {
      return fail("No se encontró el registro", 404);
    }
    await deleteRegreso(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
}
