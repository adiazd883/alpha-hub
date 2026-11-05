import { randomUUID } from "crypto";
import { redis } from "@/lib/rfe/store";

/*
 * Comunicaciones de GMC: viven en la memoria del hub, no en la
 * Sheet. Primero el tipo (se comunican para solicitar o para
 * recibir), luego cliente, entidad, item y medio. Entidad e item
 * se escriben a mano; lo ya capturado sale como sugerencia. Cada
 * registro va en un campo del hash, así dos personas guardando a
 * la vez no se pisan.
 */
const KEY = "hub:comms-gmc-v1";

export const GMC_COMM_TIPOS = ["REQUESTED", "RECEIVED"] as const;
export type GmcCommTipo = (typeof GMC_COMM_TIPOS)[number];

export const GMC_COMM_MEDIOS = [
  "Phone (Kase)",
  "WhatsApp llamada",
  "WhatsApp MSJ",
  "Email",
  "Portal en línea",
];

export type GmcComm = {
  id: string;
  tipo: GmcCommTipo;
  cliente: string;
  entidad: string;
  item: string;
  medio: string;
  fecha: string; // YYYY-MM-DD
  notas: string;
  email: string;
  colaborador: string;
  creado: string;
  editado?: string;
};

export async function listGmcComms(): Promise<GmcComm[]> {
  const flat: string[] = (await redis(["HGETALL", KEY])) || [];
  const out: GmcComm[] = [];
  for (let i = 1; i < flat.length; i += 2) {
    try {
      out.push(JSON.parse(flat[i]) as GmcComm);
    } catch {
      // Registro dañado: se ignora.
    }
  }
  return out;
}

export async function getGmcComm(id: string) {
  const raw = await redis(["HGET", KEY, id]);
  return raw ? (JSON.parse(raw) as GmcComm) : null;
}

export async function saveGmcComm(c: GmcComm) {
  await redis(["HSET", KEY, c.id, JSON.stringify(c)]);
}

export async function deleteGmcComm(id: string) {
  await redis(["HDEL", KEY, id]);
}

export const newGmcCommId = () => randomUUID();

// CSV con todo el histórico.
export function gmcCommsCsv(rows: GmcComm[]) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Fecha", "Tipo", "Cliente", "Entidad", "Item", "Medio", "Colaborador", "Correo", "Notas", "Registrado el", "ID"];
  const lines = [...rows]
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creado.localeCompare(b.creado))
    .map((c) =>
      [c.fecha, c.tipo, c.cliente, c.entidad, c.item, c.medio, c.colaborador, c.email, c.notas, c.creado, c.id]
        .map(esc)
        .join(",")
    );
  // BOM para que Excel abra bien los acentos.
  return "﻿" + [header.join(","), ...lines].join("\n");
}
