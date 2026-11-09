import { fetchRfeRows } from "@/lib/rfe/sheet";
import { TABS } from "@/lib/rfe/config";
import { readSheetCases } from "@/lib/sheets";
import { parseFecha } from "@/lib/atty";

/*
 * Días antes del deadline con los que un caso llega a revisión.
 *
 * - VAWA: pestaña "RFE's I-360 duedate" de la Sheet general de RFE,
 *   DEADLINE − READY FOR MGM REVIEW.
 * - VISA T: misma pestaña (RFE/NOID VISA T), aparte de VAWA.
 * - NON VAWA: NW GENERAL de Alpha, Due Date − FECHA RTP.
 *
 * Tipos: NOID (NOID, NOIR…), RFE con deadline de NOID (RFE con
 * máximo 35 días entre la fecha de recibo y el deadline) y RFE.
 * Fuera: DECISION, I 290, WAIVER, Informational y similares.
 */

import {
  NOID_DEADLINE_MAX_DIAS,
  type AntCaso,
  type AntData,
  type AntFuente,
  type AntTipo,
} from "@/lib/anticipacion-types";

export * from "@/lib/anticipacion-types";

function fecha(raw: string | undefined): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const iso = parseFecha(s);
  if (iso) return iso;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const dayNum = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};

const norm = (v: string | undefined) => (v || "").replace(/\s+/g, " ").trim().toUpperCase();

// Familia del tipo en la Sheet; null = no entra (DECISION, I 290…).
function familia(raw: string): { visaT: boolean; base: "NOID" | "RFE" } | null {
  const t = norm(raw);
  if (!t || /DECISION|I ?290|WAIVER|INFORMATIONAL|MAILING|REVOKE/.test(t)) return null;
  const visaT = /VISA ?T/.test(t);
  if (/^NOI[DR]/.test(t)) return { visaT, base: "NOID" };
  if (/^RFE/.test(t)) return { visaT, base: "RFE" };
  return null;
}

function tipoDe(base: "NOID" | "RFE", recibo: string | null, deadline: string): AntTipo {
  if (base === "NOID") return "NOID";
  return recibo && dayNum(deadline) - dayNum(recibo) <= NOID_DEADLINE_MAX_DIAS ? "RFE DL NOID" : "RFE";
}

type Row = Record<string, string>;

export async function loadAnticipacion(): Promise<AntData> {
  const [vawaRows, nw] = await Promise.all([
    fetchRfeRows(TABS.vawaDueDate),
    readSheetCases("NW GENERAL"),
  ]);
  return buildAnticipacion(vawaRows, nw.rows);
}

export function buildAnticipacion(vawaRows: Row[], nwRows: Row[]): AntData {
  const casos: AntCaso[] = [];
  const pendientes: Record<AntFuente, number> = { VAWA: 0, "NON VAWA": 0, "VISA T": 0 };

  const push = (
    fuente: AntFuente,
    base: "NOID" | "RFE",
    row: { cliente: string; tipoSheet: string; recibo?: string; deadline?: string; entrega?: string }
  ) => {
    const deadline = fecha(row.deadline);
    if (!deadline) return;
    const entrega = fecha(row.entrega);
    if (!entrega) {
      pendientes[fuente]++;
      return;
    }
    const recibo = fecha(row.recibo);
    casos.push({
      fuente,
      tipo: tipoDe(base, recibo, deadline),
      cliente: row.cliente,
      tipoSheet: row.tipoSheet,
      recibo: recibo || "",
      deadline,
      entrega,
      dias: dayNum(deadline) - dayNum(entrega),
    });
  };

  vawaRows.forEach((row) => {
    // Sin nombre pero con tipo y fechas sigue siendo un caso.
    const cliente = (row["CL"] || "").trim() || "(sin nombre)";
    const f = familia(row["RFE or NOID"] || "");
    if (!f) return;
    push(f.visaT ? "VISA T" : "VAWA", f.base, {
      cliente,
      tipoSheet: norm(row["RFE or NOID"]),
      recibo: row["RECEIPT DATE"],
      deadline: row["DEADLINE"],
      entrega: row["READY FOR MGM REVIEW"],
    });
  });

  nwRows.forEach((row) => {
    const cliente = (row["CL"] || "").trim() || "(sin nombre)";
    const f = familia(row["TIPO"] || "");
    if (!f) return;
    push("NON VAWA", f.base, {
      cliente,
      tipoSheet: norm(row["TIPO"]),
      recibo: row["Receipt date"],
      deadline: row["Due Date"],
      entrega: row["FECHA RTP"],
    });
  });

  casos.sort((a, b) => b.entrega.localeCompare(a.entrega));
  return { casos, pendientes };
}
