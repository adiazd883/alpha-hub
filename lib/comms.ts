import { getSheets } from "@/lib/sheets";
import { spreadsheetIdFor } from "@/lib/celulas";
import { USER_NAMES, type Role } from "@/lib/auth";
import { redis } from "@/lib/rfe/store";

/*
 * Pestaña de comunicaciones de cada célula. Es una sola pestaña
 * para todo el equipo, así que al registrar se busca la primera
 * fila libre con un candado (Upstash) para que dos personas no
 * escriban en la misma fila. Las filas ya traen casillas y la
 * fórmula de semana prellenadas: "libre" = sin cliente,
 * colaborador ni fecha.
 */
export type CommsVista = "alpha" | "gamma" | "gmc";

export type CommsField =
  | "cliente"
  | "colaborador"
  | "posicion"
  | "fecha"
  | "duracion"
  | "cantidad"
  | "medio"
  | "status"
  | "type"
  | "mensajeTramcase"
  | "notaTramcase"
  | "documento"
  | "link"
  | "notas";

type Layout = { tab: string; lastCol: string; cols: Partial<Record<CommsField, string>> };

// Alpha y Gamma tienen el mismo formato; GMC cambia.
const CELULA_LAYOUT: Omit<Layout, "tab"> = {
  lastCol: "L",
  cols: {
    cliente: "A",
    colaborador: "B",
    posicion: "C",
    fecha: "D",
    duracion: "E",
    medio: "F",
    status: "G",
    mensajeTramcase: "H",
    notaTramcase: "I",
    documento: "J",
    link: "K",
    notas: "L",
  },
};

const LAYOUTS: Record<CommsVista, Layout> = {
  alpha: { tab: "COMUNICACIONES", ...CELULA_LAYOUT },
  gamma: { tab: "COMUNICACIONES", ...CELULA_LAYOUT },
  gmc: {
    tab: "COMUNICACIONES GMC",
    lastCol: "J",
    cols: {
      cliente: "A",
      colaborador: "B",
      fecha: "C",
      cantidad: "D",
      medio: "E",
      type: "F",
      mensajeTramcase: "G",
      notaTramcase: "H",
      documento: "I",
      notas: "J",
    },
  },
};

const GMC_SPREADSHEET_ID =
  process.env.GMC_SPREADSHEET_ID || "1T3HrAB-P6lAnTnj7qSCCZOq8vEMJHCqDeV4T-F9vH6Y";

const spreadsheetOf = (vista: CommsVista) =>
  vista === "gmc" ? GMC_SPREADSHEET_ID : spreadsheetIdFor(vista);

// Opciones base; se suman las que ya existen en la Sheet.
const BASE_OPTIONS: Record<CommsVista, { medio: string[]; status: string[]; type: string[] }> = {
  alpha: {
    medio: ["8X8 LLAMADA", "8X8 MENSAJE", "LLAMADA TRAMCASE", "MENSAJE TRAMCASE", "WHATSAPP MSJ", "WHATSAPP LLAMADA", "CORREO GMAIL", "CORREO OUTLOOK", "LLAMADA POR MEET", "ZOOM"],
    status: ["COMUNICACIÓN EFECTIVA", "COMUNICACIÓN NO EFECTIVA"],
    type: [],
  },
  gamma: {
    medio: ["8X8 LLAMADA", "8X8 MENSAJE", "LLAMADA TRAMCASE", "MENSAJE TRAMCASE", "WHATSAPP MSJ", "WHATSAPP LLAMADA", "CORREO GMAIL", "CORREO OUTLOOK", "LLAMADA POR MEET", "ZOOM"],
    status: ["COMUNICACIÓN EFECTIVA", "COMUNICACIÓN NO EFECTIVA"],
    type: [],
  },
  gmc: {
    medio: ["CORREO", "LLAMADA TRAMCASE", "MENSAJE TRAMCASE"],
    status: [],
    type: ["RECEIVED", "REQUESTED"],
  },
};

/*
 * Nombre con el que cada quien aparece en la Sheet, cuando no es
 * su nombre del hub en mayúsculas.
 */
const SHEET_NAMES: Record<string, string> = {
  "nmolina@supportmendoza.com": "NAT",
  "ocervantes@supportmendoza.com": "OSWALDO",
  "lmurillo@supportmendoza.com": "FERNANDO M.",
};

export function commsName(email: string) {
  return SHEET_NAMES[email] || (USER_NAMES[email] || email.split("@")[0]).toUpperCase();
}

// Posición (Alpha y Gamma): PLG o PSYCH; otros roles con su nombre corto.
export function commsPosition(role: Role) {
  if (role === "PARALEGAL") return "PLG";
  if (role === "PSYCH") return "PSYCH";
  if (role === "ANALYST") return "EA";
  return role;
}

export type Comm = {
  row: number;
  cliente: string;
  colaborador: string;
  posicion: string;
  fecha: string; // YYYY-MM-DD
  duracion: string;
  cantidad: string;
  medio: string;
  status: string;
  type: string;
  mensajeTramcase: boolean;
  notaTramcase: boolean;
  documento: string;
  link: string;
  notas: string;
};

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const colIndex = (letter: string) => letter.charCodeAt(0) - 65;

function isoDate(v: unknown) {
  if (typeof v === "number" && v > 0) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text(v));
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : text(v);
}

const DAYS_BACK = 120;

export async function loadComms(vista: CommsVista) {
  const { tab, lastCol, cols } = LAYOUTS[vista];
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetOf(vista),
    range: `'${tab}'!A2:${lastCol}`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });

  const since = new Date(Date.now() - DAYS_BACK * 86400000).toISOString().slice(0, 10);
  const get = (r: unknown[], f: CommsField) => (cols[f] ? r[colIndex(cols[f]!)] : "");
  const all = ((res.data.values || []) as unknown[][]).map((r, i) => ({
    row: i + 2,
    cliente: text(get(r, "cliente")),
    colaborador: text(get(r, "colaborador")).toUpperCase(),
    posicion: text(get(r, "posicion")),
    fecha: isoDate(get(r, "fecha")),
    duracion: text(get(r, "duracion")),
    cantidad: text(get(r, "cantidad")),
    medio: text(get(r, "medio")),
    status: text(get(r, "status")),
    type: text(get(r, "type")),
    mensajeTramcase: get(r, "mensajeTramcase") === true,
    notaTramcase: get(r, "notaTramcase") === true,
    documento: text(get(r, "documento")),
    link: text(get(r, "link")),
    notas: text(get(r, "notas")),
  }));

  const filled = all.filter((c) => c.cliente || c.colaborador);
  const base = BASE_OPTIONS[vista];
  const tokens = (key: "medio" | "status" | "type") =>
    [...new Set([...base[key], ...filled.flatMap((c) => c[key].split(",").map((s) => s.trim().toUpperCase()))])]
      .filter(Boolean);

  return {
    // Solo lo reciente; la pestaña completa sigue en la Sheet.
    comms: filled.filter((c) => !c.fecha || c.fecha >= since),
    options: {
      medio: tokens("medio"),
      status: vista === "gmc" ? [] : tokens("status"),
      type: vista === "gmc" ? tokens("type") : [],
      documento: [...new Set(filled.map((c) => c.documento).filter((d) => d && d.length <= 20))].slice(0, 20),
    },
    fields: Object.keys(cols) as CommsField[],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/*
 * Registra una comunicación en la primera fila libre. El candado
 * evita que dos registros del hub caigan en la misma fila; justo
 * antes de escribir se vuelve a revisar que la fila siga libre
 * (por si alguien escribió directo en la Sheet).
 */
export async function addComm(
  vista: CommsVista,
  entry: Partial<Record<CommsField, string | boolean>>,
  // Solo para pruebas: un cliente de Sheets simulado.
  client?: Awaited<ReturnType<typeof getSheets>>
) {
  const { tab, lastCol, cols } = LAYOUTS[vista];
  const sheets = client || (await getSheets());
  const spreadsheetId = spreadsheetOf(vista);
  const lockKey = `lock:comms:${vista}`;
  const token = `${Date.now()}-${Math.random()}`;

  let locked = false;
  for (let i = 0; i < 20 && !locked; i++) {
    locked = (await redis(["SET", lockKey, token, "NX", "PX", 15000])) === "OK";
    if (!locked) await sleep(300);
  }
  if (!locked) throw new Error("Otra persona está registrando en este momento. Intenta de nuevo.");

  try {
    // Hasta dónde hay datos (cliente, colaborador o fecha).
    const keyCols = [cols.cliente!, cols.colaborador!, cols.fecha!].sort();
    const used = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'!${keyCols[0]}:${keyCols[keyCols.length - 1]}`,
    });
    let row = (used.data.values || []).length + 1;

    for (let tries = 0; tries < 5; tries++) {
      const check = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${tab}'!A${row}:${lastCol}${row}`,
      });
      const cells = check.data.values?.[0] || [];
      const busy = [cols.cliente!, cols.colaborador!, cols.fecha!].some((c) => text(cells[colIndex(c)]));
      if (!busy) break;
      row += 1;
    }

    const values: (string | boolean)[] = [];
    for (let c = 0; c <= colIndex(lastCol); c++) values.push("");
    (Object.keys(cols) as CommsField[]).forEach((f) => {
      const v = entry[f];
      const isCheck = f === "mensajeTramcase" || f === "notaTramcase";
      values[colIndex(cols[f]!)] = isCheck ? v === true : typeof v === "string" ? v : "";
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab}'!A${row}:${lastCol}${row}`,
      // USER_ENTERED: la fecha "2026-10-30" queda como fecha real.
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [values] },
    });

    return row;
  } finally {
    // Solo libera el candado si sigue siendo nuestro.
    if ((await redis(["GET", lockKey])) === token) await redis(["DEL", lockKey]);
  }
}
