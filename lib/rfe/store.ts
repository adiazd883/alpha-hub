import { RFE_CATEGORIES } from "./config";
import type {
  Counts,
  ManualMetrics,
  MetricsHistory,
} from "./logic";

/*
 * Misma base Upstash Redis que el dashboard "Estatus General
 * RFE" (conectada a los dos proyectos en Vercel). Las llaves
 * dashboard:* son las suyas y se guardan con el mismo formato
 * que @vercel/kv (JSON), así que ambos leen lo mismo.
 */
const MANUAL_METRICS_KEY = "dashboard:manual-metrics-v2";
const METRICS_HISTORY_KEY = "dashboard:metrics-history-v1";
const PRODUCTIVITY_KEY = "hub:vawa-productivity-v1";

function credentials() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Falta conectar la base Upstash (KV_REST_API_URL / KV_REST_API_TOKEN)"
    );
  }

  return { url, token };
}

export async function redis(command: (string | number)[]) {
  const { url, token } = credentials();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json.error || `Upstash respondió ${res.status}`);
  }
  return json.result;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await redis(["GET", key]);
  if (raw === null || raw === undefined) return null;
  return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
}

export async function setJson(key: string, value: unknown) {
  await redis(["SET", key, JSON.stringify(value)]);
}

const zeros = () =>
  Object.fromEntries(RFE_CATEGORIES.map((c) => [c, 0])) as Counts;

// --- Metas y avance manual (igual que lib/kv.js del dashboard RFE) ---

export async function getManualMetrics(): Promise<ManualMetrics> {
  const stored = (await getJson<Partial<ManualMetrics>>(MANUAL_METRICS_KEY)) || {};
  return {
    ...stored,
    weeklyGoal: { ...zeros(), ...(stored.weeklyGoal || {}) },
    monthlyGoal: { ...zeros(), ...(stored.monthlyGoal || {}) },
    otherFormsProgress: {
      weekly: 0,
      monthly: 0,
      ...(stored.otherFormsProgress || {}),
    },
  };
}

export async function getMetricsHistory(): Promise<MetricsHistory> {
  const stored = (await getJson<Partial<MetricsHistory>>(METRICS_HISTORY_KEY)) || {};
  return {
    weekly: stored.weekly || {},
    monthly: stored.monthly || {},
  };
}

/*
 * "Guardar" del periodo en curso: metas + avance manual, y una
 * foto de la semana y el mes con el avance de ese momento.
 */
export async function saveCurrentMetrics(input: {
  weeklyGoal: Counts;
  monthlyGoal: Counts;
  otherFormsProgress: { weekly: number; monthly: number };
  weekKey: string;
  weeklyActual: Counts;
  monthKey: string;
  monthlyActual: Counts;
}) {
  const current = await getManualMetrics();
  await setJson(MANUAL_METRICS_KEY, {
    ...current,
    weeklyGoal: input.weeklyGoal,
    monthlyGoal: input.monthlyGoal,
    otherFormsProgress: input.otherFormsProgress,
    updatedAt: new Date().toISOString(),
  });

  const history = await getMetricsHistory();
  const updatedAt = new Date().toISOString();
  history.weekly[input.weekKey] = {
    goal: input.weeklyGoal,
    actual: input.weeklyActual,
    updatedAt,
  };
  history.monthly[input.monthKey] = {
    goal: input.monthlyGoal,
    actual: input.monthlyActual,
    updatedAt,
  };
  await setJson(METRICS_HISTORY_KEY, history);
}

export async function saveHistoryEntries(
  entries: {
    period: "weekly" | "monthly";
    key: string;
    goal: Counts;
    actual: Counts;
  }[]
) {
  const history = await getMetricsHistory();
  const updatedAt = new Date().toISOString();
  for (const { period, key, goal, actual } of entries) {
    history[period][key] = { goal, actual, updatedAt };
  }
  await setJson(METRICS_HISTORY_KEY, history);
}

// --- Productividad mensual VAWA (valores capturados a mano) ---

export type ProductivityEntry = {
  goal: number | null;
  actual: number | null;
};

// Llave "YYYY-MM".
export type Productivity = Record<string, ProductivityEntry>;

/*
 * Valores de las gráficas que se llevaban a mano. Antes los
 * casos se borraban de la Sheet al enviarse a USCIS, así que
 * estos meses no se pueden recalcular.
 */
const PRODUCTIVITY_SEED: Productivity = {
  "2025-01": { goal: null, actual: 15 },
  "2025-02": { goal: null, actual: 24 },
  "2025-03": { goal: null, actual: 33 },
  "2025-04": { goal: null, actual: 34 },
  "2025-05": { goal: null, actual: 42 },
  "2025-06": { goal: null, actual: 40 },
  "2025-07": { goal: null, actual: 79 },
  "2025-08": { goal: null, actual: 97 },
  "2025-09": { goal: null, actual: 163 },
  "2025-10": { goal: null, actual: 123 },
  "2025-11": { goal: null, actual: 64 },
  "2025-12": { goal: null, actual: 56 },
  "2026-01": { goal: 51, actual: 51 },
  "2026-02": { goal: 56, actual: 56 },
  "2026-03": { goal: 60, actual: 60 },
  "2026-04": { goal: 56, actual: 56 },
  "2026-05": { goal: 64, actual: 60 },
  "2026-06": { goal: 66, actual: 64 },
  "2026-07": { goal: 92, actual: 92 },
  "2026-08": { goal: 77, actual: 69 },
};

export async function getProductivity(): Promise<Productivity> {
  return (await getJson<Productivity>(PRODUCTIVITY_KEY)) || PRODUCTIVITY_SEED;
}

export async function saveProductivity(value: Productivity) {
  await setJson(PRODUCTIVITY_KEY, value);
}
