import { RFE_CATEGORIES } from "./config";
import type { Counts } from "./logic";

// Enteros de 0 en adelante para las 4 categorías, o null.
export function readCounts(source: unknown): Counts | null {
  if (!source || typeof source !== "object") return null;
  const out = {} as Counts;
  for (const category of RFE_CATEGORIES) {
    const n = Number((source as Record<string, unknown>)[category]);
    if (!Number.isInteger(n) || n < 0) return null;
    out[category] = n;
  }
  return out;
}

export function readCount(value: unknown) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
