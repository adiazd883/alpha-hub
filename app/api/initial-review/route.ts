import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isCelula } from "@/lib/celulas";
import { USER_NAMES } from "@/lib/auth";
import { deleteInitialReview, listRegistrants, saveInitialReview } from "@/lib/initialReview";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Quién registró cada initial review (llave "célula:fila").
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  try {
    const all = await listRegistrants();
    const mine = Object.fromEntries(
      Object.entries(all).filter(([key]) => session.celulas.some((c) => key.startsWith(`${c}:`)))
    );
    return NextResponse.json({ registrants: mine });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error", 500);
  }
}

function readTarget(body: Record<string, unknown>, celulas: string[]) {
  const celula = body.celula;
  const row = Number(body.row);
  const cliente = typeof body.cliente === "string" ? body.cliente : "";
  if (!isCelula(celula) || !celulas.includes(celula) || !Number.isInteger(row) || row < 3 || !cliente) {
    return null;
  }
  return { celula, row, cliente };
}

// Registrar: Admin, CS y TL.
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  if (!["ADMIN", "CS", "TL"].includes(session.role)) return fail("No puedes registrar initial reviews", 403);

  const body = await req.json().catch(() => ({}));
  const target = readTarget(body, session.celulas);
  const date = typeof body.date === "string" ? body.date : "";
  if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Elige el cliente y la fecha");

  try {
    const registrant = await saveInitialReview({
      ...target,
      date,
      by: { email: session.email, nombre: USER_NAMES[session.email] || session.email.split("@")[0] },
    });
    return NextResponse.json({ registrant });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo guardar", 500);
  }
}

// Borrar: solo Admin.
export async function DELETE(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  if (session.role !== "ADMIN") return fail("Solo Admin puede borrar initial reviews", 403);

  const body = await req.json().catch(() => ({}));
  const target = readTarget(body, session.celulas);
  if (!target) return fail("Datos incompletos");

  try {
    await deleteInitialReview(target);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo borrar", 500);
  }
}
