import { redis } from "@/lib/rfe/store";
import type { Celula } from "@/lib/celulas";

/*
 * Notas ("disclaimers") de la rendición de cuentas: una por
 * cliente, etapa y semana. Viven solo en la memoria del hub,
 * no en la Sheet.
 */
export type RendicionNote = {
  text: string;
  by: string;
  at: string;
};

const keyOf = (week: string) => `hub:rendicion-notes:${week}`;

export const isWeek = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

// El campo empieza con la célula: "alpha|cvl|12345".
export const celulaOfField = (field: string) => field.split("|")[0];

export async function listNotes(week: string, celulas: Celula[]) {
  const raw = ((await redis(["HGETALL", keyOf(week)])) || []) as string[];
  const notes: Record<string, RendicionNote> = {};
  for (let i = 0; i + 1 < raw.length; i += 2) {
    if (!celulas.includes(celulaOfField(raw[i]) as Celula)) continue;
    try {
      notes[raw[i]] = JSON.parse(raw[i + 1]);
    } catch {
      // Nota dañada: se ignora.
    }
  }
  return notes;
}

export async function saveNote(week: string, field: string, note: RendicionNote | null) {
  if (!note) {
    await redis(["HDEL", keyOf(week), field]);
    return;
  }
  await redis(["HSET", keyOf(week), field, JSON.stringify(note)]);
}
