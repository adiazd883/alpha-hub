import { getSheets } from "@/lib/sheets";
import { spreadsheetIdFor, type Celula } from "@/lib/celulas";

/*
 * Pestaña "RS" de la célula: clientes que deben entregar su
 * Rap Sheet. Se lee por posición porque los títulos de las dos
 * primeras columnas están cruzados (la A trae el cliente y la B
 * el ID). Las opciones de cada desplegable salen de la propia
 * validación de la Sheet.
 */
export const RS_DEADLINE = "2026-11-30";

export type RsField =
  | "contacto"
  | "identificacion"
  | "ultimoContacto"
  | "estatusCita"
  | "fechaCita"
  | "acudio"
  | "proveedor"
  | "recibida"
  | "linkRs"
  | "nota";

// Columna de cada dato editable y cómo se captura.
export const RS_FIELDS: Record<RsField, { col: string; kind: "list" | "date" | "text" }> = {
  contacto: { col: "D", kind: "list" },
  identificacion: { col: "E", kind: "list" },
  ultimoContacto: { col: "F", kind: "date" },
  estatusCita: { col: "G", kind: "list" },
  fechaCita: { col: "H", kind: "date" },
  acudio: { col: "I", kind: "list" },
  proveedor: { col: "J", kind: "text" },
  recibida: { col: "K", kind: "date" },
  linkRs: { col: "L", kind: "text" },
  nota: { col: "M", kind: "text" },
};

export type RsCase = {
  row: number;
  cliente: string;
  clienteId: string;
  colaborador: string;
} & Record<RsField, string>;

export type RsOptions = Partial<Record<RsField, string[]>>;

const text = (v: unknown) =>
  (v === null || v === undefined ? "" : String(v)).trim();

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const isoOf = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/*
 * Fechas como "YYYY-MM-DD". Llegan como número de serie si son
 * fecha real; algunas se escribieron como texto ("10/21/2026",
 * "24-Oct-2026"). Si no se reconoce, se deja el texto tal cual.
 */
function dateValue(v: unknown) {
  if (typeof v === "number" && v > 0) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  const s = text(v);
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return isoOf(Number(m[3]), Number(m[1]), Number(m[2]));
  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
  if (m) {
    const mon = m[2].toLowerCase();
    const k = Math.max(MONTHS.indexOf(mon), MESES.indexOf(mon));
    if (k >= 0) return isoOf(Number(m[3]), k + 1, Number(m[1]));
  }
  return s;
}

function toCase(r: unknown[], row: number): RsCase {
  const get = (field: RsField) => {
    const { col, kind } = RS_FIELDS[field];
    const v = r[col.charCodeAt(0) - 65];
    return kind === "date" ? dateValue(v) : text(v);
  };
  return {
    row,
    cliente: text(r[0]),
    clienteId: text(r[1]),
    colaborador: text(r[2]).toUpperCase(),
    contacto: get("contacto").toUpperCase(),
    identificacion: get("identificacion"),
    ultimoContacto: get("ultimoContacto"),
    estatusCita: get("estatusCita"),
    fechaCita: get("fechaCita"),
    acudio: get("acudio"),
    proveedor: get("proveedor"),
    recibida: get("recibida"),
    linkRs: get("linkRs"),
    nota: get("nota"),
  };
}

const range = (from: string, to: string) => `'RS'!${from}:${to}`;

// Opciones de los desplegables, leídas de la validación de la fila 2.
async function loadOptions(celula: Celula): Promise<RsOptions> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: spreadsheetIdFor(celula),
    ranges: [range("A2", "M2")],
    fields: "sheets.data.rowData.values.dataValidation",
  });
  const cells = res.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values || [];
  const options: RsOptions = {};
  (Object.keys(RS_FIELDS) as RsField[]).forEach((field) => {
    const { col, kind } = RS_FIELDS[field];
    if (kind !== "list") return;
    const condition = cells[col.charCodeAt(0) - 65]?.dataValidation?.condition;
    if (condition?.type === "ONE_OF_LIST") {
      options[field] = (condition.values || [])
        .map((v) => text(v.userEnteredValue))
        .filter(Boolean);
    }
  });
  return options;
}

export async function loadRs(celula: Celula) {
  const sheets = await getSheets();
  const [res, options] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetIdFor(celula),
      range: range("A2", "M"),
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "SERIAL_NUMBER",
    }),
    loadOptions(celula),
  ]);

  const cases = ((res.data.values || []) as unknown[][])
    .map((r, i) => toCase(r, i + 2))
    .filter((c) => c.cliente);

  return { cases, options };
}

/*
 * Guarda un dato. Antes revisa que la fila siga siendo del mismo
 * cliente, por si alguien movió filas en la Sheet.
 */
export async function updateRs(input: {
  celula: Celula;
  row: number;
  cliente: string;
  field: RsField;
  value: string;
}) {
  const { celula, row, cliente, field, value } = input;
  const sheets = await getSheets();
  const spreadsheetId = spreadsheetIdFor(celula);

  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: range(`A${row}`, `M${row}`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  const cells = (current.data.values?.[0] || []) as unknown[];
  if (text(cells[0]) !== cliente.trim()) {
    throw new Error("La fila cambió en la Sheet. Recarga e intenta de nuevo.");
  }

  const { col, kind } = RS_FIELDS[field];
  if (kind === "list" && value) {
    const options = (await loadOptions(celula))[field] || [];
    if (options.length && !options.includes(value)) {
      throw new Error("Esa opción no está en la lista de la Sheet");
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: range(`${col}${row}`, `${col}${row}`),
    // USER_ENTERED: "2026-11-14" se guarda como fecha real.
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });

  const updated = [...cells];
  updated[col.charCodeAt(0) - 65] = value;
  return toCase(updated, row);
}
