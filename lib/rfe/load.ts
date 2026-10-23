import { TABS } from "./config";
import { fetchRfeRows } from "./sheet";
import {
  buildRfeDashboard,
  type ManualMetrics,
  type MetricsHistory,
} from "./logic";

/*
 * Las metas, el avance manual y los cierres viven en el
 * dashboard "Estatus General RFE" (Vercel KV). El hub lee y
 * escribe a través de su API para que los dos muestren lo mismo.
 */
export const RFE_METRICS_URL =
  process.env.RFE_METRICS_URL ||
  "https://estatus-general-rfe.vercel.app/api/metrics";

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

export async function loadRfeDashboard() {
  const [dueDateRows, noDueDateRows, otherFormsRows, goals] =
    await Promise.all([
      fetchRfeRows(TABS.vawaDueDate, 1),
      fetchRfeRows(TABS.vawaNoDueDate, 1),
      fetchRfeRows(TABS.otherForms, 2),
      fetchGoals(),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    goalsError: goals.goalsError,
    ...buildRfeDashboard(
      dueDateRows,
      noDueDateRows,
      otherFormsRows,
      goals.metrics,
      goals.history
    ),
  };
}

export async function forwardToMetrics(
  path: "" | "/history",
  method: "POST" | "PUT",
  body: unknown
) {
  const res = await fetch(`${RFE_METRICS_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `El dashboard RFE respondió ${res.status}`);
  }
  return json;
}
