import { NextResponse } from "next/server";
import { updateCase } from "@/lib/sheets";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const row = Number(body.row);
    const role = String(body.role || "");
    const changes = body.changes as Record<string,string>;
    if (!Number.isInteger(row) || row < 2) throw new Error("Invalid row");
    if (!changes || typeof changes !== "object") throw new Error("Invalid changes");

    const keys = Object.keys(changes).map(k => k.trim().toUpperCase());
    const canEdit = role === "ADMIN"
      ? true
      : role === "TL"
        ? keys.every(k => ["PARALEGAL ASIGNADO","FECHA DE ENTREGA","FECHA ENTREGA","DELIVERY DATE","STATUS","ESTATUS"].includes(k))
        : ["PARALEGAL","PSYCH","ANALYST"].includes(role)
          ? keys.every(k => ["FECHA DE ENTREGA","FECHA ENTREGA","DELIVERY DATE","STATUS","ESTATUS"].includes(k))
          : false;
    if (!canEdit) return NextResponse.json({ error: "Role not permitted for these fields" }, { status: 403 });

    await updateCase(row, changes);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
