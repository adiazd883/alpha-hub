import { NextRequest, NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/session";
import { isCelula, type Celula } from "@/lib/celulas";
import {
  CATALOGO,
  KPIS_ANALISTA,
  LONG_HOURS,
  MAX_DAYS_BACK,
  PUESTO_POR_ROL,
  TZ_OFFSET,
  categoriaDe,
  clock,
  deleteRegistro,
  getRegistro,
  listRegistros,
  mxDate,
  nameOf,
  newId,
  saveRegistro,
  type Puesto,
  type Registro,
} from "@/lib/tiempos";

export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Quién registra: analistas, paralegales y psychs de Alpha/Gamma; el Admin para probar.
function profile(session: Session) {
  const isAdmin = session.role === "ADMIN";
  const puesto = PUESTO_POR_ROL[session.role] || null;
  const celulas = session.celulas.filter((c) => c === "alpha" || c === "gamma");
  return { isAdmin, puesto, celulas, canRegister: isAdmin || (!!puesto && celulas.length > 0) };
}

const daysBack = (date: string) =>
  Math.round((Date.parse(`${clock().today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86400000);

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  const me = profile(session);
  if (!me.canRegister) return fail("El estudio de tiempos es para analistas, paralegales y psychs", 403);

  try {
    const all = await listRegistros();
    // Cada quien ve solo lo suyo; el Admin ve todo (los últimos 120 días aquí, el CSV trae todo).
    const since = new Date(Date.now() - 120 * 86400000).toISOString();
    const mine = all.filter((r) => r.email === session.email);
    const team = me.isAdmin ? all.filter((r) => r.inicio >= since) : [];
    return NextResponse.json({
      me: { email: session.email, nombre: nameOf(session.email), ...me },
      catalogo: CATALOGO,
      kpis: KPIS_ANALISTA,
      clock: clock(),
      mine: mine.filter((r) => r.inicio >= since),
      team,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error", 500);
  }
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) return fail("No autenticado", 401);
  const me = profile(session);
  if (!me.canRegister) return fail("El estudio de tiempos es para analistas, paralegales y psychs", 403);

  const body = await req.json().catch(() => ({}));
  const action = str(body.action, 20);

  try {
    const all = await listRegistros();
    const own = all.filter((r) => r.email === session.email);
    const running = own.find((r) => !r.fin);

    if (action === "stop") {
      if (!running) return fail("No tienes un cronómetro corriendo");
      const done = { ...running, fin: new Date().toISOString() };
      // Menos de un minuto: se inició por error, no se guarda.
      if (Date.parse(done.fin) - Date.parse(done.inicio) < 60000) {
        await deleteRegistro(done.id);
        return NextResponse.json({ discarded: true });
      }
      await saveRegistro(done);
      return NextResponse.json({ item: done });
    }

    if (action === "delete") {
      const item = await getRegistro(str(body.id, 60));
      if (!item || (item.email !== session.email && !me.isAdmin)) return fail("El registro no existe", 404);
      if (!me.isAdmin && daysBack(mxDate(item.inicio)) > MAX_DAYS_BACK) {
        return fail("Solo puedes modificar registros de hoy o de ayer");
      }
      await deleteRegistro(item.id);
      return NextResponse.json({ ok: true });
    }

    // start / manual / update: datos del registro.
    const existing = action === "update" ? await getRegistro(str(body.id, 60)) : null;
    if (action === "update" && (!existing || (existing.email !== session.email && !me.isAdmin))) {
      return fail("El registro no existe", 404);
    }
    const owner = existing?.email || session.email;

    const puesto = (me.isAdmin ? str(body.puesto, 20) || existing?.puesto : me.puesto) as Puesto | null;
    if (!puesto || !CATALOGO[puesto]) return fail("Elige el puesto");
    const actividad = str(body.actividad);
    const categoria = categoriaDe(puesto, actividad);
    if (!categoria) return fail("Elige una actividad de la lista");
    const kpi = puesto === "analista" ? str(body.kpi, 10) : "";
    if (puesto === "analista" && !KPIS_ANALISTA.includes(kpi)) return fail("Indica si es para DCL o CVL");
    const cliente = str(body.cliente).toUpperCase();
    if (!cliente) return fail("Escribe el cliente");
    const celulaIn = str(body.celula, 10);
    const celula = (isCelula(celulaIn) && (me.isAdmin || me.celulas.includes(celulaIn as Celula))
      ? celulaIn
      : existing?.celula || me.celulas[0] || "alpha") as Celula;

    let inicio: string;
    let fin: string | null;
    if (action === "start") {
      if (running) return fail("Ya tienes un cronómetro corriendo; detenlo primero");
      inicio = new Date().toISOString();
      fin = null;
    } else {
      const fecha = str(body.fecha, 10);
      const hIni = str(body.inicio, 5);
      const hFin = str(body.fin, 5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hIni) || !/^\d{2}:\d{2}$/.test(hFin)) {
        return fail("Escribe la fecha, la hora de inicio y la de fin");
      }
      if (!me.isAdmin && (daysBack(fecha) > MAX_DAYS_BACK || daysBack(fecha) < 0)) {
        return fail("Solo puedes registrar actividades de hoy o de ayer");
      }
      inicio = new Date(`${fecha}T${hIni}:00${TZ_OFFSET}`).toISOString();
      fin = new Date(`${fecha}T${hFin}:00${TZ_OFFSET}`).toISOString();
      if (fin <= inicio) return fail("La hora de fin debe ser después de la de inicio");
      if (fin > new Date().toISOString()) return fail("La hora de fin no puede ser en el futuro");
      const hours = (Date.parse(fin) - Date.parse(inicio)) / 3600000;
      if (hours > LONG_HOURS && body.confirmLong !== true) {
        return NextResponse.json({ needsConfirm: true, hours }, { status: 409 });
      }
    }

    // Sin traslapes con otros registros de la misma persona.
    const nowIso = new Date().toISOString();
    const clash = all.find(
      (r) =>
        r.email === owner &&
        r.id !== existing?.id &&
        r.inicio < (fin || nowIso) &&
        (r.fin || nowIso) > inicio
    );
    if (clash) {
      return fail(`Se traslapa con otro registro (${clash.actividad}, ${clash.cliente})`);
    }

    const item: Registro = {
      id: existing?.id || newId(),
      email: owner,
      nombre: nameOf(owner),
      celula,
      puesto,
      kpi,
      categoria,
      actividad,
      cliente,
      inicio,
      fin,
      creado: existing?.creado || nowIso,
      prueba: existing ? existing.prueba : me.isAdmin,
      modo: existing?.modo || (action === "start" ? "cronometro" : "manual"),
      editado:
        !!existing &&
        (existing.editado || existing.inicio !== inicio || existing.fin !== fin),
    };
    await saveRegistro(item);
    return NextResponse.json({ item });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo guardar", 500);
  }
}
