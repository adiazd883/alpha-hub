import { NextRequest, NextResponse } from "next/server";
import { updateSheetCase } from "@/lib/sheets";
import { USERS } from "@/lib/auth";

/*
 * Los calendarios "Deadline Interno" y "Revisión CS" de NW GENERAL
 * permiten cambiar estos campos. "Deadline del Recibo" nunca llama
 * a esta ruta (es de solo lectura).
 */
const EDITABLE_FIELDS = new Set([
  "GENERAL STATUS",
  "DATE ATTY REVIEW",
  "FECHA RTP",
  "EVIDENCE NEEDED",
  "REQUERIMIENTOS",
  "PL ASSIGNED",
  "FORM",
  "REVISIÓN CS COMPLETADA",
]);

/*
 * Reasignar PL ASSIGNED está restringido a ADMIN/TL, igual que la
 * reasignación de paralegal en la Sheet ADMINs.
 */
const REASSIGNMENT_FIELDS = new Set(["PL ASSIGNED"]);

/*
 * Opciones de la lista de validación configurada en la columna
 * PL ASSIGNED de la Sheet.
 */
const PL_ASSIGNED_OPTIONS = new Set([
  "PAOLA",
  "GMC",
  "DAN U",
  "CARLOS ARTURO",
  "MAYLA",
  "LIZ",
]);

/*
 * Opciones de la lista de validación configurada en la columna
 * GENERAL STATUS de la Sheet (Datos > Validación de datos).
 */
const GENERAL_STATUS_OPTIONS = new Set([
  "Cancelled",
  "Special Case",
  "Assigned",
  "Working",
  "Correction",
  "Ready to Print",
  "Sent to USCIS",
  "Waiting Conf.",
  "Waiting Medical Exam",
  "Waiting Passport Photos",
  "Waiting Signatures",
]);

/*
 * Opciones de la lista de validación (selección múltiple) configurada
 * en la columna REQUERIMIENTOS. El valor guardado es una lista separada
 * por comas, p. ej. "CVL, CR, DOE".
 */
const REQUIREMENT_OPTIONS = new Set([
  "DCL PLG",
  "DCL PSYCH",
  "DOE",
  "DRAFT",
  "DCL EDITADA",
  "CVL",
  "CR",
  "NA",
]);

export async function POST(req: NextRequest) {
  try {
    const email = req.cookies.get("alpha_hub_email")?.value;
    if (!email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const role = USERS[email.toLowerCase().trim()];
    if (!role) {
      return NextResponse.json({ error: "Usuario no autorizado" }, { status: 403 });
    }

    if (role === "MANAGER" || role === "COORDINATOR") {
      return NextResponse.json({ error: "Tu rol es de solo lectura" }, { status: 403 });
    }

    const body = await req.json();
    const row = Number(body.row);
    const changes = body.changes && typeof body.changes === "object" ? body.changes : {};

    if (!Number.isInteger(row) || row < 2) {
      return NextResponse.json({ error: "Fila inválida" }, { status: 400 });
    }

    const invalidField = Object.keys(changes).find(
      (header) => !EDITABLE_FIELDS.has(header.trim().toUpperCase())
    );
    if (invalidField) {
      return NextResponse.json(
        { error: `No está permitido modificar ${invalidField}` },
        { status: 403 }
      );
    }

    const hasReassignment = Object.keys(changes).some((header) =>
      REASSIGNMENT_FIELDS.has(header.trim().toUpperCase())
    );
    if (hasReassignment && role !== "ADMIN" && role !== "TL") {
      return NextResponse.json(
        { error: "Solo Admin y Team Leader pueden reasignar" },
        { status: 403 }
      );
    }

    const plAssignedKey = Object.keys(changes).find(
      (header) => header.trim().toUpperCase() === "PL ASSIGNED"
    );
    if (
      plAssignedKey &&
      changes[plAssignedKey] &&
      !PL_ASSIGNED_OPTIONS.has(changes[plAssignedKey])
    ) {
      return NextResponse.json(
        { error: "Asignación inválida" },
        { status: 400 }
      );
    }

    const statusKey = Object.keys(changes).find(
      (header) => header.trim().toUpperCase() === "GENERAL STATUS"
    );
    if (statusKey && !GENERAL_STATUS_OPTIONS.has(changes[statusKey])) {
      return NextResponse.json(
        { error: "Status inválido" },
        { status: 400 }
      );
    }

    const requirementsKey = Object.keys(changes).find(
      (header) => header.trim().toUpperCase() === "REQUERIMIENTOS"
    );
    if (requirementsKey) {
      const parts = changes[requirementsKey]
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const invalidPart = parts.find(
        (p: string) => !REQUIREMENT_OPTIONS.has(p)
      );
      if (invalidPart) {
        return NextResponse.json(
          { error: `Requerimiento inválido: ${invalidPart}` },
          { status: 400 }
        );
      }
    }

    await updateSheetCase("NW GENERAL", row, changes);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("NW General update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar el cambio" },
      { status: 500 }
    );
  }
}
