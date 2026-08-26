import { google } from "googleapis";

function client() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
}

async function getSheets() {
  const auth = client();
  return google.sheets({ version: "v4", auth });
}

export async function getTargetSheet() {
  const sheets = await getSheets();
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const gid = Number(process.env.GOOGLE_SHEET_GID || "719601518");
  if (!spreadsheetId) throw new Error("Missing GOOGLE_SPREADSHEET_ID");
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,index))"
  });
  const sheet = (meta.data.sheets || []).find(s => Number(s.properties?.sheetId) === gid)
    || meta.data.sheets?.[0];
  if (!sheet?.properties?.title) throw new Error("Could not find target sheet");
  return { sheets, spreadsheetId, title: sheet.properties.title };
}

export async function readCases() {
  const { sheets, spreadsheetId, title } = await getTargetSheet();
  const range = `'${title.replace(/'/g, "''")}'`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE"
  });
  const values = res.data.values || [];
  if (!values.length) return { title, headers: [], rows: [] };
  const headers = values[0].map(v => String(v ?? ""));
  const rows = values.slice(1).map((r, i) => {
    const obj: Record<string,string> = { "__row": String(i + 2) };
    headers.forEach((h, j) => { obj[h] = String(r[j] ?? ""); });
    return obj;
  }).filter(r => Object.values(r).some(v => v && v !== r.__row));
  return { title, headers, rows };
}

const normal = (s:string) => s.trim().toUpperCase().replace(/\s+/g," ");

function findHeader(headers:string[], candidates:string[]) {
  const wanted = candidates.map(normal);
  return headers.find(h => wanted.includes(normal(h)));
}

export async function updateCase(rowNumber:number, changes:Record<string,string>) {
  const { sheets, spreadsheetId, title } = await getTargetSheet();
  const current = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${title.replace(/'/g, "''")}'!1:1`
  });
  const headers = (current.data.values?.[0] || []).map(String);
  const data = Object.entries(changes).map(([header,value]) => {
    const idx = headers.findIndex(h => normal(h) === normal(header));
    if (idx < 0) throw new Error(`Column not found: ${header}`);
    const col = columnName(idx + 1);
    return { range: `'${title.replace(/'/g, "''")}'!${col}${rowNumber}`, values: [[value]] };
  });
  if (!data.length) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data }
  });
}

function columnName(n:number) {
  let s="";
  while(n){ const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); }
  return s;
}

export const FIELD_RULES = {
  assignment: ["PARALEGAL ASIGNADO"],
  delivery: ["FECHA DE ENTREGA","FECHA ENTREGA","DELIVERY DATE"],
  status: ["STATUS","ESTATUS"]
};
