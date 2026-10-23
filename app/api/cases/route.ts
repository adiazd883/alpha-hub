import { NextRequest, NextResponse } from "next/server";
import { readCases } from "@/lib/sheets";
import { getSession } from "@/lib/session";
import { isCelula } from "@/lib/celulas";

export async function GET(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const celula = req.nextUrl.searchParams.get("celula") || "alpha";

  if (!isCelula(celula) || !session.celulas.includes(celula)) {
    return NextResponse.json({ error: "No tienes acceso a esta célula" }, { status: 403 });
  }

  try {
    return NextResponse.json(await readCases(celula));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
