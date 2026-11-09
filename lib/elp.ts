import { getSheets } from "@/lib/sheets";

/*
 * Regresos de ELP, Sheet "ENTREGAS VS REGRESOS".
 *
 * - ENVIOS SEMANALES: casos que mandamos a ELP por semana de envío,
 *   cruzados con su revisión (Corrections Needed: Yes / No /
 *   SIN REVISION).
 * - COPIA ELP: todo lo que ELP revisó, por fecha de revisión. Aquí
 *   la corrección sale de "Corrección hologada": hay error o no
 *   (NO ERROR / vacío = sin corrección). No se usan Notice Type,
 *   Case Type ni Corrections Needed; el tipo de caso es SUBTIPO PMO.
 *
 * Fechas: la Sheet convirtió como día/mes las fechas m/d en las
 * que el día era 12 o menos, así que en esas celdas el día y el
 * mes vienen invertidos. Las de texto vienen como m/d/aaaa.
 */
const ELP_SPREADSHEET_ID =
  process.env.ELP_SPREADSHEET_ID ||
  "1POTDJROdwXZDOvlE6aDOuA5eTJuEsGuOLgM3HGaNp5I";

const ENVIOS_TAB = "ENVIOS SEMANALES";
const COPIA_TAB = "COPIA ELP";

export type ElpCategoria = "VAWA" | "VAWA NDD" | "NON VAWA";

export type ElpEnvio = {
  cliente: string;
  tipo: string;
  form: string;
  categoria: ElpCategoria;
  subtipo: string;
  semana: string; // "2026-W45"
  revisado: boolean;
  semanaRevision: string | null;
  fechaRevision: string | null;
  regreso: boolean;
  correctionType: string;
  homologada: string[];
  equipo: string;
};

export type ElpRevision = {
  fecha: string;
  semana: string;
  cliente: string;
  caseType: string; // SUBTIPO PMO
  regreso: boolean;
  correctionType: string;
  homologada: string[];
  equipo: string;
  tl: string;
  colaborador: string;
};

export type ElpData = {
  envios: ElpEnvio[];
  revisiones: ElpRevision[];
  // Filas de COPIA ELP sin fecha legible (no entran en las semanas).
  sinFecha: number;
};

const text = (v: unknown) =>
  (v === null || v === undefined ? "" : String(v)).replace(/\s+/g, " ").trim();

const norm = (v: unknown) => text(v).toUpperCase();

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function validDate(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Número de serie (por defecto con día y mes invertidos) o texto m/d/aaaa.
export function parseElpDate(v: unknown, swapped = true): string | null {
  if (typeof v === "number" && v > 0) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    const y = dt.getUTCFullYear();
    const m = swapped ? dt.getUTCDate() : dt.getUTCMonth() + 1;
    const d = swapped ? dt.getUTCMonth() + 1 : dt.getUTCDate();
    return validDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  const s = text(v);
  const md = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (md) {
    const m = Number(md[1]);
    const d = Number(md[2]);
    const y = md[3].length === 2 ? 2000 + Number(md[3]) : Number(md[3]);
    return validDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch.slice(1, 4).join("-");
  return null;
}

// Semana ISO "aaaa-Www" de una fecha "aaaa-mm-dd".
export function isoWeekKey(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${pad(week)}`;
}

// ENVIOS solo trae el número de semana: se toma del año en curso,
// o del anterior si la semana todavía no llega.
function weekKeyFromNumber(n: number, today = new Date()) {
  const current = isoWeekKey(
    `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  );
  const [cy, cw] = current.split("-W").map(Number);
  const year = n > cw + 1 ? cy - 1 : cy;
  return `${year}-W${pad(n)}`;
}

function splitList(v: unknown) {
  return text(v)
    .split(/\s*[,;]\s*/)
    .map((s) => s.trim())
    .filter((s) => s && !/^NO ERROR$/i.test(s));
}

const isYes = (v: unknown) => /\bYES\b/.test(norm(v));
const isNo = (v: unknown) => /^NO\b/.test(norm(v)) && !isYes(v);

// VAWA NDD = VAWA con FORM NDD; VAWA = el resto de VAWA; NON VAWA = todo lo demás.
function categoria(tipo: string, form: string): ElpCategoria {
  const t = tipo.toUpperCase().replace(/[\s-]+/g, " ");
  if (t === "VAWA") return /NDD/i.test(form) ? "VAWA NDD" : "VAWA";
  return "NON VAWA";
}

// Subtipo = FORM; en NON VAWA se antepone el tipo (WITHDRAWAL, RESUBMISSION…).
function subtipo(tipo: string, form: string, cat: ElpCategoria) {
  const f = form || "Sin form";
  if (cat !== "NON VAWA") return f;
  const t = tipo.toUpperCase().replace(/[\s-]+/g, " ");
  return t && t !== "NON VAWA" ? `${tipo.toUpperCase()} · ${f}` : f;
}

function columnFinder(header: unknown[]) {
  const names = header.map(norm);
  return (...wanted: string[]) => {
    for (const w of wanted) {
      const i = names.indexOf(w);
      if (i >= 0) return i;
    }
    return -1;
  };
}

export function parseEnvios(values: unknown[][]): ElpEnvio[] {
  const col = columnFinder(values[0] || []);
  const c = {
    cliente: col("CLIENT", "CLIENTE"),
    tipo: col("TIPO"),
    form: col("FORM"),
    semana: col("SEMANA ENVIO A ELP", "SEMANA ENVÍO A ELP", "SEMANA"),
    fechaMx: col("FECHA MX"),
    semRev: col("SEM REV"),
    needed: col("CORRECTIONS NEEDED"),
    type: col("CORRECTION TYPE"),
    homologada: col("CORRECCIÓN HOLOGADA", "CORRECCION HOLOGADA", "CORRECCIÓN HOMOLOGADA"),
    equipo: col("EQUIPO A CARGO"),
  };
  const get = (row: unknown[], i: number) => (i >= 0 ? row[i] : "");

  const out: ElpEnvio[] = [];
  values.slice(1).forEach((row) => {
    const cliente = text(get(row, c.cliente));
    const semanaNum = Number(get(row, c.semana));
    if (!cliente || !Number.isFinite(semanaNum) || semanaNum <= 0) return;
    const tipo = text(get(row, c.tipo));
    const form = text(get(row, c.form)).toUpperCase();
    const cat = categoria(tipo, form);
    const needed = get(row, c.needed);
    const regreso = isYes(needed);
    const revisado = regreso || isNo(needed);
    // FECHA MX ya trae la fecha corregida: no se invierte.
    const fechaRevision = revisado ? parseElpDate(get(row, c.fechaMx), false) : null;
    const semRev = Number(get(row, c.semRev));
    out.push({
      cliente,
      tipo,
      form,
      categoria: cat,
      subtipo: subtipo(tipo, form, cat),
      semana: weekKeyFromNumber(Math.floor(semanaNum)),
      revisado,
      semanaRevision: revisado
        ? fechaRevision
          ? isoWeekKey(fechaRevision)
          : Number.isFinite(semRev) && semRev > 0
            ? weekKeyFromNumber(Math.floor(semRev))
            : null
        : null,
      fechaRevision,
      regreso,
      correctionType: regreso ? text(get(row, c.type)) : "",
      homologada: regreso ? splitList(get(row, c.homologada)) : [],
      equipo: regreso ? text(get(row, c.equipo)) : "",
    });
  });
  return out;
}

export function parseCopia(values: unknown[][]): { revisiones: ElpRevision[]; sinFecha: number } {
  const col = columnFinder(values[0] || []);
  const c = {
    fecha: col("COLUMNA 1", "FECHA", "DATE"),
    cliente: col("CLIENT NAME", "CLIENTE"),
    type: col("CORRECTION TYPE"),
    homologada: col("CORRECCIÓN HOLOGADA", "CORRECCION HOLOGADA", "CORRECCIÓN HOMOLOGADA"),
    equipo: col("EQUIPO A CARGO"),
    tl: col("TL"),
    colaborador: col("COLABORADOR"),
    subtipo: col("SUBTIPO PMO"),
  };
  const get = (row: unknown[], i: number) => (i >= 0 ? row[i] : "");

  const revisiones: ElpRevision[] = [];
  let sinFecha = 0;
  values.slice(1).forEach((row) => {
    const cliente = text(get(row, c.cliente));
    if (!cliente) return;
    const fecha = parseElpDate(get(row, c.fecha));
    if (!fecha) {
      sinFecha++;
      return;
    }
    const homologada = splitList(get(row, c.homologada));
    const regreso = homologada.length > 0;
    revisiones.push({
      fecha,
      semana: isoWeekKey(fecha),
      cliente,
      caseType: norm(get(row, c.subtipo)),
      regreso,
      correctionType: regreso ? text(get(row, c.type)) : "",
      homologada,
      equipo: regreso ? text(get(row, c.equipo)) : "",
      tl: regreso ? norm(get(row, c.tl)) : "",
      colaborador: regreso ? norm(get(row, c.colaborador)) : "",
    });
  });
  return { revisiones, sinFecha };
}

export async function loadElp(): Promise<ElpData> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: ELP_SPREADSHEET_ID,
    ranges: [`'${ENVIOS_TAB}'!A1:Z`, `'${COPIA_TAB}'!A1:Z`],
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  const [envios, copia] = (res.data.valueRanges || []).map(
    (r) => (r.values || []) as unknown[][]
  );
  return { envios: parseEnvios(envios || []), ...parseCopia(copia || []) };
}
