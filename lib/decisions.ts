import { getSheets } from "@/lib/sheets";
import { parseFecha } from "@/lib/atty";
import { DECISION_INTERNO_DIAS, type DecisionCase } from "@/lib/decisions-types";

export * from "@/lib/decisions-types";

/*
 * Decisions (I-290B), Sheet "WORKFLOW DECISIONS", pestaña DAILY 290.
 * - Activos: EVIDENCE STATUS Atty Review, Working o Ready MGM Review.
 * - Deadline con USCIS: DATE DD.
 * - Deadline interno: 5 días antes; si cae en domingo, el sábado.
 * Cada fila es una forma; las del mismo cliente y mismo DATE DD se
 * juntan en un solo caso.
 */
const DECISIONS_SPREADSHEET_ID =
  process.env.DECISIONS_SPREADSHEET_ID ||
  "1dFXmlnNOguRTdWpyN0r88cPLt_B5FyA0UPog4HB5zWs";
const DAILY_TAB = "DAILY 290";

// En orden de avance.
const ACTIVOS = ["WORKING", "ATTY REVIEW", "READY MGM REVIEW"];
const norm = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toUpperCase();

const isoUTC = (d: Date) => d.toISOString().slice(0, 10);

// Serial de Sheets (días desde 1899-12-30) o texto m/d/aaaa.
function fecha(v: unknown): string | null {
  if (typeof v === "number" && v > 20000) {
    return isoUTC(new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000));
  }
  const s = String(v ?? "").trim();
  return s ? parseFecha(s) : null;
}

export function deadlineInterno(uscis: string): string {
  const [y, m, d] = uscis.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - DECISION_INTERNO_DIAS));
  if (t.getUTCDay() === 0) t.setUTCDate(t.getUTCDate() - 1);
  return isoUTC(t);
}

export function buildDecisions(values: unknown[][]): DecisionCase[] {
  const headers = (values[0] || []).map(norm);
  const col = (name: string) => headers.indexOf(name);
  const iCliente = col("CLIENT");
  const iForm = col("FORM DENIED");
  const iStatus = col("EVIDENCE STATUS");
  const iDd = col("DATE DD");
  const missing = [
    ["CLIENT", iCliente],
    ["EVIDENCE STATUS", iStatus],
    ["DATE DD", iDd],
  ].filter(([, i]) => i === -1);
  if (missing.length) {
    throw new Error(`DAILY 290: no se encontró la columna ${missing.map(([n]) => n).join(", ")}`);
  }

  const casos = new Map<string, DecisionCase>();
  values.slice(1).forEach((r) => {
    const status = String(r[iStatus] ?? "").trim();
    if (!ACTIVOS.includes(norm(status))) return;
    const dd = fecha(r[iDd]);
    if (!dd) return;
    const cliente = String(r[iCliente] ?? "").trim() || "(sin nombre)";
    const form = iForm >= 0 ? String(r[iForm] ?? "").trim() : "";
    const key = `${norm(cliente)}|${dd}`;
    const c = casos.get(key);
    if (c) {
      if (form && !c.forms.includes(form)) c.forms.push(form);
      // Si las formas van en distinto paso, se muestra el más atrasado.
      if (ACTIVOS.indexOf(norm(status)) < ACTIVOS.indexOf(norm(c.status))) c.status = status;
      return;
    }
    casos.set(key, {
      key,
      cliente,
      forms: form ? [form] : [],
      status,
      deadlineUscis: dd,
      deadlineInterno: deadlineInterno(dd),
    });
  });
  return [...casos.values()].sort((a, b) => a.deadlineUscis.localeCompare(b.deadlineUscis));
}

export async function loadDecisions(): Promise<DecisionCase[]> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: DECISIONS_SPREADSHEET_ID,
    range: `'${DAILY_TAB}'!A1:AZ3000`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  return buildDecisions((res.data.values || []) as unknown[][]);
}
