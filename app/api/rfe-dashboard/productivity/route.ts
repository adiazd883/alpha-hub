import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getProductivity, saveProductivity } from "@/lib/rfe/store";

export const dynamic = "force-dynamic";

/*
 * Captura manual de la productividad mensual VAWA. Un valor en
 * blanco (null) regresa ese mes al cálculo automático.
 */
export async function PUT(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo Admin puede editar" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const months = body.months;

  if (!months || typeof months !== "object") {
    return NextResponse.json({ error: "No hay cambios que guardar" }, { status: 400 });
  }

  const read = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : undefined;
  };

  try {
    const next = { ...(await getProductivity()) };

    for (const [key, entry] of Object.entries(months as Record<string, { goal?: unknown; actual?: unknown }>)) {
      if (!/^\d{4}-\d{2}$/.test(key)) {
        return NextResponse.json({ error: `Mes inválido: ${key}` }, { status: 400 });
      }
      const goal = read(entry?.goal);
      const actual = read(entry?.actual);
      if (goal === undefined || actual === undefined) {
        return NextResponse.json(
          { error: `${key}: los valores deben ser números enteros de 0 en adelante` },
          { status: 400 }
        );
      }
      if (goal === null && actual === null) delete next[key];
      else next[key] = { goal, actual };
    }

    await saveProductivity(next);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo guardar" },
      { status: 500 }
    );
  }
}
