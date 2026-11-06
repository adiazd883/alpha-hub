import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { canViewAll } from "@/lib/regresos";
import { listarMovimientos, tomarFoto } from "@/lib/movimientos";

export const dynamic = "force-dynamic";

// Movimientos de etapa para el análisis de Regresos (quien ve a todo el equipo).
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!canViewAll(session.role)) {
    return NextResponse.json({ error: "No tienes acceso a los movimientos" }, { status: 403 });
  }

  try {
    // Foto nueva si la última ya tiene más de 6 h; si falla, se muestra lo guardado.
    await tomarFoto().catch(() => null);
    const { eventos, desde } = await listarMovimientos();
    return NextResponse.json({
      eventos: eventos.filter((e) => session.celulas.includes(e.celula)),
      desde,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
