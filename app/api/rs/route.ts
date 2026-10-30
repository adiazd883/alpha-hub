import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { CELULAS, isCelula } from "@/lib/celulas";
import { USER_NAMES } from "@/lib/auth";
import { RS_DEADLINE, loadRs } from "@/lib/rs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const celula = req.nextUrl.searchParams.get("celula");
  if (!isCelula(celula) || !session.celulas.includes(celula) || !CELULAS[celula].hasRs) {
    return NextResponse.json({ error: "No tienes acceso a esta lista" }, { status: 403 });
  }

  try {
    return NextResponse.json({
      deadline: RS_DEADLINE,
      cases: await loadRs(celula),
      // Para abrir la lista ya filtrada con su propio nombre.
      me: (USER_NAMES[session.email] || "").toUpperCase(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
