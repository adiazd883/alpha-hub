import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { TABS } from "@/lib/rfe/config";
import { fetchRfeRows } from "@/lib/rfe/sheet";
import {
  buildRfeDashboard,
  type ManualMetrics,
  type MetricsHistory,
} from "@/lib/rfe/logic";

export const dynamic = "force-dynamic";

const RFE_METRICS_URL =
  process.env.RFE_METRICS_URL ||
  "https://estatus-general-rfe.vercel.app/api/metrics";

/*
 * Las metas viven en el dashboard actual (Vercel KV). Si no
 * responde, el inventario y las llegadas se muestran igual.
 */
async function fetchGoals() {
  try {
    const res = await fetch(RFE_METRICS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return {
      metrics: json.metrics as ManualMetrics,
      history: json.history as MetricsHistory,
      goalsError: null,
    };
  } catch (e) {
    return {
      metrics: null,
      history: null,
      goalsError: `No se pudieron leer las metas del dashboard RFE (${
        e instanceof Error ? e.message : "error"
      })`,
    };
  }
}

export async function GET(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Vista del área: solo quien ve todas las células.
  if (session.celulas.length < 2) {
    return NextResponse.json({ error: "No tienes acceso a este dashboard" }, { status: 403 });
  }

  try {
    const [dueDateRows, noDueDateRows, otherFormsRows, goals] =
      await Promise.all([
        fetchRfeRows(TABS.vawaDueDate, 1),
        fetchRfeRows(TABS.vawaNoDueDate, 1),
        fetchRfeRows(TABS.otherForms, 2),
        fetchGoals(),
      ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      goalsError: goals.goalsError,
      ...buildRfeDashboard(
        dueDateRows,
        noDueDateRows,
        otherFormsRows,
        goals.metrics,
        goals.history
      ),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
