import { getSheets } from "@/lib/sheets";

const RFE_SPREADSHEET_ID =
  process.env.RFE_SPREADSHEET_ID ||
  "15I-RRm7G7dbZRaUwu4dIyZs9D7el8pHWZr3a6IkEu8o";

/*
 * Igual que fetchSheetRows() del dashboard actual: lee A:AZ,
 * recorta espacios y descarta filas vacías.
 */
export async function fetchRfeRows(
  sheetName: string,
  headerRow = 1
) {
  const sheets = await getSheets();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: RFE_SPREADSHEET_ID,
    range: `'${sheetName.replace(/'/g, "''")}'!A:AZ`,
    majorDimension: "ROWS",
  });

  const values = res.data.values || [];
  const cell = (v: unknown) =>
    (v === null || v === undefined ? "" : String(v)).trim();

  const headers = (values[headerRow - 1] || []).map(cell);

  return values
    .slice(headerRow)
    .filter((row) => row.some((v) => cell(v) !== ""))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((header, i) => {
        if (header) obj[header] = cell(row[i]);
      });
      return obj;
    });
}
