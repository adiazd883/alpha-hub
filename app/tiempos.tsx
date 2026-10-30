"use client";

import { useEffect, useMemo, useState } from "react";
import { CELULAS, type Celula } from "@/lib/celulas";
import type { Grupo, Puesto, Registro } from "@/lib/tiempos";

/*
 * Estudio de tiempos en el hub: cada analista, paralegal y psych
 * registra en qué se le va el tiempo, con las tareas de su
 * puesto. Cronómetro o captura manual, hoy o ayer. El Admin ve a
 * todo el equipo y descarga el CSV completo.
 */

type Me = {
  email: string;
  nombre: string;
  isAdmin: boolean;
  puesto: Puesto | null;
  celulas: Celula[];
};

type Data = {
  me: Me;
  catalogo: Record<Puesto, Grupo[]>;
  kpis: string[];
  clock: { today: string; yesterday: string; now: string; nowIso: string };
  mine: Registro[];
  team: Registro[];
};

const PUESTOS: { key: Puesto; label: string }[] = [
  { key: "analista", label: "Analista" },
  { key: "paralegal", label: "Paralegal" },
  { key: "psych", label: "Psych" },
];

const OFFSET_MS = 6 * 3600000; // Ciudad de México
const mxDate = (iso: string) => new Date(Date.parse(iso) - OFFSET_MS).toISOString().slice(0, 10);
const mxTime = (iso: string) => new Date(Date.parse(iso) - OFFSET_MS).toISOString().slice(11, 16);
const mins = (r: Registro, nowMs = Date.now()) =>
  Math.max(0, Math.round(((r.fin ? Date.parse(r.fin) : nowMs) - Date.parse(r.inicio)) / 60000));
const hhmm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;

function mondayOf(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function fmtDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const days = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

export default function EstudioTiempos({
  celula,
  clientes = [],
}: {
  celula: Celula;
  clientes?: string[];
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Registro | null>(null);
  const [tab, setTab] = useState<"mios" | "equipo">("mios");
  const [, setTick] = useState(0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/tiempos", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar el estudio de tiempos");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // El cronómetro avanza cada segundo.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  async function send(body: Record<string, unknown>) {
    const res = await fetch("/api/tiempos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (res.status === 409 && json.needsConfirm) {
      const ok = window.confirm(
        `Este registro dura ${json.hours.toFixed(1)} horas. ¿Es correcto?`
      );
      if (!ok) throw new Error("No se guardó");
      return send({ ...body, confirmLong: true });
    }
    if (!res.ok) throw new Error(json.error || "No se pudo guardar");
    return json;
  }

  async function act(body: Record<string, unknown>, msg: string) {
    setError("");
    try {
      await send(body);
      setNotice(msg);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  const running = data?.mine.find((r) => !r.fin) || null;

  return (
    <div className="rgPage tmPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">ESTUDIO DE TIEMPOS</p>
          <h1>Estudio de tiempos</h1>
          <p>Registra en qué actividad trabajas y para qué cliente. Puedes registrar hoy o ayer.</p>
        </div>
        <div className="cmHeaderActions">
          <button className="refreshButton" onClick={load}>
            ↻ Refresh
          </button>
          {data?.me.isAdmin && (
            <a className="rgBtn rgBtnGhost" href="/api/tiempos/export">
              ⬇ Descargar CSV
            </a>
          )}
        </div>
      </header>

      {error && <div className="errorBanner">{error}</div>}
      {notice && <div className="gmNotice">✓ {notice}</div>}

      {loading && !data ? (
        <div className="loadingCard">Cargando estudio de tiempos…</div>
      ) : (
        data && (
          <>
            {running && (
              <section className="tmRunning">
                <div>
                  <span className="tmDot" /> En curso desde {mxTime(running.inicio)}
                  <strong>
                    {running.actividad}
                    {running.kpi && ` · ${running.kpi}`}
                  </strong>
                  <small>{running.cliente}</small>
                </div>
                <div className="tmElapsed">{hhmm(mins(running))}</div>
                <button
                  className="rgBtn rgBtnPrimary"
                  onClick={() =>
                    act(
                      { action: "stop" },
                      mins(running) < 1
                        ? "Duró menos de un minuto; no se guardó"
                        : "Actividad detenida y guardada"
                    )
                  }
                >
                  ■ Detener
                </button>
              </section>
            )}

            <EntryForm
              key={editing?.id || "new"}
              data={data}
              celula={celula}
              clientes={clientes}
              editing={editing}
              running={!!running}
              onCancel={() => setEditing(null)}
              onSubmit={(body, msg) => act(body, msg)}
            />

            {data.me.isAdmin && (
              <div className="rgTabs tmTabs" role="tablist">
                {(["mios", "equipo"] as const).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    className={tab === t ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t === "mios" ? "Mis registros" : "Equipo"}
                  </button>
                ))}
              </div>
            )}

            {tab === "equipo" && data.me.isAdmin ? (
              <TeamView rows={data.team} catalogo={data.catalogo} today={data.clock.today} />
            ) : (
              <MyWeek
                rows={data.mine}
                today={data.clock.today}
                yesterday={data.clock.yesterday}
                isAdmin={data.me.isAdmin}
                onEdit={(r) => {
                  setEditing(r);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onDelete={(r) => {
                  if (window.confirm(`¿Borrar "${r.actividad}" de ${r.cliente}?`)) {
                    act({ action: "delete", id: r.id }, "Registro borrado");
                  }
                }}
              />
            )}
          </>
        )
      )}
    </div>
  );
}

function EntryForm({
  data,
  celula,
  clientes,
  editing,
  running,
  onCancel,
  onSubmit,
}: {
  data: Data;
  celula: Celula;
  clientes: string[];
  editing: Registro | null;
  running: boolean;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>, msg: string) => void;
}) {
  const { me, clock } = data;
  const [puesto, setPuesto] = useState<Puesto>(editing?.puesto || me.puesto || "analista");
  const [kpi, setKpi] = useState(editing?.kpi || "");
  const [actividad, setActividad] = useState(editing?.actividad || "");
  const [cliente, setCliente] = useState(editing?.cliente || "");
  const [mode, setMode] = useState<"timer" | "manual">(editing || running ? "manual" : "timer");
  const [fecha, setFecha] = useState(editing ? mxDate(editing.inicio) : clock.today);
  const [inicio, setInicio] = useState(editing ? mxTime(editing.inicio) : "");
  const [fin, setFin] = useState(editing?.fin ? mxTime(editing.fin) : clock.now);

  const grupos = data.catalogo[puesto];
  const manual = mode === "manual";
  const minutes = (() => {
    if (!inicio || !fin) return null;
    const [a, b] = inicio.split(":").map(Number);
    const [c, d] = fin.split(":").map(Number);
    return c * 60 + d - (a * 60 + b);
  })();

  // Clientes de la célula + los que ya registró.
  const sugerencias = useMemo(
    () => [...new Set([...clientes, ...data.mine.map((r) => r.cliente)])].sort(),
    [clientes, data.mine]
  );

  function submit() {
    const body = {
      action: editing ? "update" : manual ? "manual" : "start",
      id: editing?.id,
      puesto,
      kpi,
      actividad,
      cliente,
      celula: editing?.celula || celula,
      fecha,
      inicio,
      fin,
    };
    onSubmit(body, editing ? "Registro actualizado" : manual ? "Registro guardado" : "Cronómetro iniciado");
  }

  return (
    <section className="tmForm">
      <div className="tmFormTop">
        <h2>{editing ? "Editar registro" : "Nueva actividad"}</h2>
        {!editing && (
          <div className="rgSegment" role="group" aria-label="Modo">
            <button
              className={mode === "timer" ? "active" : ""}
              disabled={running}
              title={running ? "Ya tienes un cronómetro corriendo" : ""}
              onClick={() => setMode("timer")}
            >
              ⏱ Cronómetro
            </button>
            <button className={mode === "manual" ? "active" : ""} onClick={() => setMode("manual")}>
              ✎ Manual
            </button>
          </div>
        )}
      </div>

      <div className="tmGrid">
        {me.isAdmin && (
          <label className="rgField">
            <span>Puesto (prueba)</span>
            <select
              value={puesto}
              onChange={(e) => {
                setPuesto(e.target.value as Puesto);
                setActividad("");
              }}
            >
              {PUESTOS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="rgField tmWide">
          <span>Cliente</span>
          <input
            list="tm-clientes"
            value={cliente}
            placeholder="Nombre del cliente"
            onChange={(e) => setCliente(e.target.value)}
          />
          <datalist id="tm-clientes">
            {sugerencias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        {puesto === "analista" && (
          <div className="rgField">
            <span>¿Para qué?</span>
            <div className="rgChips">
              {data.kpis.map((k) => (
                <button
                  type="button"
                  key={k}
                  className={kpi === k ? "active" : ""}
                  aria-pressed={kpi === k}
                  onClick={() => setKpi(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="rgField tmWide">
          <span>Actividad</span>
          <select value={actividad} onChange={(e) => setActividad(e.target.value)}>
            <option value="">Elige la actividad…</option>
            {grupos.map((g) => (
              <optgroup key={g.categoria} label={g.categoria}>
                {g.actividades.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {manual && (
          <>
            <label className="rgField">
              <span>Fecha</span>
              {me.isAdmin ? (
                <input type="date" value={fecha} max={clock.today} onChange={(e) => setFecha(e.target.value)} />
              ) : (
                <select value={fecha} onChange={(e) => setFecha(e.target.value)}>
                  <option value={clock.today}>Hoy · {fmtDay(clock.today)}</option>
                  <option value={clock.yesterday}>Ayer · {fmtDay(clock.yesterday)}</option>
                </select>
              )}
            </label>
            <label className="rgField">
              <span>Inicio</span>
              <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </label>
            <label className="rgField">
              <span>Fin</span>
              <input type="time" value={fin} onChange={(e) => setFin(e.target.value)} />
            </label>
          </>
        )}
      </div>

      <div className="tmFormActions">
        {manual && minutes !== null && minutes > 0 && <span className="tmMinutes">{hhmm(minutes)}</span>}
        {editing && (
          <button className="rgBtn rgBtnGhost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button className="rgBtn rgBtnPrimary" onClick={submit}>
          {editing ? "Guardar cambios" : manual ? "Guardar" : "▶ Iniciar"}
        </button>
      </div>
    </section>
  );
}

function MyWeek({
  rows,
  today,
  yesterday,
  isAdmin,
  onEdit,
  onDelete,
}: {
  rows: Registro[];
  today: string;
  yesterday: string;
  isAdmin: boolean;
  onEdit: (r: Registro) => void;
  onDelete: (r: Registro) => void;
}) {
  const [week, setWeek] = useState(mondayOf(today));
  const end = addDays(week, 6);
  const done = rows.filter((r) => r.fin && mxDate(r.inicio) >= week && mxDate(r.inicio) <= end);
  const byDay = new Map<string, Registro[]>();
  done
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .forEach((r) => byDay.set(mxDate(r.inicio), [...(byDay.get(mxDate(r.inicio)) || []), r]));
  const total = done.reduce((t, r) => t + mins(r), 0);
  const canTouch = (r: Registro) => isAdmin || [today, yesterday].includes(mxDate(r.inicio));

  return (
    <section className="tmList">
      <div className="tmListHead">
        <div>
          <h2>Mis registros</h2>
          <span>
            Semana del {fmtDay(week)} · <strong>{hhmm(total)}</strong> en {done.length} registros
          </span>
        </div>
        <div className="calendarControls">
          <button onClick={() => setWeek(addDays(week, -7))}>‹</button>
          <button className="todayButton" onClick={() => setWeek(mondayOf(today))}>
            Esta semana
          </button>
          <button onClick={() => setWeek(addDays(week, 7))} disabled={week >= mondayOf(today)}>
            ›
          </button>
        </div>
      </div>

      {[...byDay.entries()].map(([day, items]) => (
        <div key={day} className="tmDay">
          <div className="tmDayHead">
            <strong>{fmtDay(day)}</strong>
            <span>{hhmm(items.reduce((t, r) => t + mins(r), 0))}</span>
          </div>
          {items.map((r) => (
            <div key={r.id} className="tmRow">
              <span className="tmTime">
                {mxTime(r.inicio)} – {mxTime(r.fin!)}
              </span>
              <div className="tmWhat">
                <strong>
                  {r.actividad}
                  {r.kpi && <em> · {r.kpi}</em>}
                </strong>
                <small>
                  {r.cliente} · {r.categoria}
                </small>
              </div>
              <span className="tmDur">{hhmm(mins(r))}</span>
              {canTouch(r) && (
                <span className="rgCardMinor">
                  <button onClick={() => onEdit(r)}>Editar</button>
                  <button onClick={() => onDelete(r)}>Borrar</button>
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      {!done.length && <div className="gmEmpty">No hay registros esta semana.</div>}
    </section>
  );
}

function TeamView({
  rows,
  catalogo,
  today,
}: {
  rows: Registro[];
  catalogo: Record<Puesto, Grupo[]>;
  today: string;
}) {
  const [week, setWeek] = useState(mondayOf(today));
  const [celula, setCelula] = useState("todas");
  const [puesto, setPuesto] = useState("todos");
  const [persona, setPersona] = useState("todos");
  const [pruebas, setPruebas] = useState(false);
  const end = addDays(week, 6);

  const base = rows.filter(
    (r) =>
      r.fin &&
      (pruebas || !r.prueba) &&
      mxDate(r.inicio) >= week &&
      mxDate(r.inicio) <= end &&
      (celula === "todas" || r.celula === celula) &&
      (puesto === "todos" || r.puesto === puesto)
  );
  const personas = [...new Set(base.map((r) => r.nombre))].sort();
  const visible = base.filter((r) => persona === "todos" || r.nombre === persona);
  const total = visible.reduce((t, r) => t + mins(r), 0);

  const sumBy = (key: (r: Registro) => string) => {
    const m = new Map<string, { min: number; n: number }>();
    visible.forEach((r) => {
      const k = key(r);
      const cur = m.get(k) || { min: 0, n: 0 };
      m.set(k, { min: cur.min + mins(r), n: cur.n + 1 });
    });
    return [...m.entries()].sort((a, b) => b[1].min - a[1].min);
  };
  const porPersona = sumBy((r) => `${r.nombre}|${r.puesto}`);
  const porCategoria = sumBy((r) => r.categoria);
  const porActividad = sumBy((r) => `${r.actividad}${r.kpi ? ` · ${r.kpi}` : ""}`).slice(0, 12);
  const max = (list: [string, { min: number }][]) => Math.max(1, ...list.map(([, v]) => v.min));

  const bars = (title: string, list: [string, { min: number; n: number }][], label: (k: string) => string) => (
    <section className="gmTableCard tmBars">
      <h3>{title}</h3>
      {list.map(([k, v]) => (
        <div key={k} className="tmBar">
          <span className="tmBarLabel" title={label(k)}>
            {label(k)}
          </span>
          <span className="tmBarTrack">
            <i style={{ width: `${(v.min / max(list)) * 100}%` }} />
          </span>
          <span className="tmBarValue">
            {hhmm(v.min)} <em>· {v.n}</em>
          </span>
        </div>
      ))}
      {!list.length && <div className="gmEmpty">Sin registros.</div>}
    </section>
  );

  return (
    <section className="tmTeam">
      <div className="gmFilters cmFilters">
        <div className="calendarControls">
          <button onClick={() => setWeek(addDays(week, -7))}>‹</button>
          <button className="todayButton" onClick={() => setWeek(mondayOf(today))}>
            Semana del {fmtDay(week)}
          </button>
          <button onClick={() => setWeek(addDays(week, 7))} disabled={week >= mondayOf(today)}>
            ›
          </button>
        </div>
        <select value={celula} onChange={(e) => setCelula(e.target.value)} aria-label="Célula">
          <option value="todas">Alpha y Gamma</option>
          {(["alpha", "gamma"] as Celula[]).map((c) => (
            <option key={c} value={c}>
              {CELULAS[c].label}
            </option>
          ))}
        </select>
        <select value={puesto} onChange={(e) => setPuesto(e.target.value)} aria-label="Puesto">
          <option value="todos">Todos los puestos</option>
          {PUESTOS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Colaborador">
          <option value="todos">Todo el equipo</option>
          {personas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <label className="tmCheck">
          <input type="checkbox" checked={pruebas} onChange={(e) => setPruebas(e.target.checked)} />
          Incluir mis pruebas
        </label>
        <span className="rsCount">
          {hhmm(total)} · {visible.length} registros
        </span>
      </div>

      <div className="tmTeamGrid">
        {bars("Por colaborador", porPersona, (k) => {
          const [n, p] = k.split("|");
          return `${n} · ${PUESTOS.find((x) => x.key === p)?.label || p}`;
        })}
        {bars("Por tipo de actividad", porCategoria, (k) => k)}
      </div>
      {bars("Actividades con más tiempo", porActividad, (k) => k)}

      <p className="tmNote">
        Las actividades vienen de la lista de tareas de cada puesto ({Object.values(catalogo).reduce(
          (t, g) => t + g.reduce((a, x) => a + x.actividades.length, 0),
          0
        )} en total). El CSV trae todo el histórico.
      </p>
    </section>
  );
}
