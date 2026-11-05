import { readCases, readSheetCases } from "@/lib/sheets";
import type { Celula } from "@/lib/celulas";

/*
 * Calendario de las paralegales de Atty (Galilea y Scarlet): las
 * fechas límite de Alpha y Gamma en un solo lugar, solo lectura.
 * - DUE DATE, NOID, DD NOID, NOIR: DEADLINE de ADMINs.
 * - NO DUE DATE: COMMITMENT de ADMINs (solo si tiene).
 * - NON VAWA: "Due Date" de NW GENERAL (Alpha).
 * Cada caso lleva el estatus de su propia pestaña.
 */
export type AttyTipo = "DUE DATE" | "NOID" | "DD NOID" | "NOIR" | "NO DUE DATE" | "NON VAWA";

export type AttyEvent = {
  key: string;
  fecha: string; // YYYY-MM-DD
  tipo: AttyTipo;
  // Qué fecha es: DEADLINE, COMMITMENT o DUE DATE (NW).
  campo: string;
  cliente: string;
  id: string;
  celula: Celula;
  status: string;
  enviado: boolean;
  form?: string;
};

// Casos que no van al calendario porque no tienen plazo.
export type AttySinPlazo = {
  key: string;
  cliente: string;
  celula: Celula;
  tipo: AttyTipo;
  motivo: string;
  status: string;
  form?: string;
};

const POR_DEADLINE: AttyTipo[] = ["DUE DATE", "NOID", "DD NOID", "NOIR"];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const isoOf = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/*
 * Fechas como vienen en las Sheets: "5-Jun-2026", "Dec 28, 2026",
 * "Wed, May 6, 2026", "October 5, 2026", "10/21/2026" o ISO.
 */
export function parseFecha(raw: string): string | null {
  const s = (raw || "").trim().replace(/^[A-Za-z]+,\s*/, "");
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return isoOf(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return isoOf(+m[3], +m[1], +m[2]);
  m = /^(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{4})$/.exec(s);
  if (m) {
    const k = MONTHS.indexOf(m[2].toLowerCase());
    return k >= 0 ? isoOf(+m[3], k + 1, +m[1]) : null;
  }
  m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m) {
    const k = MONTHS.indexOf(m[1].toLowerCase());
    return k >= 0 ? isoOf(+m[3], k + 1, +m[2]) : null;
  }
  return null;
}

const norm = (v: string) => (v || "").trim().toUpperCase();

export async function loadAttyEvents(celulas: Celula[]) {
  const events: AttyEvent[] = [];
  const sinPlazo: AttySinPlazo[] = [];

  const admins = await Promise.all(
    celulas.map(async (celula) => ({ celula, data: await readCases(celula) }))
  );
  admins.forEach(({ celula, data }) => {
    data.rows.forEach((row) => {
      const tipo = norm(row["DUE DATE/NO DUE DATE"]) as AttyTipo;
      const campo = POR_DEADLINE.includes(tipo) ? "DEADLINE" : tipo === "NO DUE DATE" ? "COMMITMENT" : "";
      if (!campo) return;
      const fecha = parseFecha(row[campo]);
      const status = norm(row["STATUS"]);
      if (!fecha) {
        // NO DUE DATE sin commitment no va; los demás se listan aparte.
        if (tipo !== "NO DUE DATE") {
          sinPlazo.push({
            key: `${celula}-${row.__row}`,
            cliente: (row["CLIENTE"] || "").trim(),
            celula,
            tipo,
            motivo: (row[campo] || "").trim() ? `DEADLINE "${row[campo].trim()}"` : "Sin DEADLINE en ADMINs",
            status,
          });
        }
        return;
      }
      events.push({
        key: `${celula}-${row.__row}`,
        fecha,
        tipo,
        campo,
        cliente: (row["CLIENTE"] || "").trim(),
        id: (row["ID"] || "").trim(),
        celula,
        status,
        enviado: status === "SENT TO USCIS",
      });
    });
  });

  // NON VAWA (NW GENERAL) solo existe en Alpha.
  if (celulas.includes("alpha")) {
    const nw = await readSheetCases("NW GENERAL");
    nw.rows.forEach((row) => {
      const cliente = (row["CL"] || "").trim();
      if (!cliente) return;
      const fecha = parseFecha(row["Due Date"]);
      const status = (row["GENERAL STATUS"] || "").trim();
      if (!fecha) {
        // Sin plazo (p. ej. Due Date "N/A" en solicitudes informativas).
        sinPlazo.push({
          key: `nw-${row.__row}`,
          cliente,
          celula: "alpha",
          tipo: "NON VAWA",
          motivo: [(row["TIPO"] || "").trim(), `Due Date "${(row["Due Date"] || "").trim() || "vacío"}"`]
            .filter(Boolean)
            .join(" · "),
          status: status.toUpperCase(),
          form: (row["FORM"] || "").trim(),
        });
        return;
      }
      events.push({
        key: `nw-${row.__row}`,
        fecha,
        tipo: "NON VAWA",
        campo: "DUE DATE",
        cliente,
        id: "",
        celula: "alpha",
        status: status.toUpperCase(),
        enviado: norm(status) === "SENT TO USCIS",
        form: (row["FORM"] || "").trim(),
      });
    });
  }

  return { events: events.sort((a, b) => a.fecha.localeCompare(b.fecha)), sinPlazo };
}

// Todos los clientes de ADMINs (Alpha y Gamma) y de NW GENERAL, para el estudio de tiempos.
export async function attyClientes(celulas: Celula[]) {
  const names: string[] = [];
  const admins = await Promise.all(celulas.map((c) => readCases(c)));
  admins.forEach((d) => d.rows.forEach((r) => names.push(r["CLIENTE"] || "")));
  if (celulas.includes("alpha")) {
    const nw = await readSheetCases("NW GENERAL");
    nw.rows.forEach((r) => names.push(r["CL"] || ""));
  }
  return [...new Set(names.map((n) => n.trim().toUpperCase()).filter(Boolean))].sort();
}
