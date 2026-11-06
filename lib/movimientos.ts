import { redis, getJson, setJson } from "@/lib/rfe/store";
import { readCases } from "@/lib/sheets";
import { CELULA_KEYS, type Celula } from "@/lib/celulas";

/*
 * Movimientos de etapa (VAWA de Alpha y Gamma). Las Sheets solo
 * guardan el estado actual, así que el hub toma una foto de la
 * etapa de cada caso (al día) y registra cada cambio "de X a Y".
 * Las etapas son las mismas de Regresos, sin Carátula, para poder
 * cruzarlas.
 */
export const ETAPAS_MOV = [
  "1st Draft",
  "DOE / Psych",
  "EA",
  "Esc. CVL",
  "CVL",
  "MGM Review",
  "Envío / Filing",
] as const;

export const CASO_NUEVO = "Caso nuevo";
export const CERRADO = "Cerrado";

export type Movimiento = {
  fecha: string; // YYYY-MM-DD (CDMX)
  celula: Celula;
  key: string;
  cliente: string;
  clienteId: string;
  receipt: string;
  de: string;
  a: string;
};

type Foto = {
  tomada: string; // ISO
  casos: Record<string, { etapa: string; cliente: string; clienteId: string; receipt: string }>;
};

const FOTO_KEY = "hub:mov:foto-v1";
const EVENTOS_KEY = "hub:mov:eventos-v1";
const LOCK_KEY = "lock:mov:foto";
// Día de la primera foto: desde ahí hay historial.
const BASE_KEY = "hub:mov:base-v1";
// Al abrir el análisis se toma una foto nueva si la última tiene más de 6 h.
const FRESCURA_MS = 6 * 3600000;

const lleno = (v: string | undefined) => !!(v || "").trim();
const up = (v: string | undefined) => (v || "").trim().toUpperCase();

/*
 * Etapa actual: la primera sin fecha DONE (N/A cuenta como hecha).
 * MGM Review y Envío salen de STATUS / SENT TO MGM.
 */
export function etapaDe(row: Record<string, string>): string {
  const status = up(row["STATUS"]);
  if (/CANCEL|CLOSED/.test(status)) return CERRADO;
  if (status === "SENT TO USCIS") return "Envío / Filing";
  if (status === "MGM REVIEW" || lleno(row["SENT TO MGM"])) return "MGM Review";
  const pasos: [string, boolean][] = [
    ["1st Draft", lleno(row["1ST DRAFT DONE"])],
    ["DOE / Psych", lleno(row["DONE (edit dcl)"])],
    ["EA", lleno(row["EA DONE"])],
    ["Esc. CVL", lleno(row["PL CVL DONE"])],
    ["CVL", lleno(row["DONE CVL"])],
  ];
  return pasos.find(([, hecho]) => !hecho)?.[0] || "MGM Review";
}

export const ordenDe = (etapa: string) => ETAPAS_MOV.indexOf(etapa as (typeof ETAPAS_MOV)[number]);

const hoyMx = () => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10);

/*
 * Toma la foto y guarda los cambios contra la anterior. La primera
 * vez solo deja la base (no hay contra qué comparar).
 */
export async function tomarFoto(force = false) {
  const anterior = await getJson<Foto>(FOTO_KEY);
  if (!force && anterior && Date.now() - Date.parse(anterior.tomada) < FRESCURA_MS) {
    return { nuevos: 0, omitida: true };
  }
  const lock = await redis(["SET", LOCK_KEY, "1", "NX", "PX", 120000]);
  if (lock !== "OK") return { nuevos: 0, omitida: true };

  try {
    const casos: Foto["casos"] = {};
    const filas = await Promise.all(
      CELULA_KEYS.map(async (celula) => ({ celula, rows: (await readCases(celula)).rows }))
    );
    filas.forEach(({ celula, rows }) =>
      rows.forEach((row) => {
        const cliente = (row["CLIENTE"] || "").trim();
        const receipt = (row["RECEIPT NUMBER"] || "").trim();
        const clienteId = (row["ID"] || "").trim();
        if (!cliente) return;
        casos[`${celula}:${receipt || clienteId || cliente.toUpperCase()}`] = {
          etapa: etapaDe(row),
          cliente,
          clienteId,
          receipt,
        };
      })
    );

    const fecha = hoyMx();
    const eventos: Movimiento[] = [];
    if (anterior) {
      Object.entries(casos).forEach(([key, c]) => {
        const antes = anterior.casos[key]?.etapa || CASO_NUEVO;
        if (antes === c.etapa) return;
        eventos.push({
          fecha,
          celula: key.split(":")[0] as Celula,
          key,
          cliente: c.cliente,
          clienteId: c.clienteId,
          receipt: c.receipt,
          de: antes,
          a: c.etapa,
        });
      });
    }
    if (eventos.length) await redis(["RPUSH", EVENTOS_KEY, ...eventos.map((e) => JSON.stringify(e))]);
    if (!anterior) await redis(["SET", BASE_KEY, fecha]);
    await setJson(FOTO_KEY, { tomada: new Date().toISOString(), casos });
    return { nuevos: eventos.length, omitida: false };
  } finally {
    await redis(["DEL", LOCK_KEY]);
  }
}

export async function listarMovimientos(): Promise<{ eventos: Movimiento[]; desde: string | null }> {
  const raw = ((await redis(["LRANGE", EVENTOS_KEY, 0, -1])) || []) as string[];
  const eventos: Movimiento[] = [];
  raw.forEach((s) => {
    try {
      eventos.push(JSON.parse(s));
    } catch {
      // Evento dañado: se ignora.
    }
  });
  const desde = ((await redis(["GET", BASE_KEY])) as string | null) || null;
  return { eventos, desde };
}
