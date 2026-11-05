import { getSheets } from "@/lib/sheets";
import { parseFecha } from "@/lib/atty";
import { NOID_FAMILY, RFE_FAMILY, TABS } from "./config";
import { fetchRfeRows } from "./sheet";

/*
 * Llegadas mensuales 2025–2026 para el dashboard general.
 * - VAWA: pestaña "General" de "Admin TLs RFE" y de "ADMIN TLs 2.0"
 *   (la segunda continúa a la primera), por la fecha REGISTERED
 *   (cuando nos llega, no la fecha de recibo). VAWA NDD sale de la
 *   pestaña "NO DUE DATE CONSULTA" de la 2.0, por RECEIPT DATE.
 * - NON VAWA: "RFE's (other forms)" de la Sheet general de RFE, por
 *   "Date on Dropbox": RFE, NOID y Otros (lo demás).
 */
const ADMIN_TLS = [
  process.env.ADMIN_TLS_SPREADSHEET_ID || "1bRgXVfuxOxu96ir7-mAzUOzDRmGMzOo5vyPUggL0ADo",
  process.env.ADMIN_TLS_2_SPREADSHEET_ID || "13bFx3F_VldwYKOehpsl6ndJmSVB64TAFUbYVRrC1nNE",
];

export const LLEGADAS_DESDE = "2025-01";

export type VawaMes = { mes: string; dd: number; noid: number; ndd: number };
export type NonVawaMes = { mes: string; rfe: number; noid: number; otros: number };

export type LlegadasData = {
  vawa: VawaMes[];
  nonVawa: NonVawaMes[];
  // Casos que aparecen en las dos Sheets con la misma fecha (se cuentan una vez).
  repetidos: number;
  sinFecha: { vawa: number; nonVawa: number };
  // Tipos de NON VAWA que se cuentan como "Otros", con cuántos hay.
  otrosTipos: { tipo: string; n: number }[];
};

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();

// En "General": NOID si la casilla NOID (2.0) está marcada; si no, DD.
const tipoGeneral = (row: Record<string, string>): "dd" | "noid" =>
  row["NOID"]?.toUpperCase() === "TRUE" ? "noid" : "dd";

function meses(hasta: string) {
  const out: string[] = [];
  let [y, m] = LLEGADAS_DESDE.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= hasta) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function leerPestana(spreadsheetId: string, tab: string) {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tab.replace(/'/g, "''")}'!A2:ZZ`,
  });
  const [headers = [], ...rows] = (res.data.values || []) as unknown[][];
  const h = headers.map(text);
  return rows
    .filter((r) => text(r[0]))
    .map((r) => {
      const obj: Record<string, string> = {};
      h.forEach((name, i) => {
        const k = name.trim();
        if (k && !(k in obj)) obj[k] = text(r[i]);
      });
      return obj;
    });
}

export async function loadLlegadas(): Promise<LlegadasData> {
  const [tls1, tls2, ndd, otherForms] = await Promise.all([
    leerPestana(ADMIN_TLS[0], "General"),
    leerPestana(ADMIN_TLS[1], "General"),
    leerPestana(ADMIN_TLS[1], "NO DUE DATE CONSULTA"),
    fetchRfeRows(TABS.otherForms, 2),
  ]);

  const hoy = new Date().toISOString().slice(0, 7);
  const lista = meses(hoy > "2026-12" ? "2026-12" : hoy);
  const vawa = new Map(lista.map((mes) => [mes, { mes, dd: 0, noid: 0, ndd: 0 }]));
  const nonVawa = new Map(lista.map((mes) => [mes, { mes, rfe: 0, noid: 0, otros: 0 }]));
  const otros = new Map<string, number>();
  const sinFecha = { vawa: 0, nonVawa: 0 };

  const caseKey = (row: Record<string, string>, fecha: string) =>
    `${row["RECEIPT NUMBER"] || row["ID"] || row["CLIENTE"] || row["CLIENT"]}|${fecha}`.toUpperCase();

  /*
   * VAWA NDD: "NO DUE DATE CONSULTA", por RECEIPT DATE. Si el mismo
   * recibo también está en "General", cuenta solo como NDD.
   */
  const recibo = (row: Record<string, string>) =>
    (row["RECEIPT NUMBER"] || row["ID"] || row["CLIENTE"] || row["CLIENT"] || "").toUpperCase();
  const casosNdd = new Set<string>();
  ndd.forEach((row) => {
    const fecha = parseFecha(row["RECEIPT DATE"]);
    if (!fecha) {
      sinFecha.vawa += 1;
      return;
    }
    if (casosNdd.has(recibo(row))) return;
    casosNdd.add(recibo(row));
    const bucket = vawa.get(fecha.slice(0, 7));
    if (bucket) bucket.ndd += 1;
  });

  /*
   * Mismo caso en las dos Sheets (mismo recibo y misma fecha
   * REGISTERED): se cuenta una vez, con los datos de la 2.0.
   */
  const casos = new Map<string, Record<string, string>>();
  let repetidos = 0;
  [tls1, tls2].forEach((rows) =>
    rows.forEach((row) => {
      const fecha = parseFecha(row["REGISTERED"]);
      if (!fecha) {
        sinFecha.vawa += 1;
        return;
      }
      if (casosNdd.has(recibo(row))) return;
      const key = caseKey(row, fecha);
      if (casos.has(key)) repetidos += 1;
      casos.set(key, { ...row, __fecha: fecha });
    })
  );
  casos.forEach((row) => {
    const bucket = vawa.get(row.__fecha.slice(0, 7));
    if (bucket) bucket[tipoGeneral(row)] += 1;
  });

  otherForms.forEach((row) => {
    const tipo = (row["RFE or NOID"] || "").trim().toUpperCase();
    // RFE y NOID (con su variante VISA T); todo lo demás es "Otros".
    const family = NOID_FAMILY.includes(tipo) ? "noid" : RFE_FAMILY.includes(tipo) ? "rfe" : "otros";
    const fecha = parseFecha(row["Date on Dropbox"]);
    if (!fecha) {
      sinFecha.nonVawa += 1;
      return;
    }
    const bucket = nonVawa.get(fecha.slice(0, 7));
    if (!bucket) return;
    bucket[family] += 1;
    if (family === "otros") otros.set(tipo || "(sin tipo)", (otros.get(tipo || "(sin tipo)") || 0) + 1);
  });

  return {
    vawa: [...vawa.values()],
    nonVawa: [...nonVawa.values()],
    repetidos,
    sinFecha,
    otrosTipos: [...otros.entries()].map(([tipo, n]) => ({ tipo, n })).sort((a, b) => b.n - a.n),
  };
}
