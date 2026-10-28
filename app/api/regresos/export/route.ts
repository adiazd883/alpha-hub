import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { CELULAS } from "@/lib/celulas";
import {
  TIPO_LABELS,
  canSee,
  daysBetween,
  isLead,
  isOverdue,
  todayMx,
} from "@/lib/regresos";
import { getRoster, listRegresos, personIdFor } from "@/lib/regresos-store";

export const dynamic = "force-dynamic";

/*
 * CSV para cruzar con las Sheets: ID y RECEIPT NUMBER van tal
 * cual vienen de la pestaña ADMINs, así un BUSCARV/XLOOKUP
 * los encuentra. Lleva BOM para que Excel respete los acentos.
 */
const HEADER = [
  "FOLIO",
  "TIPO",
  "CÉLULA",
  "CLIENTE",
  "ID",
  "RECEIPT NUMBER",
  "ETAPA",
  "QUÉ SE PIDE",
  "DETALLE",
  "PARA",
  "LO MANDA",
  "FECHA ENVÍO",
  "FECHA LÍMITE",
  "ESTATUS",
  "FECHA CONCRETADO",
  "DÍAS PARA CONCRETAR",
  "A TIEMPO",
  "NOTA DE CIERRE",
  "CAPTURADO POR",
];

const cell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  // Evita que Excel interprete el texto como fórmula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!isLead(session.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const roster = await getRoster();
  const names = new Map(roster.map((p) => [p.id, p.name]));
  const viewer = {
    email: session.email,
    personId: personIdFor(roster, session.email),
    role: session.role,
    celulas: session.celulas,
  };
  const today = todayMx();
  const rows = (await listRegresos())
    .filter((r) => canSee(viewer, r))
    .sort((a, b) => a.enviado.localeCompare(b.enviado));

  const lines = [HEADER, ...rows.map((r) => {
    const estatus =
      r.estado === "concretado" ? "CONCRETADO" : isOverdue(r, today) ? "VENCIDO" : "PENDIENTE";
    const aTiempo =
      r.estado === "concretado" && r.limite && r.concretado
        ? r.concretado <= r.limite ? "SÍ" : "NO"
        : "";
    return [
      r.id.slice(0, 8).toUpperCase(),
      TIPO_LABELS[r.tipo].toUpperCase(),
      CELULAS[r.celula]?.label || r.celula,
      r.cliente,
      r.clienteId,
      r.receipt,
      r.etapa,
      r.motivo,
      r.detalle,
      names.get(r.para) || r.para,
      names.get(r.de) || r.de,
      r.enviado,
      r.limite,
      estatus,
      r.concretado,
      r.concretado ? daysBetween(r.enviado, r.concretado) : "",
      aTiempo,
      r.nota,
      r.deEmail,
    ];
  })];

  const csv = "﻿" + lines.map((l) => l.map(cell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="regresos-actualizaciones-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
