export function parseSheetDate(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// El servidor de Vercel corre en UTC: "hoy" se calcula con el
// calendario de la oficina para que la semana no cambie a las 6pm.
const BUSINESS_TIMEZONE =
  process.env.DASHBOARD_TIMEZONE || "America/Mexico_City";

export function businessToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(pick("year"), pick("month") - 1, pick("day"));
}

// ISO-8601 week: weeks start Monday, week 1 contains the year's first Thursday.
export function isoWeekInfo(date: Date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { year: d.getUTCFullYear(), week };
}

export function isoWeekKey(date: Date) {
  const { year, week } = isoWeekInfo(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
