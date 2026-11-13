"use client";

import { useEffect, useMemo, useState } from "react";
import { CELULAS, type Celula } from "@/lib/celulas";
import type { Grupo, Puesto, Registro, TiemposCelula } from "@/lib/tiempos";

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
  canRegister: boolean;
  canSeeTeam: boolean;
  // Con qué puesto registra en cada vista.
  puestos: Partial<Record<TiemposCelula, Puesto>>;
  celulas: TiemposCelula[];
};

type Data = {
  me: Me;
  catalogo: Record<Puesto, Grupo[]>;
  kpis: string[];
  clock: { today: string; yesterday: string; now: string; nowIso: string };
  mine: Registro[];
  team: Registro[];
  clientesExtra: string[];
  sinCliente: string[];
};

type VistaPuesto = "celulas" | "gmc" | "atty";

const PUESTOS: { key: Puesto; label: string; vista: VistaPuesto }[] = [
  { key: "analista", label: "Analista", vista: "celulas" },
  { key: "paralegal", label: "Paralegal", vista: "celulas" },
  { key: "psych", label: "Psych", vista: "celulas" },
  { key: "gb", label: "GB", vista: "gmc" },
  { key: "gb_sup", label: "Supervisor GB", vista: "gmc" },
  { key: "sr", label: "Special Reports", vista: "gmc" },
  { key: "sr_sup", label: "Supervisor SR", vista: "gmc" },
  { key: "ea", label: "Evidence Analyst", vista: "gmc" },
  { key: "gmc_tl", label: "TL GMC", vista: "gmc" },
  { key: "atty_scarlet", label: "Paralegal Atty · Scarlet", vista: "atty" },
  { key: "atty_galilea", label: "Paralegal Atty · Galilea", vista: "atty" },
];

const vistaDe = (c: string): VistaPuesto => (c === "gmc" || c === "atty" ? c : "celulas");

// Actividades donde se escribe qué se hizo.
const LIBRES = ["Otro", "Actividad extraordinaria"];
const actividadLabel = (r: Registro) => (r.otro ? `${r.actividad}: ${r.otro}` : r.actividad);
const celulaLabel = (c: string) =>
  c === "gmc" ? "GMC" : c === "atty" ? "Atty" : CELULAS[c as Celula]?.label || c;

const OFFSET_MS = 6 * 3600000; // Ciudad de México
const mxDate = (iso: string) => new Date(Date.parse(iso) - OFFSET_MS).toISOString().slice(0, 10);
const mxTime = (iso: string) => new Date(Date.parse(iso) - OFFSET_MS).toISOString().slice(11, 16);
const mins = (r: Registro, nowMs = Date.now()) =>
  Math.max(0, Math.round(((r.fin ? Date.parse(r.fin) : nowMs) - Date.parse(r.inicio)) / 60000));
const hhmm = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;

// Aplica a la página lo que respondió el servidor al guardar.
function aplicar(d: Data, body: Record<string, unknown>, json: { item?: Registro; discarded?: boolean }): Data {
  const quitar = (rows: Registro[], id: unknown) => rows.filter((r) => r.id !== id);
  const poner = (rows: Registro[], it: Registro) => [...quitar(rows, it.id), it];
  if (body.action === "delete") {
    return { ...d, mine: quitar(d.mine, body.id), team: quitar(d.team, body.id) };
  }
  if (json.discarded) {
    const corriendo = d.mine.find((r) => !r.fin);
    return corriendo ? { ...d, mine: quitar(d.mine, corriendo.id), team: quitar(d.team, corriendo.id) } : d;
  }
  const it = json.item;
  if (!it) return d;
  return {
    ...d,
    mine: it.email === d.me.email ? poner(d.mine, it) : d.mine,
    team: d.me.canSeeTeam ? poner(d.team, it) : d.team,
  };
}

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
  celula: TiemposCelula;
  clientes?: string[];
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Registro | null>(null);
  const [tab, setTab] = useState<"mios" | "equipo" | "lista">("mios");
  // Manager, TL y CS solo ven al equipo.
  const onlyTeam = !!data && !data.me.canRegister;
  const [, setTick] = useState(0);

  // ligera: recarga después de guardar, sin volver a pedir los
  // clientes a las Sheets (se quedan los que ya había).
  async function load(ligera = false) {
    if (!ligera) setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/tiempos?celula=${celula}${ligera ? "&clientes=0" : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar el estudio de tiempos");
      setData((prev) => (ligera && prev ? { ...json, clientesExtra: prev.clientesExtra } : json));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const running = data?.mine.find((r) => !r.fin) || null;

  // El cronómetro avanza cada segundo (solo si hay uno corriendo).
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [!!running]);

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
      const json = await send(body);
      setNotice(msg);
      setEditing(null);
      // Se refleja al instante; la recarga completa va en segundo plano.
      setData((prev) => (prev ? aplicar(prev, body, json) : prev));
      load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  return (
    <div className="rgPage tmPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">ESTUDIO DE TIEMPOS{vistaDe(celula) !== "celulas" && ` · ${celulaLabel(celula).toUpperCase()}`}</p>
          <h1>Estudio de tiempos</h1>
          <p>Registra en qué actividad trabajas y para qué cliente. Puedes registrar hoy o ayer.</p>
        </div>
        <div className="cmHeaderActions">
          <button className="refreshButton" onClick={() => load()}>
            ↻ Refresh
          </button>
          {data?.me.canSeeTeam && (
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
                    {actividadLabel(running)}
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

            {!onlyTeam && (
            <EntryForm
              key={editing?.id || "new"}
              data={data}
              celula={celula}
              clientes={vistaDe(celula) === "celulas" ? clientes : data.clientesExtra}
              editing={editing}
              running={!!running}
              onCancel={() => setEditing(null)}
              onSubmit={(body, msg) => act(body, msg)}
            />
            )}

            {data.me.canSeeTeam && (
              <div className="rgTabs tmTabs" role="tablist">
                {(onlyTeam ? (["equipo", "lista"] as const) : (["mios", "equipo", "lista"] as const)).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t || (onlyTeam && tab === "mios" && t === "equipo")}
                    className={tab === t || (onlyTeam && tab === "mios" && t === "equipo") ? "active" : ""}
                    onClick={() => setTab(t)}
                  >
                    {t === "mios" ? "Mis registros" : t === "equipo" ? "Equipo" : "Lista de registros"}
                  </button>
                ))}
              </div>
            )}

            {(tab !== "mios" || onlyTeam) && data.me.canSeeTeam ? (
              <TeamView
                key={tab === "lista" ? "lista" : "equipo"}
                lista={tab === "lista"}
                rows={data.team}
                catalogo={data.catalogo}
                today={data.clock.today}
                initialCelula={vistaDe(celula) === "celulas" ? "todas" : celula}
                isAdmin={data.me.isAdmin}
                onEdit={(r) => {
                  setEditing(r);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onDelete={(r) => {
                  if (window.confirm(`¿Borrar "${r.actividad}" de ${r.nombre} (${r.cliente})?`)) {
                    act({ action: "delete", id: r.id }, "Registro borrado");
                  }
                }}
              />
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

// Sin acentos ni mayúsculas, para buscar.
const fold = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/*
 * Buscador de actividad: al escribir ("ll") salen primero las que
 * empiezan así y luego las que tienen una palabra que empieza así.
 * También se puede buscar por número (12, RS-1).
 */
function ActivityPicker({
  grupos,
  numero,
  value,
  onChange,
}: {
  grupos: Grupo[];
  numero: (a: string) => string | number;
  value: string;
  onChange: (a: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const options = useMemo(() => {
    const q = fold(query);
    const all = grupos.flatMap((g) =>
      g.actividades.map((a, i) => ({
        a,
        categoria: g.categoria,
        n: String(numero(a)),
        desc: g.descripciones?.[i] || "",
      }))
    );
    if (!q) return all;
    const rank = (o: (typeof all)[number]) => {
      const name = fold(o.a);
      if (name.startsWith(q) || fold(o.n).startsWith(q)) return 0;
      return name.split(/[^a-z0-9]+/).some((w) => w.startsWith(q)) ? 1 : -1;
    };
    return all
      .map((o) => ({ o, r: rank(o) }))
      .filter((x) => x.r >= 0)
      .sort((x, y) => x.r - y.r)
      .map((x) => x.o);
  }, [grupos, numero, query]);

  function pick(a: string) {
    onChange(a);
    setQuery("");
    setOpen(false);
  }

  const shown = value ? `${numero(value)}. ${value}` : "";

  return (
    <div className="tmPicker">
      <input
        value={open ? query : shown}
        placeholder="Escribe para buscar (ej. LL) o elige de la lista…"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(options.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && options[active]) {
            e.preventDefault();
            pick(options[active].a);
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {open && (
        <ul className="rgSuggest tmPickerList">
          {options.map((o, i) => (
            <li key={`${o.categoria}-${o.a}`}>
              {(i === 0 || options[i - 1].categoria !== o.categoria) && !query && (
                <div className="tmPickerGroup">{o.categoria}</div>
              )}
              <button
                type="button"
                className={i === active ? "active" : ""}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o.a);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <strong>
                  {o.n}. {o.a}
                </strong>
                {(query || o.desc) && (
                  <span>
                    {query && o.categoria}
                    {query && o.desc && " · "}
                    {o.desc}
                  </span>
                )}
              </button>
            </li>
          ))}
          {!options.length && <li className="tmPickerEmpty">No hay actividades con “{query}”.</li>}
        </ul>
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
  celula: TiemposCelula;
  clientes: string[];
  editing: Registro | null;
  running: boolean;
  onCancel: () => void;
  onSubmit: (body: Record<string, unknown>, msg: string) => void;
}) {
  const { me, clock } = data;
  const celulaReg = editing?.celula || celula;
  const vista = vistaDe(celulaReg);
  const [puesto, setPuesto] = useState<Puesto>(
    editing?.puesto ||
      me.puestos[celulaReg] ||
      PUESTOS.find((p) => p.vista === vista)!.key
  );
  const [kpi, setKpi] = useState(editing?.kpi || "");
  const [actividad, setActividad] = useState(editing?.actividad || "");
  const [otro, setOtro] = useState(editing?.otro || "");
  const [cliente, setCliente] = useState(editing?.cliente || "");
  // GMC: el cliente es opcional en actividades internas; Atty: siempre.
  const clienteOpcional =
    vista === "atty" || (vista === "gmc" && data.sinCliente.includes(actividad));
  const [mode, setMode] = useState<"timer" | "manual">(editing || running ? "manual" : "timer");
  const [fecha, setFecha] = useState(editing ? mxDate(editing.inicio) : clock.today);
  const [inicio, setInicio] = useState(editing ? mxTime(editing.inicio) : "");
  const [fin, setFin] = useState(editing?.fin ? mxTime(editing.fin) : clock.now);

  // Grupos de su célula (Rap Sheet solo aparece en Gamma).
  const celulaForm = editing?.celula || celula;
  const grupos = data.catalogo[puesto]
    .filter((g) => !g.celulas || g.celulas.includes(celulaForm as Celula));
  // 1, 2, 3… y los grupos con código con su propia numeración (RS-1…).
  const numero = (a: string) => {
    let n = 0;
    for (const g of data.catalogo[puesto]) {
      const i = g.actividades.indexOf(a);
      // GMC: el número del PDF.
      if (g.numeros) {
        if (i >= 0) return g.numeros[i];
        continue;
      }
      if (g.codigo) {
        if (i >= 0) return `${g.codigo}-${i + 1}`;
        continue;
      }
      if (i >= 0) return n + i + 1;
      n += g.actividades.length;
    }
    return "";
  };
  const manual = mode === "manual";
  const minutes = (() => {
    if (!inicio || !fin) return null;
    const [a, b] = inicio.split(":").map(Number);
    const [c, d] = fin.split(":").map(Number);
    return c * 60 + d - (a * 60 + b);
  })();

  // Clientes de la célula + los que ya registró.
  const sugerencias = useMemo(
    () => [
      // En Atty, "NO APLICA" para actividades sin cliente.
      ...(vista === "atty" ? ["NO APLICA"] : []),
      ...[...new Set([...clientes, ...data.mine.map((r) => r.cliente)])]
        .filter((c) => c !== "NO APLICA")
        .sort(),
    ],
    [clientes, data.mine, vista]
  );

  function submit() {
    const body = {
      action: editing ? "update" : manual ? "manual" : "start",
      id: editing?.id,
      puesto,
      kpi,
      actividad,
      otro,
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
              {PUESTOS.filter((p) => p.vista === vista).map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="rgField tmWide">
          <span>Cliente{clienteOpcional && " (opcional)"}</span>
          <input
            list="tm-clientes"
            value={cliente}
            placeholder={
              clienteOpcional ? `Vacío = ${vista === "atty" ? "NO APLICA" : "INTERNO"}` : "Nombre del cliente"
            }
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

        <div className="rgField tmWide">
          <span>Actividad</span>
          <ActivityPicker grupos={grupos} numero={numero} value={actividad} onChange={setActividad} />
        </div>

        {LIBRES.includes(actividad) && (
          <label className="rgField tmWide">
            <span>¿Qué actividad hiciste?</span>
            <input
              value={otro}
              maxLength={150}
              placeholder="Escribe la actividad"
              onChange={(e) => setOtro(e.target.value)}
            />
          </label>
        )}

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
                  {actividadLabel(r)}
                  {r.kpi && <em> · {r.kpi}</em>}
                </strong>
                <small>
                  {r.cliente} · {r.categoria}
                </small>
              </div>
              <span className="tmDur">
                {hhmm(mins(r))}
                <ModeTag r={r} />
              </span>
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

/*
 * Alertas para revisar registros: algo que suele ser un error de
 * captura (cronómetro olvidado, registro de segundos, horas raras,
 * capturado otro día, editado a mano).
 */
function alertasDe(r: Registro) {
  const out: string[] = [];
  const m = mins(r);
  if (m > 240) out.push("Más de 4 h");
  if (m < 3) out.push("Menos de 3 min");
  const ini = mxTime(r.inicio);
  const fin = r.fin ? mxTime(r.fin) : ini;
  if (ini < "07:00" || fin > "21:00" || (r.fin && mxDate(r.fin) !== mxDate(r.inicio))) out.push("Fuera de horario");
  if (r.creado && mxDate(r.creado) !== mxDate(r.inicio)) out.push("Capturado otro día");
  if (r.editado) out.push("Editado");
  return out;
}

type Modo = "semana" | "mes" | "rango";

function TeamView({
  rows,
  catalogo,
  today,
  initialCelula,
  lista,
  isAdmin,
  onEdit,
  onDelete,
}: {
  rows: Registro[];
  catalogo: Record<Puesto, Grupo[]>;
  today: string;
  initialCelula: string;
  // "Lista de registros": mismos filtros, sin gráficas.
  lista: boolean;
  isAdmin: boolean;
  onEdit: (r: Registro) => void;
  onDelete: (r: Registro) => void;
}) {
  const [week, setWeek] = useState(mondayOf(today));
  // Periodo: semana (con días sueltos), mes o un rango de fechas.
  const [modo, setModo] = useState<Modo>("semana");
  const [mes, setMes] = useState(today.slice(0, 7));
  const [desde, setDesde] = useState(mondayOf(today));
  const [hasta, setHasta] = useState(today);
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [celula, setCelula] = useState(initialCelula);
  const celulasEquipo = [...new Set(rows.map((r) => r.celula))].sort();
  const [puesto, setPuesto] = useState("todos");
  const [persona, setPersona] = useState("todos");
  const [pruebas, setPruebas] = useState(false);
  // Días sueltos de la semana; vacío = la semana completa.
  const [dias, setDias] = useState<string[]>([]);
  const [clientesSel, setClientesSel] = useState<string[]>([]);
  const [clienteQuery, setClienteQuery] = useState("");
  const [todas, setTodas] = useState(false);
  const [zoom, setZoom] = useState<{ title: string; rows: Registro[] } | null>(null);
  const end = addDays(week, 6);
  const semana = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const finDeMes = (ym: string) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  };
  const moverMes = (ym: string, n: number) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  };
  const [from, to] =
    modo === "semana"
      ? [week, end]
      : modo === "mes"
        ? [`${mes}-01`, finDeMes(mes)]
        : desde <= hasta
          ? [desde, hasta]
          : [hasta, desde];

  function moveWeek(to: string) {
    setWeek(to);
    setDias([]);
  }

  const enSemana = rows.filter(
    (r) =>
      r.fin &&
      (pruebas || !r.prueba) &&
      mxDate(r.inicio) >= from &&
      mxDate(r.inicio) <= to &&
      (celula === "todas" || r.celula === celula) &&
      (puesto === "todos" || r.puesto === puesto)
  );
  const base = enSemana.filter(
    (r) => modo !== "semana" || !dias.length || dias.includes(mxDate(r.inicio))
  );
  const personas = [...new Set(base.map((r) => r.nombre))].sort();
  const porPersonaBase = base.filter((r) => persona === "todos" || r.nombre === persona);
  const clientesDisp = [...new Set(porPersonaBase.map((r) => r.cliente))].sort();
  const visible = porPersonaBase.filter(
    (r) => !clientesSel.length || clientesSel.includes(r.cliente)
  );
  const total = visible.reduce((t, r) => t + mins(r), 0);
  const minDia = (d: string) =>
    enSemana
      .filter((r) => mxDate(r.inicio) === d && (persona === "todos" || r.nombre === persona))
      .reduce((t, r) => t + mins(r), 0);
  const sugeridos = clientesDisp
    .filter((c) => !clientesSel.includes(c) && fold(c).includes(fold(clienteQuery)))
    .slice(0, 8);

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
  const porModo = sumBy((r) =>
    r.modo === "cronometro" ? "Cronómetro" : r.modo === "manual" ? "Manual" : "Sin dato"
  );
  const actividadDe = (r: Registro) =>
    `${actividadLabel(r)}${r.kpi ? ` · ${r.kpi}` : ""}`;
  const actividades = sumBy(actividadDe);
  const verTodas = todas || persona !== "todos" || clientesSel.length > 0;
  const porActividad = verTodas ? actividades : actividades.slice(0, 12);
  const max = (list: [string, { min: number }][]) => Math.max(1, ...list.map(([, v]) => v.min));

  const bars = (
    title: string,
    list: [string, { min: number; n: number }][],
    label: (k: string) => string,
    onOpen?: (k: string) => void,
    hint = "Doble clic para ver los clientes"
  ) => (
    <section className="gmTableCard tmBars">
      <h3>
        {title}
        {onOpen && list.length > 0 && <small> · {hint}</small>}
      </h3>
      {list.map(([k, v]) => (
        <div
          key={k}
          className={`tmBar ${onOpen ? "tmBarZoom" : ""}`}
          onDoubleClick={onOpen ? () => onOpen(k) : undefined}
          title={onOpen ? hint : undefined}
        >
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
        <div className="rgSegment" role="group" aria-label="Periodo">
          {(
            [
              ["semana", "Semana"],
              ["mes", "Mes"],
              ["rango", "Rango"],
            ] as [Modo, string][]
          ).map(([k, l]) => (
            <button key={k} className={modo === k ? "active" : ""} onClick={() => setModo(k)}>
              {l}
            </button>
          ))}
        </div>
        {modo === "semana" && (
          <div className="calendarControls">
            <button onClick={() => moveWeek(addDays(week, -7))}>‹</button>
            <button className="todayButton" onClick={() => moveWeek(mondayOf(today))}>
              Semana del {fmtDay(week)}
            </button>
            <button onClick={() => moveWeek(addDays(week, 7))} disabled={week >= mondayOf(today)}>
              ›
            </button>
          </div>
        )}
        {modo === "mes" && (
          <div className="calendarControls">
            <button onClick={() => setMes(moverMes(mes, -1))}>‹</button>
            <input
              type="month"
              className="tmMonth"
              value={mes}
              max={today.slice(0, 7)}
              onChange={(e) => e.target.value && setMes(e.target.value)}
            />
            <button onClick={() => setMes(moverMes(mes, 1))} disabled={mes >= today.slice(0, 7)}>
              ›
            </button>
          </div>
        )}
        {modo === "rango" && (
          <div className="tmRange">
            <input type="date" value={desde} max={today} onChange={(e) => e.target.value && setDesde(e.target.value)} />
            <span>a</span>
            <input type="date" value={hasta} max={today} onChange={(e) => e.target.value && setHasta(e.target.value)} />
          </div>
        )}
        <select value={celula} onChange={(e) => setCelula(e.target.value)} aria-label="Célula">
          <option value="todas">Todas las células</option>
          {[...new Set([...celulasEquipo, initialCelula].filter((c) => c !== "todas"))].map((c) => (
            <option key={c} value={c}>
              {celulaLabel(c)}
            </option>
          ))}
        </select>
        <select value={puesto} onChange={(e) => setPuesto(e.target.value)} aria-label="Puesto">
          <option value="todos">Todos los puestos</option>
          {PUESTOS.filter(
            (p) => celula === "todas" || p.vista === vistaDe(celula)
          ).map((p) => (
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

      <div className="tmPeriod">
        {modo === "semana" ? (
        <div className="rgChips rgChipsSmall" role="group" aria-label="Días">
          <button className={!dias.length ? "active" : ""} onClick={() => setDias([])}>
            Toda la semana
          </button>
          {semana.map((d) => (
            <button
              key={d}
              className={dias.includes(d) ? "active" : ""}
              aria-pressed={dias.includes(d)}
              disabled={d > today}
              onClick={() =>
                setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()))
              }
              title="Elige uno o varios días"
            >
              {fmtDay(d)}
              {minDia(d) > 0 && <em> · {Math.round((minDia(d) / 60) * 10) / 10} h</em>}
            </button>
          ))}
        </div>
        ) : (
          <span className="rsCount">
            Del {fmtDay(from)} al {fmtDay(to)}
          </span>
        )}

        <div className="tmClientFilter">
          {clientesSel.map((c) => (
            <span key={c} className="tmClientChip">
              {c}
              <button aria-label={`Quitar ${c}`} onClick={() => setClientesSel((p) => p.filter((x) => x !== c))}>
                ×
              </button>
            </span>
          ))}
          <div className="rgField tmClientSearch">
            <input
              value={clienteQuery}
              placeholder={clientesSel.length ? "Agregar otro cliente…" : "Buscar cliente…"}
              onChange={(e) => setClienteQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sugeridos[0]) {
                  setClientesSel((p) => [...p, sugeridos[0]]);
                  setClienteQuery("");
                }
              }}
            />
            {clienteQuery && (
              <ul className="rgSuggest">
                {sugeridos.map((c) => (
                  <li key={c}>
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setClientesSel((p) => [...p, c]);
                        setClienteQuery("");
                      }}
                    >
                      <strong>{c}</strong>
                    </button>
                  </li>
                ))}
                {!sugeridos.length && <li className="tmPickerEmpty">Sin clientes con “{clienteQuery}”.</li>}
              </ul>
            )}
          </div>
          {clientesSel.length > 0 && (
            <button className="rgBtn rgBtnGhost" onClick={() => setClientesSel([])}>
              Limpiar clientes
            </button>
          )}
        </div>
      </div>

      {lista ? (
        <RegistrosDetalle
          rows={visible}
          persona={persona}
          soloAlertas={soloAlertas}
          setSoloAlertas={setSoloAlertas}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : (
      <>
      <div className="tmTeamGrid">
        {bars(
          "Por colaborador",
          porPersona,
          (k) => {
            const [n, p] = k.split("|");
            return `${n} · ${PUESTOS.find((x) => x.key === p)?.label || p}`;
          },
          persona === "todos" ? (k) => setPersona(k.split("|")[0]) : undefined,
          "Doble clic para ver sus actividades"
        )}
        {bars("Por tipo de actividad", porCategoria, (k) => k, (k) =>
          setZoom({ title: k, rows: visible.filter((r) => r.categoria === k) })
        )}
        {bars("Cronómetro vs manual", porModo, (k) => k)}
      </div>
      {bars(
        persona === "todos" ? "Actividades con más tiempo" : `Actividades de ${persona}`,
        porActividad,
        (k) => k,
        (k) => setZoom({ title: k, rows: visible.filter((r) => actividadDe(r) === k) })
      )}
      {!verTodas && actividades.length > 12 && (
        <button className="rgBtn rgBtnGhost tmMore" onClick={() => setTodas(true)}>
          Ver las {actividades.length} actividades
        </button>
      )}

      {zoom && <ZoomClientes zoom={zoom} persona={persona} onClose={() => setZoom(null)} />}
      </>
      )}

      <p className="tmNote">
        Las actividades vienen de la lista de tareas de cada puesto ({Object.values(catalogo).reduce(
          (t, g) => t + g.reduce((a, x) => a + x.actividades.length, 0),
          0
        )} en total). El CSV trae todo el histórico.
      </p>
    </section>
  );
}

/*
 * Lista de registros del periodo y filtros, por día y persona, para
 * revisar dónde hay errores de captura. El Admin puede corregirlos.
 */
function RegistrosDetalle({
  rows,
  persona,
  soloAlertas,
  setSoloAlertas,
  isAdmin,
  onEdit,
  onDelete,
}: {
  rows: Registro[];
  persona: string;
  soloAlertas: boolean;
  setSoloAlertas: (v: boolean) => void;
  isAdmin: boolean;
  onEdit: (r: Registro) => void;
  onDelete: (r: Registro) => void;
}) {
  const conAlerta = rows.filter((r) => alertasDe(r).length).length;
  const lista = rows
    .filter((r) => !soloAlertas || alertasDe(r).length)
    .sort((a, b) => b.inicio.localeCompare(a.inicio));
  // Día → persona → registros.
  const porDia = new Map<string, Map<string, Registro[]>>();
  lista.forEach((r) => {
    const d = mxDate(r.inicio);
    const dia = porDia.get(d) || new Map<string, Registro[]>();
    dia.set(r.nombre, [...(dia.get(r.nombre) || []), r]);
    porDia.set(d, dia);
  });

  return (
    <section className="tmList tmDetalle">
      <div className="tmListHead">
        <div>
          <h2>Registros {persona === "todos" ? "del equipo" : `de ${persona}`}</h2>
          <span>
            {lista.length} registros · {conAlerta} con alerta
          </span>
        </div>
        <label className="tmCheck">
          <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
          Solo con alerta
        </label>
      </div>

      {[...porDia.entries()].map(([dia, personas]) => (
        <div key={dia} className="tmDay">
          <div className="tmDayHead">
            <strong>{fmtDay(dia)}</strong>
            <span>{hhmm([...personas.values()].flat().reduce((t, r) => t + mins(r), 0))}</span>
          </div>
          {[...personas.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([nombre, items]) => (
              <div key={nombre} className="tmDetallePersona">
                {persona === "todos" && (
                  <div className="tmDetalleNombre">
                    {nombre} · {hhmm(items.reduce((t, r) => t + mins(r), 0))}
                  </div>
                )}
                {items
                  .slice()
                  .sort((a, b) => a.inicio.localeCompare(b.inicio))
                  .map((r) => {
                    const alertas = alertasDe(r);
                    return (
                      <div key={r.id} className={`tmRow ${alertas.length ? "tmRowAlerta" : ""}`}>
                        <span className="tmTime">
                          {mxTime(r.inicio)} – {r.fin ? mxTime(r.fin) : "…"}
                        </span>
                        <div className="tmWhat">
                          <strong>
                            {actividadLabel(r)}
                            {r.kpi && <em> · {r.kpi}</em>}
                          </strong>
                          <small>
                            {r.cliente} · {r.categoria}
                            {r.prueba && " · prueba"}
                          </small>
                          {alertas.length > 0 && (
                            <span className="tmAlertas">
                              {alertas.map((a) => (
                                <b key={a}>⚠ {a}</b>
                              ))}
                            </span>
                          )}
                        </div>
                        <span className="tmDur">
                          {hhmm(mins(r))}
                          <ModeTag r={r} />
                        </span>
                        {isAdmin ? (
                          <span className="rgCardMinor">
                            <button onClick={() => onEdit(r)}>Editar</button>
                            <button onClick={() => onDelete(r)}>Borrar</button>
                          </span>
                        ) : (
                          <span />
                        )}
                      </div>
                    );
                  })}
              </div>
            ))}
        </div>
      ))}

      {!lista.length && <div className="gmEmpty">Sin registros con estos filtros.</div>}
    </section>
  );
}

// Zoom de una actividad: en qué clientes se fue ese tiempo.
function ZoomClientes({
  zoom,
  persona,
  onClose,
}: {
  zoom: { title: string; rows: Registro[] };
  persona: string;
  onClose: () => void;
}) {
  const porCliente = new Map<string, { min: number; n: number; personas: Set<string> }>();
  zoom.rows.forEach((r) => {
    const cur = porCliente.get(r.cliente) || { min: 0, n: 0, personas: new Set<string>() };
    cur.min += mins(r);
    cur.n += 1;
    cur.personas.add(r.nombre);
    porCliente.set(r.cliente, cur);
  });
  const list = [...porCliente.entries()].sort((a, b) => b[1].min - a[1].min);
  const total = list.reduce((t, [, v]) => t + v.min, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tmZoomBackdrop" onClick={onClose}>
      <section className="tmZoom" role="dialog" aria-label={zoom.title} onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">{persona === "todos" ? "TODO EL EQUIPO" : persona}</p>
            <h3>{zoom.title}</h3>
            <span>
              {hhmm(total)} · {zoom.rows.length} registros · {list.length} clientes
            </span>
          </div>
          <button className="rgBtn rgBtnGhost" onClick={onClose}>
            Cerrar
          </button>
        </header>
        <div className="tmZoomTable">
          <div className="tmZoomRow tmZoomHead">
            <span>CLIENTE</span>
            <span>TIEMPO</span>
            <span>%</span>
            <span>REGISTROS</span>
          </div>
          {list.map(([c, v]) => (
            <div key={c} className="tmZoomRow">
              <span>
                <strong>{c}</strong>
                {persona === "todos" && <small>{[...v.personas].sort().join(", ")}</small>}
              </span>
              <span>{hhmm(v.min)}</span>
              <span>{total ? Math.round((v.min / total) * 100) : 0}%</span>
              <span>{v.n}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Cómo se registró: con cronómetro o a mano (y si se editó después).
function ModeTag({ r }: { r: Registro }) {
  if (!r.modo) return null;
  return (
    <em className={`tmMode ${r.modo === "cronometro" ? "tmModeTimer" : "tmModeManual"}`}>
      {r.modo === "cronometro" ? "⏱ Cronómetro" : "✎ Manual"}
      {r.editado && " · editado"}
    </em>
  );
}
