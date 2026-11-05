import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gmcCommsCsv, listGmcComms } from "@/lib/comms-gmc";

export const dynamic = "force-dynamic";

// CSV con todas las comunicaciones de GMC.
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!session.gmc) return NextResponse.json({ error: "No tienes acceso a GMC" }, { status: 403 });

  const csv = gmcCommsCsv(await listGmcComms());
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comunicaciones-gmc-${date}.csv"`,
    },
  });
}
