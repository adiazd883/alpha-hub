import { NextRequest, NextResponse } from "next/server";
import { updateCase } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  try {
    // -----------------------------------------
    // OBTENER USUARIO REAL DE LA SESIÓN
    // -----------------------------------------

    const email = req.cookies.get("alpha_hub_email")?.value;
    const role = req.cookies.get("alpha_hub_role")?.value;

    if (!email || !role) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // LEER DATOS DE LA PETICIÓN
    // -----------------------------------------

    const body = await req.json();

    const row = Number(body.row);
    const changes = body.changes as Record<string, string>;

    if (!Number.isInteger(row) || row < 3) {
      throw new Error("Invalid row");
    }

    if (
      !changes ||
      typeof changes !== "object" ||
      Array.isArray(changes)
    ) {
      throw new Error("Invalid changes");
    }

    // -----------------------------------------
    // NORMALIZAR COLUMNAS
    // -----------------------------------------

    const keys = Object.keys(changes).map((k) =>
      k.trim().toUpperCase()
    );

    // -----------------------------------------
    // DEFINIR PERMISOS
    // -----------------------------------------

    let canEdit = false;

    // ADMIN
    // Puede modificar absolutamente todo.
    if (role === "ADMIN") {
      canEdit = true;
    }

    // TEAM LEADER
    // Puede modificar:
    // - Paralegal asignado
    // - Fecha de entrega
    // - Status
    else if (role === "TL") {
      canEdit = keys.every((k) =>
        [
          "PARALEGAL ASIGNADO",
          "FECHA DE ENTREGA",
          "FECHA ENTREGA",
          "DELIVERY DATE",
          "STATUS",
          "ESTATUS",
        ].includes(k)
      );
    }

    // PARALEGAL / PSYCH / ANALYST
    // Pueden modificar:
    // - Fecha de entrega
    // - Status
    // - Links
    else if (
      ["PARALEGAL", "PSYCH", "ANALYST"].includes(role)
    ) {
      canEdit = keys.every((k) => {
        const isDelivery = [
          "FECHA DE ENTREGA",
          "FECHA ENTREGA",
          "DELIVERY DATE",
        ].includes(k);

        const isStatus = [
          "STATUS",
          "ESTATUS",
        ].includes(k);

        const isLink =
          k.includes("LINK") ||
          k.includes("URL");

        return (
          isDelivery ||
          isStatus ||
          isLink
        );
      });
    }

    // MANAGER / COORDINATOR
    // Solo lectura.
    else if (
      role === "MANAGER" ||
      role === "COORDINATOR"
    ) {
      canEdit = false;
    }

    if (!canEdit) {
      return NextResponse.json(
        {
          error:
            "You do not have permission to edit these fields",
        },
        { status: 403 }
      );
    }

    // -----------------------------------------
    // ACTUALIZAR GOOGLE SHEETS
    // -----------------------------------------

    await updateCase(row, changes);

    return NextResponse.json({
      ok: true,
      email,
      role,
    });
  } catch (e) {
    console.error("Update error:", e);

    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}
