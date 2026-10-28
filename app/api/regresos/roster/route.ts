import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { isCelula } from "@/lib/celulas";
import type { Person } from "@/lib/regresos";
import { getRoster, newId, saveRoster } from "@/lib/regresos-store";

export const dynamic = "force-dynamic";

/*
 * El Admin pone nombres al equipo, agrega gente sin acceso al
 * hub (solo para poder asignarles) y da de baja a quien ya no
 * está. Las personas no se borran para no romper el histórico.
 */
export async function PUT(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo Admin puede editar el equipo" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.roster)) {
    return NextResponse.json({ error: "No hay cambios que guardar" }, { status: 400 });
  }

  try {
    const current = await getRoster();
    const byId = new Map(current.map((p) => [p.id, p]));
    const next: Person[] = [];

    for (const raw of body.roster as Partial<Person>[]) {
      const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
      if (!name || !isCelula(raw.celula)) {
        return NextResponse.json(
          { error: "Cada persona necesita nombre y célula" },
          { status: 400 }
        );
      }
      const existing = raw.id ? byId.get(raw.id) : undefined;
      const email =
        typeof raw.email === "string" && raw.email.includes("@")
          ? raw.email.trim().toLowerCase()
          : undefined;
      next.push({
        id: existing?.id || newId(),
        name,
        // El correo de alguien que ya inicia sesión no cambia.
        email: existing?.email || email,
        celula: raw.celula,
        active: raw.active !== false,
      });
      if (existing) byId.delete(existing.id);
    }

    // Quien no venga en la lista se queda, dado de baja.
    for (const left of byId.values()) next.push({ ...left, active: false });

    await saveRoster(next);
    return NextResponse.json({ roster: next });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo guardar" },
      { status: 500 }
    );
  }
}
