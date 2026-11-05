"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttyEvent, AttySinPlazo, AttyTipo } from "@/lib/atty";

/*
 * Calendario de las paralegales de Atty: DEADLINE de los VAWA
 * (DUE DATE, NOID, DD NOID, NOIR), COMMITMENT de los NO DUE DATE
 * y Due Date de NON VAWA (NW GENERAL). Solo lectura; cada caso
 * muestra el estatus de su pestaña y los enviados se marcan.
 */

const TIPOS: { key: AttyTipo; label: string; className: string }[] = [
  { key: "DUE DATE", label: "Due Date", className: "atDue" },
  { key: "NOID", label: "NOID", className: "atNoid" },
  { key: "DD NOID", label: "DD NOID", className: "atDdNoid" },
  { key: "NOIR", label: "NOIR", className: "atNoir" },
  { key: "NO DUE DATE", label: "No Due Date", className: "atNdd" },
  { key: "NON VAWA", label: "NON VAWA", className: "atNw" },
];
const tipoClass = (t: AttyTipo) => TIPOS.find((x) => x.key === t)?.className || "";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIAS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function fmt(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[m - 1]} ${y}`;
}

const cerrado = (e: AttyEvent) => /CANCEL|CLOSED|WITHDRAWAL/.test(e.status);
const pendiente = (e: AttyEvent) => !e.enviado && !cerrado(e);

export default function AttyCalendar() {
  const [events, setEvents] = useState<AttyEvent[]>([]);
  const [sinPlazo, setSinPlazo] = useState<AttySinPlazo[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const today = iso(new Date());
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [day, setDay] = useState(today);
  const [tipos, setTipos] = useState<AttyTipo[]>([]);
  const [celula, setCelula] = useState("todas");
  const [estatus, setEstatus] = useState("todos");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/atty", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar el calendario");
      setEvents(json.events);
      setSinPlazo(json.sinPlazo || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const statuses = useMemo(() => [...new Set(events.map((e) => e.status).filter(Boolean))].sort(), [events]);

  const visible = events.filter((e) => {
    const q = query.trim().toLowerCase();
    return (
      (!tipos.length || tipos.includes(e.tipo)) &&
      (celula === "todas" || e.celula === celula) &&
      (estatus === "todos" ||
        (estatus === "pendientes" ? pendiente(e) : estatus === "enviados" ? e.enviado : e.status === estatus)) &&
      (!q || `${e.cliente} ${e.id}`.toLowerCase().includes(q))
    );
  });

  const byDay = useMemo(() => {
    const m = new Map<string, AttyEvent[]>();
    visible.forEach((e) => m.set(e.fecha, [...(m.get(e.fecha) || []), e]));
    return m;
  }, [visible]);

  // Semanas del mes, de lunes a domingo.
  const first = addDays(month, -((month.getDay() + 6) % 7));
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells: Date[] = [];
  for (let d = first; d <= last || cells.length % 7; d = addDays(d, 1)) cells.push(d);

  const weekEnd = iso(addDays(new Date(), 7));
  const kpis = [
    { label: "Vencidos sin enviar", value: visible.filter((e) => e.fecha < today && pendiente(e)).length, alert: true },
    { label: "Hoy", value: visible.filter((e) => e.fecha === today && pendiente(e)).length },
    { label: "Próximos 7 días", value: visible.filter((e) => e.fecha > today && e.fecha <= weekEnd && pendiente(e)).length },
    { label: "Enviados", value: visible.filter((e) => e.enviado).length },
  ];

  const dayEvents = (byDay.get(day) || []).slice().sort((a, b) => a.tipo.localeCompare(b.tipo));

  return (
    <div className="rgPage atPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">ATTY · ALPHA Y GAMMA</p>
          <h1>Calendario de fechas límite</h1>
          <p>
            Deadline de DUE DATE, NOID, DD NOID y NOIR · Commitment de NO DUE DATE · Due Date de NON VAWA (NW
            General).
          </p>
        </div>
        <button className="refreshButton" onClick={load}>
          ↻ Refresh
        </button>
      </header>

      {error && <div className="errorBanner">{error}</div>}

      {loading && !events.length ? (
        <div className="loadingCard">Cargando calendario…</div>
      ) : (
        <>
          <div className="gmKpis cmKpis">
            {kpis.map((k) => (
              <div key={k.label} className={k.alert && k.value ? "gmKpiAlert" : ""}>
                <span>{k.label}</span>
                <strong>{k.value}</strong>
              </div>
            ))}
          </div>

          <div className="gmFilters cmFilters">
            <div className="rgChips rgChipsSmall" role="group" aria-label="Tipo">
              <button className={!tipos.length ? "active" : ""} onClick={() => setTipos([])}>
                Todos
              </button>
              {TIPOS.map((t) => (
                <button
                  key={t.key}
                  className={tipos.includes(t.key) ? "active" : ""}
                  aria-pressed={tipos.includes(t.key)}
                  onClick={() =>
                    setTipos((p) => (p.includes(t.key) ? p.filter((x) => x !== t.key) : [...p, t.key]))
                  }
                >
                  <i className={`atDot ${t.className}`} /> {t.label}
                </button>
              ))}
            </div>
            <select value={celula} onChange={(e) => setCelula(e.target.value)} aria-label="Célula">
              <option value="todas">Alpha y Gamma</option>
              <option value="alpha">Alpha</option>
              <option value="gamma">Gamma</option>
            </select>
            <select value={estatus} onChange={(e) => setEstatus(e.target.value)} aria-label="Estatus">
              <option value="todos">Todos los estatus</option>
              <option value="pendientes">Sin enviar</option>
              <option value="enviados">Enviados (Sent to USCIS)</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              className="gmSearch"
              value={query}
              placeholder="Buscar cliente o ID…"
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="rsCount">{visible.length} fechas</span>
          </div>

          <div className="atLayout">
            <section className="calendarCard atCalendar">
              <div className="calendarToolbar">
                <div className="calendarTitle">
                  <h2>
                    {MESES[month.getMonth()]} {month.getFullYear()}
                  </h2>
                </div>
                <div className="calendarControls">
                  <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
                  <button
                    className="todayButton"
                    onClick={() => {
                      const d = new Date();
                      setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                      setDay(today);
                    }}
                  >
                    Hoy
                  </button>
                  <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
                </div>
              </div>

              <div className="atGrid">
                {DIAS.map((d) => (
                  <div key={d} className="atWeekday">
                    {d}
                  </div>
                ))}
                {cells.map((d) => {
                  const key = iso(d);
                  const list = byDay.get(key) || [];
                  const atrasados = list.filter((e) => key < today && pendiente(e)).length;
                  return (
                    <button
                      key={key}
                      className={`atDay ${d.getMonth() !== month.getMonth() ? "atOut" : ""} ${
                        key === today ? "atToday" : ""
                      } ${key === day ? "atSelected" : ""}`}
                      onClick={() => setDay(key)}
                    >
                      <span className="atNum">
                        {d.getDate()}
                        {atrasados > 0 && <em title="Vencidos sin enviar">{atrasados} vencidos</em>}
                      </span>
                      {list.slice(0, 3).map((e) => (
                        <span key={e.key} className={`atPill ${tipoClass(e.tipo)} ${e.enviado ? "atSent" : ""}`}>
                          {e.enviado && "✓ "}
                          {e.cliente}
                        </span>
                      ))}
                      {list.length > 3 && <span className="atMore">+{list.length - 3} más</span>}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="gmTableCard atDayList">
              <h3>{fmt(day)}</h3>
              <span className="atDaySub">{dayEvents.length} fechas</span>
              {dayEvents.map((e) => (
                <div key={e.key} className={`atItem ${tipoClass(e.tipo)} ${e.enviado ? "atSent" : ""}`}>
                  <div>
                    <strong>{e.cliente}</strong>
                    <small>
                      {e.id && `ID ${e.id} · `}
                      {e.celula === "alpha" ? "Alpha" : "Gamma"}
                      {e.form && ` · ${e.form}`}
                    </small>
                  </div>
                  <div className="atItemTags">
                    <span className="atTipo">
                      {e.tipo} · {e.campo.toLowerCase()}
                    </span>
                    <span className={e.enviado ? "atStatusSent" : cerrado(e) ? "atStatusClosed" : "atStatus"}>
                      {e.enviado ? "✓ " : ""}
                      {e.status || "Sin estatus"}
                    </span>
                  </div>
                </div>
              ))}
              {!dayEvents.length && <div className="gmEmpty">Sin fechas este día.</div>}
            </section>
          </div>

          {sinPlazo.length > 0 && (
            <section className="gmTableCard atSinPlazo">
              <h3>Sin plazo · fuera del calendario</h3>
              <span className="atDaySub">
                Casos de estos tipos sin fecha límite en la Sheet ({sinPlazo.length}).
              </span>
              <div className="gmTableWrap">
                <table className="gmTable">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Tipo</th>
                      <th>Célula</th>
                      <th>Por qué</th>
                      <th>Estatus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinPlazo.map((c) => (
                      <tr key={c.key}>
                        <td>
                          <strong>{c.cliente}</strong>
                          {c.form && <div className="gmSub">{c.form}</div>}
                        </td>
                        <td>
                          <i className={`atDot ${tipoClass(c.tipo)}`} /> {c.tipo}
                        </td>
                        <td>{c.celula === "alpha" ? "Alpha" : "Gamma"}</td>
                        <td>{c.motivo}</td>
                        <td>
                          <span className={c.status === "SENT TO USCIS" ? "atStatusSent" : "atStatus"}>
                            {c.status === "SENT TO USCIS" && "✓ "}
                            {c.status || "Sin estatus"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
