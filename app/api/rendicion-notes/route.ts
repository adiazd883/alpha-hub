import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { USER_NAMES } from "@/lib/auth";
import { isCelula } from "@/lib/celulas";
import { celulaOfField, isWeek, listNotes, saveNote } from "@/lib/rendicion-notes";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  const week = req.nextUrl.searchParams.get("week");
  if (!isWeek(week)) return fail("Semana inválida");

  try {
    return NextResponse.json({ notes: await listNotes(week, session.celulas) });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Error", 500);
  }
}

export async function PUT(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  const body = await req.json().catch(() => ({}));
  const week = body.week;
  const field = typeof body.field === "string" ? body.field.slice(0, 300) : "";
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : "";
  const celula = celulaOfField(field);

  if (!isWeek(week) || field.split("|").length < 3) return fail("Datos incompletos");
  if (!isCelula(celula) || !session.celulas.includes(celula)) {
    return fail("No tienes acceso a esta célula", 403);
  }

  try {
    const note = text
      ? {
          text,
          by: USER_NAMES[session.email] || session.email,
          at: new Date().toISOString(),
        }
      : null;
    await saveNote(week, field, note);
    return NextResponse.json({ note });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo guardar", 500);
  }
}
