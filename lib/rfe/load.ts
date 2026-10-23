import { TABS } from "./config";
import { fetchRfeRows } from "./sheet";
import { buildProductivity, buildRfeDashboard } from "./logic";
import {
  getManualMetrics,
  getMetricsHistory,
  getProductivity,
} from "./store";

/*
 * Las metas y los cierres no deben tumbar el dashboard: si la
 * base no responde, inventario y llegadas se muestran igual.
 */
async function loadGoals() {
  try {
    const [metrics, history, productivity] = await Promise.all([
      getManualMetrics(),
      getMetricsHistory(),
      getProductivity(),
    ]);
    return { metrics, history, productivity, goalsError: null };
  } catch (e) {
    return {
      metrics: null,
      history: null,
      productivity: {},
      goalsError: `No se pudieron leer las metas (${
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
      loadGoals(),
    ]);

  const dashboard = buildRfeDashboard(
    dueDateRows,
    noDueDateRows,
    otherFormsRows,
    goals.metrics,
    goals.history
  );

  return {
    generatedAt: new Date().toISOString(),
    goalsError: goals.goalsError,
    ...dashboard,
    productivity: buildProductivity(
      goals.productivity,
      dashboard.goals.monthly,
      dashboard.currentMonth
    ),
  };
}
