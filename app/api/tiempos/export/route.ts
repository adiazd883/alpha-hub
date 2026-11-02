import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { TEAM_ROLES, listRegistros, teamScope, toCsv } from "@/lib/tiempos";

export const dynamic = "force-dynamic";

// CSV con todo el histórico del estudio de tiempos (solo Admin).
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!TEAM_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "No puedes descargar el estudio" }, { status: 403 });
  }

  // TL y CS solo descargan lo de sus células.
  const scope = teamScope(
    session.role,
    session.celulas.filter((c) => c === "alpha" || c === "gamma")
  );
  const csv = toCsv(
    (await listRegistros()).filter((r) => !scope || scope.includes(r.celula))
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="estudio-tiempos-${date}.csv"`,
    },
  });
}
