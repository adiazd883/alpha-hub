import { NextRequest, NextResponse } from "next/server";
import { readNwAdmins } from "@/lib/sheets";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // NW ADMINs es de Alpha.
  if (!session.celulas.includes("alpha")) {
    return NextResponse.json({ error: "No tienes acceso a esta célula" }, { status: 403 });
  }

  try {
    return NextResponse.json({ rows: await readNwAdmins() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
