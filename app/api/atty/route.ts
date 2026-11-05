import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { CELULA_KEYS } from "@/lib/celulas";
import { loadAttyEvents } from "@/lib/atty";

export const dynamic = "force-dynamic";

// Calendario de Atty: lo ven las paralegales de Atty y quien ve todo.
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.atty) return NextResponse.json({ error: "No tienes acceso al calendario de Atty" }, { status: 403 });

  try {
    return NextResponse.json(await loadAttyEvents(CELULA_KEYS));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
