import {
  ARRIVALS_MIN_WEEK,
  ARRIVALS_YEAR,
  ARRIVAL_DATE_COLUMNS,
  EXCLUDED_TYPES,
  INVENTORY_STATUSES_OTHER,
  INVENTORY_STATUSES_VAWA,
  INVENTORY_STATUSES_VAWA_NDD,
  NOID_FAMILY,
  RFE_CATEGORIES,
  RFE_FAMILY,
  type RfeCategory,
} from "./config";
import {
  businessToday,
  isoWeekInfo,
  isoWeekKey,
  parseSheetDate,
} from "./dates";

/*
 * Mismas reglas que lib/businessLogic.js del dashboard
 * "Estatus General RFE". Aquí solo se calculan totales:
 * nada de nombres de cliente ni receipt numbers sale de
 * este módulo.
 */

type Row = Record<string, string>;
type Family = "RFE" | "NOID";

function norm(v: string | undefined) {
  return (v || "").trim().toUpperCase();
}

function typeFamily(typeRaw: string | undefined): Family | null {
  const t = norm(typeRaw);
  if (NOID_FAMILY.includes(t)) return "NOID";
  if (RFE_FAMILY.includes(t)) return "RFE";
  return null;
}

function isVisaT(typeRaw: string | undefined) {
  return norm(typeRaw).includes("VISA T");
}

export type InventoryBox = {
  total: number;
  rfe: number;
  noid: number;
  milestoneCount: number;
};

type InventoryItem = {
  family: Family | null;
  milestone: boolean;
};

function box(items: InventoryItem[]): InventoryBox {
  // RFE/NOID cuentan solo lo que aún no llega al hito.
  const open = items.filter((r) => !r.milestone);
  return {
    total: items.length,
    rfe: open.filter((r) => r.family === "RFE").length,
    noid: open.filter((r) => r.family === "NOID").length,
    milestoneCount: items.filter((r) => r.milestone).length,
  };
}

// --- Tab 1: VAWA con deadline -> VAWA DD (sin VISA T) y VISA T ---
function processVawaDueDate(rows: Row[]) {
  const items: (InventoryItem & { visaT: boolean })[] = [];
  const delivered = { vawaDD: [] as Date[], visaT: [] as Date[] };

  for (const row of rows) {
    const typeRaw = row["RFE or NOID"];
    if (!typeRaw || EXCLUDED_TYPES.includes(norm(typeRaw))) continue;
    const family = typeFamily(typeRaw);
    if (!family) continue;

    const sentToReview = parseSheetDate(row["READY FOR MGM REVIEW"]);
    const visaT = isVisaT(typeRaw);

    // La entrega a revisión cuenta para las metas aunque el caso
    // ya no esté activo (ej. "Sent to USCIS").
    if (sentToReview) {
      (visaT ? delivered.visaT : delivered.vawaDD).push(sentToReview);
    }

    if (!INVENTORY_STATUSES_VAWA.includes(norm(row["EVIDENCE (RFE)"]))) continue;

    items.push({ family, milestone: Boolean(sentToReview), visaT });
  }

  return {
    vawaDD: box(items.filter((r) => !r.visaT)),
    visaT: box(items.filter((r) => r.visaT)),
    delivered,
  };
}

// --- Tab 2: VAWA sin deadline (solo RFE) ---
function processVawaNoDueDate(rows: Row[]) {
  const items: InventoryItem[] = [];
  const delivered: Date[] = [];

  for (const row of rows) {
    const sentToReview = parseSheetDate(row["READY FOR MGM REVIEW"]);
    if (sentToReview) delivered.push(sentToReview);

    // Sin cliente ni recibo es una fila en blanco, no un caso.
    if (!(row["CLIENT"] || "").trim() && !(row["RECEIPT NUMBER"] || "").trim()) continue;

    if (!INVENTORY_STATUSES_VAWA_NDD.includes(norm(row["EVIDENCE (RFE)"]))) continue;

    items.push({ family: "RFE", milestone: Boolean(sentToReview) });
  }

  return { box: box(items), delivered };
}

// --- Tab 3: Other forms (NON-VAWA) ---
function processOtherForms(rows: Row[]) {
  const items: InventoryItem[] = [];

  for (const row of rows) {
    const typeRaw = row["RFE or NOID"];
    if (!typeRaw || !typeRaw.trim()) continue;

    const status = norm(row["STATUS"]);
    if (!INVENTORY_STATUSES_OTHER.includes(status)) continue;

    items.push({
      family: typeFamily(typeRaw),
      milestone: status === "READY TO PRINT",
    });
  }

  return box(items);
}

// --- Llegadas semanales (RFE vs NOID) ---

// Solo estos tipos exactos cuentan como llegada; DECISION, WAIVER,
// I-290, I-485, etc. quedan fuera.
const ARRIVAL_ALLOWED_TYPES = ["RFE", "RFE VISA T", "NOID", "NOID VISA T", "NOIR", "NOIR VISA T"];

function isArrivalEligibleType(typeRaw: string | undefined) {
  const t = norm(typeRaw);
  if (!t || t.includes("485")) return false;
  return ARRIVAL_ALLOWED_TYPES.includes(t);
}

export type ArrivalWeek = {
  weekKey: string;
  rfe: number;
  noid: number;
};

function bucketArrivalsByWeek(
  rows: Row[],
  dateColumn: string,
  familyOf: (row: Row) => Family | null,
  includeRow?: (row: Row) => boolean
): ArrivalWeek[] {
  const buckets = new Map<string, ArrivalWeek>();

  for (const row of rows) {
    if (includeRow && !includeRow(row)) continue;

    const family = familyOf(row);
    if (!family) continue;

    const date = parseSheetDate(row[dateColumn]);
    if (!date) continue;

    const { year, week } = isoWeekInfo(date);
    if (year !== ARRIVALS_YEAR || week < ARRIVALS_MIN_WEEK) continue;

    const weekKey = isoWeekKey(date);
    const bucket = buckets.get(weekKey) || { weekKey, rfe: 0, noid: 0 };
    if (family === "NOID") bucket.noid += 1;
    else bucket.rfe += 1;
    buckets.set(weekKey, bucket);
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.weekKey.localeCompare(b.weekKey)
  );
}

function computeWeeklyArrivals(
  dueDateRows: Row[],
  noDueDateRows: Row[],
  otherFormsRows: Row[]
): Record<RfeCategory, ArrivalWeek[]> {
  const dueFamily = (row: Row) => typeFamily(row["RFE or NOID"]);
  const dueInclude = (row: Row) => isArrivalEligibleType(row["RFE or NOID"]);

  return {
    vawaDD: bucketArrivalsByWeek(
      dueDateRows.filter((r) => !isVisaT(r["RFE or NOID"])),
      ARRIVAL_DATE_COLUMNS.vawaDueDate,
      dueFamily,
      dueInclude
    ),
    vawaNDD: bucketArrivalsByWeek(
      noDueDateRows,
      ARRIVAL_DATE_COLUMNS.vawaNoDueDate,
      () => "RFE"
    ),
    visaT: bucketArrivalsByWeek(
      dueDateRows.filter((r) => isVisaT(r["RFE or NOID"])),
      ARRIVAL_DATE_COLUMNS.vawaDueDate,
      dueFamily,
      dueInclude
    ),
    otherForms: bucketArrivalsByWeek(
      otherFormsRows,
      ARRIVAL_DATE_COLUMNS.otherForms,
      dueFamily,
      dueInclude
    ),
  };
}

// --- Metas semanales: meta (línea) vs avance (barras) ---

type Counts = Record<RfeCategory, number>;

export type ManualMetrics = {
  weeklyGoal: Counts;
  otherFormsProgress: { weekly: number };
};

export type MetricsHistory = {
  weekly: Record<string, { goal?: Partial<Counts>; actual?: Partial<Counts> }>;
};

export type GoalWeek = {
  weekKey: string;
  goal: number | null;
  actual: number | null;
};

function countByWeek(dates: Date[]) {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = isoWeekKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/*
 * Semana actual: meta vigente + avance en vivo (Other forms es
 * manual). Semanas pasadas: la meta guardada en el histórico y
 * el avance recalculado desde "READY FOR MGM REVIEW"; Other forms
 * no tiene esa fecha en la Sheet, así que usa el histórico.
 */
function computeWeeklyGoals(
  delivered: Record<"vawaDD" | "vawaNDD" | "visaT", Date[]>,
  metrics: ManualMetrics | null,
  history: MetricsHistory | null
): Record<RfeCategory, GoalWeek[]> {
  const currentWeek = isoWeekKey(businessToday());
  const weeks = Array.from(
    new Set([...Object.keys(history?.weekly || {}), currentWeek])
  )
    .filter((key) => key <= currentWeek)
    .sort();

  const counted = {
    vawaDD: countByWeek(delivered.vawaDD),
    vawaNDD: countByWeek(delivered.vawaNDD),
    visaT: countByWeek(delivered.visaT),
  };

  const result = {} as Record<RfeCategory, GoalWeek[]>;

  for (const category of RFE_CATEGORIES) {
    result[category] = weeks.map((weekKey) => {
      const isCurrent = weekKey === currentWeek;
      const saved = history?.weekly[weekKey];

      const goal = isCurrent
        ? metrics?.weeklyGoal[category] ?? null
        : saved?.goal?.[category] ?? null;

      const actual =
        category === "otherForms"
          ? isCurrent
            ? metrics?.otherFormsProgress.weekly ?? null
            : saved?.actual?.otherForms ?? null
          : counted[category].get(weekKey) || 0;

      return { weekKey, goal, actual };
    });
  }

  return result;
}

export function buildRfeDashboard(
  dueDateRows: Row[],
  noDueDateRows: Row[],
  otherFormsRows: Row[],
  metrics: ManualMetrics | null,
  history: MetricsHistory | null
) {
  const due = processVawaDueDate(dueDateRows);
  const noDue = processVawaNoDueDate(noDueDateRows);

  return {
    inventory: {
      vawaDD: due.vawaDD,
      vawaNDD: noDue.box,
      visaT: due.visaT,
      otherForms: processOtherForms(otherFormsRows),
    } satisfies Record<RfeCategory, InventoryBox>,
    arrivals: computeWeeklyArrivals(dueDateRows, noDueDateRows, otherFormsRows),
    goals: computeWeeklyGoals(
      {
        vawaDD: due.delivered.vawaDD,
        vawaNDD: noDue.delivered,
        visaT: due.delivered.visaT,
      },
      metrics,
      history
    ),
    currentWeek: isoWeekKey(businessToday()),
  };
}

export type RfeDashboardData = ReturnType<typeof buildRfeDashboard> & {
  generatedAt: string;
  goalsError: string | null;
};
