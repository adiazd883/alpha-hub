import { getSheets } from "@/lib/sheets";

/*
 * Histórico de RFEs VAWA (Sheet "HISTÓRICO RFE 360"). Hay una
 * pestaña por año ("2020.", "2021.", …) con los recibos de ese
 * año. Al navegador solo salen conteos, nunca datos de clientes.
 */
const HISTORICO_SPREADSHEET_ID =
  process.env.HISTORICO_SPREADSHEET_ID ||
  "1RjaH0dQ0M-Q-b_j06bipOlNZW5EiinutzfW96rseQxE";

const YEAR_TAB = /^(\d{4})\.?$/;

// Las solicitudes del RFE van de esta columna hasta antes de CASE STATUS.
const FIRST_REQUEST = "INCOMPLETE PETITION";
const AFTER_LAST_REQUEST = "CASE STATUS";

export type ReceiptType = "dd" | "ndd" | "noid";

export type HistoricoMonth = Record<ReceiptType, number>;

export type HistoricoYear = {
  year: number;
  total: number;
  months: HistoricoMonth[];
  // Recibos cuya fecha no cae en el año de la pestaña.
  outOfYear: number;
  requests: { name: string; count: number }[];
  uscisYears: { year: number | null; count: number }[];
};

export type HistoricoData = {
  generatedAt: string;
  years: HistoricoYear[];
};

const text = (v: unknown) =>
  (v === null || v === undefined ? "" : String(v)).trim();

const checked = (v: unknown) =>
  v === true || text(v).toUpperCase() === "TRUE";

// Con UNFORMATTED_VALUE las fechas llegan como número de serie.
function cellDate(v: unknown) {
  if (typeof v === "number" && v > 0) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
  }
  const s = text(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const cellYear = (v: unknown) => {
  const d = cellDate(v);
  return d ? d.getUTCFullYear() : null;
};

// RFE DEADLINE: casilla, o el texto "DUE DATE" / "NO DUE DATE".
function hasDeadline(v: unknown) {
  if (v === true) return true;
  const s = text(v).toUpperCase();
  return s === "TRUE" || (s.includes("DUE") && !s.startsWith("NO"));
}

function receiptType(deadline: unknown, rfeNoid: unknown): ReceiptType {
  if (!hasDeadline(deadline)) return "ndd";
  // NOID y NOIR van juntos.
  return text(rfeNoid).toUpperCase().startsWith("NO") ? "noid" : "dd";
}

function summarizeYear(year: number, values: unknown[][]): HistoricoYear {
  const headers = (values[0] || []).map((h) => text(h).toUpperCase());
  const col = (name: string) => headers.indexOf(name);
  const get = (row: unknown[], name: string) => row[col(name)];

  const first = col(FIRST_REQUEST);
  const end = col(AFTER_LAST_REQUEST);
  const requestCols =
    first >= 0 && end > first
      ? headers.slice(first, end).map((name, i) => ({ name, i: first + i }))
      : [];

  const months: HistoricoMonth[] = Array.from({ length: 12 }, () => ({
    dd: 0,
    ndd: 0,
    noid: 0,
  }));
  const requests = requestCols.map((c) => ({ name: c.name, count: 0 }));
  const uscis = new Map<number | null, number>();
  let total = 0;
  let outOfYear = 0;

  for (const row of values.slice(1)) {
    if (!text(get(row, "FECHA DEL RECIBO")) && !text(get(row, "RECEIPT NUMBER"))) {
      continue;
    }
    total += 1;

    const receipt = cellDate(get(row, "FECHA DEL RECIBO"));
    if (receipt && receipt.getUTCFullYear() === year) {
      const type = receiptType(get(row, "RFE DEADLINE"), get(row, "RFE/NOID"));
      months[receipt.getUTCMonth()][type] += 1;
    } else {
      outOfYear += 1;
    }

    requestCols.forEach((c, k) => {
      if (checked(row[c.i])) requests[k].count += 1;
    });

    const uscisYear = cellYear(get(row, "FECHA QUE LLEGÓ CON USCIS"));
    uscis.set(uscisYear, (uscis.get(uscisYear) || 0) + 1);
  }

  return {
    year,
    total,
    months,
    outOfYear,
    requests: requests.sort((a, b) => b.count - a.count),
    uscisYears: [...uscis.entries()]
      .map(([y, count]) => ({ year: y, count }))
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999)),
  };
}

export async function loadHistorico(): Promise<HistoricoData> {
  const sheets = await getSheets();

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: HISTORICO_SPREADSHEET_ID,
    fields: "sheets.properties.title",
  });

  const tabs = (meta.data.sheets || [])
    .map((s) => s.properties?.title || "")
    .map((title) => ({ title, match: YEAR_TAB.exec(title.trim()) }))
    .filter((t) => t.match)
    .map((t) => ({ title: t.title, year: Number(t.match![1]) }))
    .sort((a, b) => a.year - b.year);

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: HISTORICO_SPREADSHEET_ID,
    ranges: tabs.map((t) => `'${t.title.replace(/'/g, "''")}'!A:AZ`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });

  const ranges = res.data.valueRanges || [];

  return {
    generatedAt: new Date().toISOString(),
    years: tabs.map((t, i) =>
      summarizeYear(t.year, (ranges[i]?.values as unknown[][]) || [])
    ),
  };
}
