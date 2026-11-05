import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { USER_NAMES, type Role } from "@/lib/auth";
import { loadGmc } from "@/lib/gmc";
import {
  GMC_COMM_MEDIOS,
  GMC_COMM_TIPOS,
  deleteGmcComm,
  getGmcComm,
  listGmcComms,
  newGmcCommId,
  saveGmcComm,
  type GmcComm,
  type GmcCommTipo,
} from "@/lib/comms-gmc";

export const dynamic = "force-dynamic";

const READ_ONLY = new Set<Role>(["MANAGER", "COORDINATOR", "CS"]);

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const nameOf = (email: string) => (USER_NAMES[email] || email.split("@")[0]).toUpperCase();

// Lo ya capturado, sin repetir (sin importar mayúsculas), más usado primero.
function sugerencias(values: string[]) {
  const count = new Map<string, { label: string; n: number }>();
  values.filter(Boolean).forEach((v) => {
    const k = v.toUpperCase();
    const cur = count.get(k);
    count.set(k, { label: cur?.label || v, n: (cur?.n || 0) + 1 });
  });
  return [...count.values()].sort((a, b) => b.n - a.n).map((x) => x.label);
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  if (!session.gmc) return fail("No tienes acceso a GMC", 403);

  try {
    const [comms, clientesSheet] = await Promise.all([
      listGmcComms(),
      loadGmc()
        .then((d) => d.items.map((i) => i.cliente.trim().toUpperCase()))
        .catch(() => [] as string[]),
    ]);
    return NextResponse.json({
      comms,
      tipos: GMC_COMM_TIPOS,
      medios: GMC_COMM_MEDIOS,
      entidades: sugerencias(comms.map((c) => c.entidad)),
      items: sugerencias(comms.map((c) => c.item)),
      clientes: [...new Set([...clientesSheet, ...comms.map((c) => c.cliente)].filter(Boolean))].sort(),
      me: nameOf(session.email),
      email: session.email,
      canWrite: !READ_ONLY.has(session.role),
      isAdmin: session.role === "ADMIN",
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error", 500);
  }
}

// Alta o edición. Cada quien edita lo suyo; el Admin, todo.
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  if (!session.gmc) return fail("No tienes acceso a GMC", 403);
  if (READ_ONLY.has(session.role)) return fail("Tu rol es de solo lectura", 403);

  const body = await req.json().catch(() => ({}));
  const tipo = GMC_COMM_TIPOS.find((t) => t === body.tipo) as GmcCommTipo | undefined;
  const cliente = str(body.cliente, 200).toUpperCase();
  const entidad = str(body.entidad, 150);
  const item = str(body.item, 200);
  const medio = GMC_COMM_MEDIOS.find((m) => m === body.medio);
  const fecha = str(body.fecha, 10);

  if (!tipo) return fail("Elige si es Requested o Received");
  if (!cliente) return fail("Escribe el cliente");
  if (!entidad) return fail("Escribe la entidad");
  if (!item) return fail("Escribe el item");
  if (!medio) return fail("Elige el medio");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fail("Elige la fecha");

  try {
    const id = str(body.id, 60);
    const existing = id ? await getGmcComm(id) : null;
    if (id && !existing) return fail("La comunicación no existe", 404);
    if (existing && existing.email !== session.email && session.role !== "ADMIN") {
      return fail("Solo puedes editar tus comunicaciones", 403);
    }
    const now = new Date().toISOString();
    const comm: GmcComm = {
      id: existing?.id || newGmcCommId(),
      tipo,
      cliente,
      entidad,
      item,
      medio,
      fecha,
      notas: str(body.notas, 2000),
      email: existing?.email || session.email,
      colaborador: existing?.colaborador || nameOf(session.email),
      creado: existing?.creado || now,
      editado: existing ? now : undefined,
    };
    await saveGmcComm(comm);
    return NextResponse.json({ comm });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo guardar", 500);
  }
}

export async function DELETE(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  if (!session.gmc) return fail("No tienes acceso a GMC", 403);
  const body = await req.json().catch(() => ({}));

  try {
    const comm = await getGmcComm(str(body.id, 60));
    if (!comm) return fail("La comunicación no existe", 404);
    if (comm.email !== session.email && session.role !== "ADMIN") {
      return fail("Solo puedes borrar tus comunicaciones", 403);
    }
    await deleteGmcComm(comm.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo borrar", 500);
  }
}
