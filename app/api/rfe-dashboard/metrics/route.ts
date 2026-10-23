import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadRfeDashboard } from "@/lib/rfe/load";
import { saveCurrentMetrics } from "@/lib/rfe/store";
import { currentActuals } from "@/lib/rfe/logic";
import { readCount, readCounts } from "@/lib/rfe/validate";

export const dynamic = "force-dynamic";

/*
 * Metas del periodo en curso + avance manual de Other forms.
 * Igual que "Guardar" en el dashboard RFE: también deja la foto
 * de la semana y el mes con el avance de ese momento.
 */
export async function POST(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo Admin puede editar metas" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const weeklyGoal = readCounts(body.weeklyGoal);
  const monthlyGoal = readCounts(body.monthlyGoal);
  const weeklyOther = readCount(body.otherFormsProgress?.weekly);
  const monthlyOther = readCount(body.otherFormsProgress?.monthly);

  if (!weeklyGoal || !monthlyGoal || weeklyOther === null || monthlyOther === null) {
    return NextResponse.json(
      { error: "Todos los valores deben ser números enteros de 0 en adelante" },
      { status: 400 }
    );
  }

  try {
    const { goals, currentWeek, currentMonth } = await loadRfeDashboard();
    const actual = currentActuals(goals);

    await saveCurrentMetrics({
      weeklyGoal,
      monthlyGoal,
      otherFormsProgress: { weekly: weeklyOther, monthly: monthlyOther },
      weekKey: currentWeek,
      weeklyActual: { ...actual.weekly, otherForms: weeklyOther },
      monthKey: currentMonth,
      monthlyActual: { ...actual.monthly, otherForms: monthlyOther },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo guardar" },
      { status: 500 }
    );
  }
}
