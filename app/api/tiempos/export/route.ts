import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listRegistros, toCsv } from "@/lib/tiempos";

export const dynamic = "force-dynamic";

// CSV con todo el histórico del estudio de tiempos (solo Admin).
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo Admin descarga el estudio" }, { status: 403 });
  }

  const csv = toCsv(await listRegistros());
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="estudio-tiempos-${date}.csv"`,
    },
  });
}
