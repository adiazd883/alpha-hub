import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { CELULAS, isCelula } from "@/lib/celulas";
import { USER_NAMES, type Role } from "@/lib/auth";
import { RS_DEADLINE, RS_FIELDS, loadRs, updateRs, type RsField } from "@/lib/rs";

export const dynamic = "force-dynamic";

// Roles de solo lectura en el hub.
const READ_ONLY = new Set<Role>(["MANAGER", "COORDINATOR", "CS"]);

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function access(req: NextRequest, celulaParam: unknown) {
  const session = getSession(req);
  if (!session) return { error: fail("No autenticado", 401) };
  if (!isCelula(celulaParam) || !session.celulas.includes(celulaParam) || !CELULAS[celulaParam].hasRs) {
    return { error: fail("No tienes acceso a esta lista", 403) };
  }
  return { session, celula: celulaParam };
}

export async function GET(req: NextRequest) {
  const { session, celula, error } = access(req, req.nextUrl.searchParams.get("celula"));
  if (error) return error;

  try {
    return NextResponse.json({
      deadline: RS_DEADLINE,
      ...(await loadRs(celula)),
      canEdit: !READ_ONLY.has(session.role),
      // Para abrir la lista ya filtrada con su propio nombre.
      me: (USER_NAMES[session.email] || "").toUpperCase(),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { session, celula, error } = access(req, body.celula);
  if (error) return error;
  if (READ_ONLY.has(session.role)) return fail("Tu rol es de solo lectura", 403);

  const field = (Object.keys(RS_FIELDS) as RsField[]).find((f) => f === body.field);
  const row = Number(body.row);
  const cliente = typeof body.cliente === "string" ? body.cliente : "";
  const value = typeof body.value === "string" ? body.value.trim().slice(0, 1000) : "";

  if (!field || !Number.isInteger(row) || row < 2 || !cliente) {
    return fail("Datos incompletos");
  }
  if (RS_FIELDS[field].kind === "date" && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail("Fecha inválida");
  }

  try {
    const item = await updateRs({ celula, row, cliente, field, value });
    return NextResponse.json({ item });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo guardar", 500);
  }
}
