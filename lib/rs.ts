import { getSheets } from "@/lib/sheets";
import { spreadsheetIdFor, type Celula } from "@/lib/celulas";

/*
 * Pestaña "RS" de la célula: clientes que deben entregar su
 * Rap Sheet. Se lee por posición porque los títulos de las dos
 * primeras columnas están cruzados (la A trae el cliente y la B
 * el ID).
 */
export const RS_DEADLINE = "2026-11-30";

export type RsCase = {
  row: number;
  cliente: string;
  clienteId: string;
  colaborador: string;
  contacto: string;
  identificacion: string;
  ultimoContacto: string;
  estatusCita: string;
  fechaCita: string;
  acudio: string;
  proveedor: string;
  recibida: string;
  linkRs: string;
  nota: string;
};

const text = (v: unknown) =>
  (v === null || v === undefined ? "" : String(v)).trim();

export async function loadRs(celula: Celula): Promise<RsCase[]> {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetIdFor(celula),
    range: "'RS'!A2:M",
  });

  return ((res.data.values || []) as unknown[][])
    .map((r, i) => ({
      row: i + 2,
      cliente: text(r[0]),
      clienteId: text(r[1]),
      colaborador: text(r[2]).toUpperCase(),
      contacto: text(r[3]).toUpperCase(),
      identificacion: text(r[4]),
      ultimoContacto: text(r[5]),
      estatusCita: text(r[6]),
      fechaCita: text(r[7]),
      acudio: text(r[8]),
      proveedor: text(r[9]),
      recibida: text(r[10]),
      linkRs: text(r[11]),
      nota: text(r[12]),
    }))
    .filter((c) => c.cliente);
}
