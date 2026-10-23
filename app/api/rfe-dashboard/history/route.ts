import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { forwardToMetrics } from "@/lib/rfe/load";
import { readCounts } from "@/lib/rfe/validate";

export const dynamic = "force-dynamic";

const KEY_FORMATS = {
  weekly: /^\d{4}-W\d{2}$/,
  monthly: /^\d{4}-\d{2}$/,
};

// Cierres: meta y avance final de semanas o meses ya guardados.
export async function PUT(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo Admin puede editar cierres" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return NextResponse.json({ error: "No hay cambios que guardar" }, { status: 400 });
  }

  const entries = [];

  for (const entry of body.entries) {
    const period = entry?.period as keyof typeof KEY_FORMATS;
    if (!KEY_FORMATS[period]?.test(entry?.key || "")) {
      return NextResponse.json({ error: `Periodo inválido: ${entry?.key}` }, { status: 400 });
    }

    const goal = readCounts(entry.goal);
    const actual = readCounts(entry.actual);
    if (!goal || !actual) {
      return NextResponse.json(
        { error: `${entry.key}: todos los valores deben ser números enteros de 0 en adelante` },
        { status: 400 }
      );
    }

    entries.push({ period, key: entry.key, goal, actual });
  }

  try {
    await forwardToMetrics("/history", "PUT", { entries });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo guardar" },
      { status: 500 }
    );
  }
}
