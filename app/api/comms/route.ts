import { NextRequest, NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/session";
import type { Role } from "@/lib/auth";
import { addComm, commsName, commsPosition, loadComms, type CommsVista } from "@/lib/comms";

export const dynamic = "force-dynamic";

const READ_ONLY = new Set<Role>(["MANAGER", "COORDINATOR", "CS"]);

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function canSee(session: Session, vista: unknown): vista is CommsVista {
  if (vista === "gmc") return session.gmc;
  return (vista === "alpha" || vista === "gamma") && session.celulas.includes(vista);
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  const vista = req.nextUrl.searchParams.get("vista");
  if (!canSee(session, vista)) return fail("No tienes acceso a estas comunicaciones", 403);

  try {
    return NextResponse.json({
      ...(await loadComms(vista)),
      me: commsName(session.email),
      position: commsPosition(session.role),
      canWrite: !READ_ONLY.has(session.role),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error", 500);
  }
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  const body = await req.json().catch(() => ({}));
  if (!canSee(session, body.vista)) return fail("No tienes acceso a estas comunicaciones", 403);
  if (READ_ONLY.has(session.role)) return fail("Tu rol es de solo lectura", 403);

  const cliente = str(body.cliente, 200);
  const fecha = str(body.fecha, 10);
  const medio = str(body.medio, 200);
  if (!cliente) return fail("Escribe el cliente");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fail("Elige la fecha");
  if (!medio) return fail("Elige el medio");
  if (body.vista === "gmc" ? !str(body.type, 40) : !str(body.status, 60)) {
    return fail(body.vista === "gmc" ? "Elige si es Received o Requested" : "Elige el status");
  }
  const number = (v: unknown) => {
    const s = str(v, 6);
    return /^\d+$/.test(s) ? s : "";
  };

  try {
    const row = await addComm(body.vista, {
      cliente: cliente.toUpperCase(),
      // Colaborador y posición salen del login, no del formulario.
      colaborador: commsName(session.email),
      posicion: commsPosition(session.role),
      fecha,
      duracion: number(body.duracion),
      cantidad: number(body.cantidad),
      medio,
      status: str(body.status, 60),
      type: str(body.type, 40),
      mensajeTramcase: body.mensajeTramcase === true,
      notaTramcase: body.notaTramcase === true,
      documento: str(body.documento, 200),
      link: str(body.link, 500),
      notas: str(body.notas, 2000),
    });
    return NextResponse.json({ ok: true, row });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo registrar", 500);
  }
}
