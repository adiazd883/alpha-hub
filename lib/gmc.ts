import { getSheets } from "@/lib/sheets";

/*
 * Entregas del equipo GMC (Gov Branch), Sheet "RFE - CELULA GB".
 *
 * - GMC: casos VAWA o decisions con deadline. MEMBER GMC = N/A
 *   significa que no necesita GMC y no se trabaja.
 * - NON VAWA: TEAM solo "GERSON" = full GMC; con alguien más =
 *   compartido. Cada modo usa sus propias columnas.
 * - OTHER: COMMITMENT es la fecha esperada; no tiene estatus.
 *
 * Al navegador solo sale lo necesario para el calendario.
 */
const GMC_SPREADSHEET_ID =
  process.env.GMC_SPREADSHEET_ID ||
  "1T3HrAB-P6lAnTnj7qSCCZOq8vEMJHCqDeV4T-F9vH6Y";

export const GMC_STATUS_OPTIONS = ["WORKING", "READY", "SPECIAL CASE"];

export type GmcTab = "GMC" | "NON VAWA" | "OTHER";

export const GMC_TABS: GmcTab[] = ["GMC", "NON VAWA", "OTHER"];

export type GmcField = "status" | "expected" | "done" | "link";

// Columnas (letra) de cada dato; null = la pestaña no lo tiene.
type Columns = {
  cliente: string;
  id: string | null;
  receipt: string | null;
  deadline: string | null;
  member: string;
} & Record<GmcField, string | null>;

const TAB_CONFIG: Record<GmcTab, { headerRow: number; lastCol: string }> = {
  GMC: { headerRow: 2, lastCol: "W" },
  "NON VAWA": { headerRow: 2, lastCol: "AR" },
  OTHER: { headerRow: 1, lastCol: "J" },
};

const GMC_COLUMNS: Columns = {
  cliente: "B",
  id: "C",
  receipt: "D",
  deadline: "G",
  member: "K",
  status: "M",
  expected: "O", // NEW EXPECTED DONE: la pone el Admin
  done: "P",
  link: "R",
};

const NON_VAWA_SHARED: Columns = {
  cliente: "A",
  id: "B",
  receipt: "C",
  deadline: "F",
  member: "R",
  status: "S",
  expected: "T",
  done: "U",
  link: "V",
};

const NON_VAWA_FULL: Columns = {
  ...NON_VAWA_SHARED,
  status: "AO",
  expected: "AP",
  done: "AQ",
  link: null,
};

const OTHER_COLUMNS: Columns = {
  cliente: "A",
  id: null,
  receipt: null,
  deadline: null,
  member: "F",
  status: null,
  expected: "D", // COMMITMENT
  done: "H",
  link: "I",
};

const NON_VAWA_TEAM = "L";
const NON_VAWA_TYPE = "J";
const NON_VAWA_FORM = "K";
const GMC_CELULA = "I";
const GMC_NOID = "W";
const OTHER_TYPE = "E";
const OTHER_REHAB = "G";
// Columna sin título: "email" en un caso sin COLAB = ya está done.
const OTHER_DONE_MARK = "J";

export type GmcItem = {
  key: string; // "<tab>:<fila>"
  tab: GmcTab;
  row: number;
  cliente: string;
  clienteId: string;
  receipt: string;
  // GMC: célula de origen; NON VAWA: Full / Compartido; OTHER: TYPE
  tipo: string;
  detalle: string;
  member: string;
  rehab: string;
  deadline: string | null;
  expected: string | null;
  done: string | null;
  status: string;
  link: string;
  // Qué se puede editar en esta fila.
  editable: GmcField[];
};

export type GmcData = {
  items: GmcItem[];
  statusOptions: string[];
};

function colIndex(letter: string) {
  return letter
    .split("")
    .reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

const text = (v: unknown) =>
  (v === null || v === undefined ? "" : String(v)).trim();

// Con UNFORMATTED_VALUE las fechas llegan como número de serie.
function isoDate(v: unknown): string | null {
  if (typeof v !== "number" || v <= 0) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
  return d.toISOString().slice(0, 10);
}

function quoted(tab: GmcTab) {
  return `'${tab.replace(/'/g, "''")}'`;
}

function columnsFor(tab: GmcTab, row: unknown[]): Columns {
  if (tab === "GMC") return GMC_COLUMNS;
  if (tab === "OTHER") return OTHER_COLUMNS;
  return isFullNonVawa(row) ? NON_VAWA_FULL : NON_VAWA_SHARED;
}

// TEAM con solo "GERSON" = full GMC; con alguien más = compartido.
function isFullNonVawa(row: unknown[]) {
  const team = text(row[colIndex(NON_VAWA_TEAM)]).toUpperCase();
  return team.split(/[,/&]| Y /).filter((s) => s.trim()).length <= 1;
}

function toItem(tab: GmcTab, row: unknown[], rowNumber: number): GmcItem | null {
  const cols = columnsFor(tab, row);
  const get = (letter: string | null) => (letter ? row[colIndex(letter)] : "");

  const cliente = text(get(cols.cliente));
  if (!cliente) return null;

  const member = text(get(cols.member));
  // GMC con N/A no necesita GMC: no se trabaja.
  if (tab === "GMC" && /^n\/?a$/i.test(member)) return null;

  // OTHER ya resuelto por email, sin colaborador: no se considera.
  if (tab === "OTHER" && !member && /email/i.test(text(get(OTHER_DONE_MARK)))) {
    return null;
  }

  const done = isoDate(get(cols.done));
  const rawStatus = text(get(cols.status)).toUpperCase();

  let tipo = "";
  let detalle = "";
  if (tab === "GMC") {
    tipo = text(get(GMC_CELULA));
    detalle = text(get(GMC_NOID)).toUpperCase() === "TRUE" ? "NOID/NOIR" : "";
  } else if (tab === "NON VAWA") {
    tipo = isFullNonVawa(row) ? "Full GMC" : "Compartido";
    detalle = [text(get(NON_VAWA_TYPE)), text(get(NON_VAWA_FORM))]
      .filter(Boolean)
      .join(" · ");
  } else {
    tipo = text(get(OTHER_TYPE));
  }

  const editable = (["expected", "status", "done", "link"] as GmcField[]).filter(
    (f) => cols[f] !== null
  );

  return {
    key: `${tab}:${rowNumber}`,
    tab,
    row: rowNumber,
    cliente,
    clienteId: text(get(cols.id)),
    receipt: text(get(cols.receipt)),
    tipo,
    detalle,
    member,
    rehab: tab === "OTHER" ? text(get(OTHER_REHAB)) : "",
    deadline: isoDate(get(cols.deadline)),
    expected: isoDate(get(cols.expected)),
    done,
    // OTHER no tiene estatus: se deduce de la fecha de entrega.
    status:
      cols.status === null ? (done ? "READY" : "WORKING") : rawStatus,
    link: text(get(cols.link)),
    editable,
  };
}

export async function loadGmc(): Promise<GmcData> {
  const sheets = await getSheets();

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: GMC_SPREADSHEET_ID,
    ranges: GMC_TABS.map((t) => `${quoted(t)}!A1:${TAB_CONFIG[t].lastCol}`),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });

  const items: GmcItem[] = [];
  (res.data.valueRanges || []).forEach((range, i) => {
    const tab = GMC_TABS[i];
    const { headerRow } = TAB_CONFIG[tab];
    const values = (range.values || []) as unknown[][];
    values.slice(headerRow).forEach((row, j) => {
      const item = toItem(tab, row, headerRow + j + 1);
      if (item) items.push(item);
    });
  });

  return { items, statusOptions: GMC_STATUS_OPTIONS };
}

/*
 * Guarda un dato de una fila. Antes de escribir revisa que la
 * fila siga siendo del mismo cliente, por si alguien insertó o
 * borró filas en la Sheet mientras tanto.
 */
export async function updateGmc(input: {
  tab: GmcTab;
  row: number;
  cliente: string;
  field: GmcField;
  value: string;
}) {
  const { tab, row, cliente, field, value } = input;
  const sheets = await getSheets();

  const current = await sheets.spreadsheets.values.get({
    spreadsheetId: GMC_SPREADSHEET_ID,
    range: `${quoted(tab)}!A${row}:${TAB_CONFIG[tab].lastCol}${row}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const cells = (current.data.values?.[0] || []) as unknown[];
  const cols = columnsFor(tab, cells);

  if (text(cells[colIndex(cols.cliente)]) !== cliente.trim()) {
    throw new Error("La fila cambió en la Sheet. Recarga e intenta de nuevo.");
  }

  const column = cols[field];
  if (!column) {
    throw new Error("Este dato no se puede editar en esta pestaña");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: GMC_SPREADSHEET_ID,
    range: `${quoted(tab)}!${column}${row}`,
    // USER_ENTERED: "2026-11-14" se guarda como fecha real.
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[value]] },
  });

  const updated = [...cells];
  updated[colIndex(column)] = value;
  return toItemFromWrite(tab, updated, row, field, value);
}

// La fila ya escrita, con la fecha como texto ISO.
function toItemFromWrite(
  tab: GmcTab,
  cells: unknown[],
  row: number,
  field: GmcField,
  value: string
) {
  const item = toItem(tab, cells, row);
  if (!item) return null;
  if (field === "expected") item.expected = value || null;
  if (field === "done") {
    item.done = value || null;
    if (tab === "OTHER") item.status = value ? "READY" : "WORKING";
  }
  return item;
}
