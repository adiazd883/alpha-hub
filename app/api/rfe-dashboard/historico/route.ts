import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadHistorico } from "@/lib/rfe/historico";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Vista del área: solo quien ve todas las células.
  if (session.celulas.length < 2) {
    return NextResponse.json({ error: "No tienes acceso a este dashboard" }, { status: 403 });
  }

  try {
    return NextResponse.json(await loadHistorico());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
