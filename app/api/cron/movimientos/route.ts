import { NextRequest, NextResponse } from "next/server";
import { tomarFoto } from "@/lib/movimientos";

export const dynamic = "force-dynamic";

/*
 * Foto diaria de etapas (Vercel Cron, ver vercel.json). Si existe
 * CRON_SECRET, Vercel lo manda como Bearer; si no, se acepta solo
 * la llamada del cron de Vercel.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const ok = secret
    ? req.headers.get("authorization") === `Bearer ${secret}`
    : (req.headers.get("user-agent") || "").includes("vercel-cron");
  if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    return NextResponse.json(await tomarFoto(true));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
