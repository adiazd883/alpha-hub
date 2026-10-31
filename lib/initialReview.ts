import { getTargetSheet, updateCase } from "@/lib/sheets";
import { redis } from "@/lib/rfe/store";
import type { Celula } from "@/lib/celulas";

/*
 * Initial review (first approach) de CS. La fecha va en la
 * columna "INITIAL REVIEW (FIRST APPROACH)" de ADMINs; quién lo
 * registró se guarda aparte (la Sheet solo tiene la fecha).
 */
export const INITIAL_REVIEW_HEADER = "INITIAL REVIEW (FIRST APPROACH)";

const KEY = "hub:initial-review-v1";

export type Registrant = { email: string; nombre: string; at: string };

const field = (celula: Celula, row: number) => `${celula}:${row}`;

export async function listRegistrants(): Promise<Record<string, Registrant>> {
  const flat: string[] = (await redis(["HGETALL", KEY])) || [];
  const out: Record<string, Registrant> = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = JSON.parse(flat[i + 1]);
  return out;
}

// La fila tiene que seguir siendo del mismo cliente (por si se movieron filas).
async function assertClient(celula: Celula, row: number, cliente: string) {
  const { sheets, spreadsheetId, title } = await getTargetSheet(celula);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${title.replace(/'/g, "''")}'!B${row}`,
  });
  const actual = String(res.data.values?.[0]?.[0] ?? "").trim().toUpperCase();
  if (actual !== cliente.trim().toUpperCase()) {
    throw new Error("La fila cambió en la Sheet. Recarga e intenta de nuevo.");
  }
}

export async function saveInitialReview(input: {
  celula: Celula;
  row: number;
  cliente: string;
  date: string;
  by: { email: string; nombre: string };
}) {
  await assertClient(input.celula, input.row, input.cliente);
  await updateCase(input.celula, input.row, { [INITIAL_REVIEW_HEADER]: input.date });
  const registrant: Registrant = { ...input.by, at: new Date().toISOString() };
  await redis(["HSET", KEY, field(input.celula, input.row), JSON.stringify(registrant)]);
  return registrant;
}

export async function deleteInitialReview(input: { celula: Celula; row: number; cliente: string }) {
  await assertClient(input.celula, input.row, input.cliente);
  await updateCase(input.celula, input.row, { [INITIAL_REVIEW_HEADER]: "" });
  await redis(["HDEL", KEY, field(input.celula, input.row)]);
}
