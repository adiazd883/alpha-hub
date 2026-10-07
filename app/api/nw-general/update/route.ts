import { NextRequest, NextResponse } from "next/server";
import { updateSheetCase } from "@/lib/sheets";
import { USERS } from "@/lib/auth";

/*
 * Única sección de NW GENERAL con escritura: el calendario
 * "Deadline Interno" solo permite cambiar el status del caso.
 * El calendario "Deadline del Recibo" nunca llama a esta ruta.
 */
const EDITABLE_FIELDS = new Set(["GENERAL STATUS"]);

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
