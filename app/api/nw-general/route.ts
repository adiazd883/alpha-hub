import { NextRequest, NextResponse } from "next/server";
import { readSheetCases } from "@/lib/sheets";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // NW GENERAL es de Alpha.
  if (!session.celulas.includes("alpha")) {
    return NextResponse.json({ error: "No tienes acceso a esta célula" }, { status: 403 });
  }

  try {
    return NextResponse.json(await readSheetCases("NW GENERAL"));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
