import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadDecisions } from "@/lib/decisions";

export const dynamic = "force-dynamic";

// Decisions activos (DAILY 290) para el calendario de MGM Review.
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.celulas.length) {
    return NextResponse.json({ error: "No tienes acceso a MGM Review" }, { status: 403 });
  }
  try {
    return NextResponse.json({ casos: await loadDecisions() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
