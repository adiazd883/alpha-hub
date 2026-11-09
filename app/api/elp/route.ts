import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadElp } from "@/lib/elp";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Vista del área: solo quien ve todas las células.
  if (session.celulas.length < 2) {
    return NextResponse.json({ error: "No tienes acceso a Regresos ELP" }, { status: 403 });
  }
  try {
    return NextResponse.json(await loadElp());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
