"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { GmcData, GmcField, GmcItem, GmcTab } from "@/lib/gmc";

/*
 * Entregas del equipo GMC (Gov Branch): calendario por semana y
 * tabla editable, igual que el equipo de Alpha y Gamma. Lee y
 * escribe la Sheet "RFE - CELULA GB" (GMC, NON VAWA, OTHER).
 */

const TABS: GmcTab[] = ["GMC", "NON VAWA", "OTHER"];
const WEEK_DAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Estado = "pendientes" | "entregadas" | "todas";

// Fechas como "YYYY-MM-DD" en hora local, sin zonas horarias.
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7);
}

function fmt(s: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${String(y).slice(2)}`;
}

// READY cuenta como entregada aunque no tenga fecha de entrega.
const delivered = (i: GmcItem) => !!i.done || i.status === "READY";

// Día en el calendario: la fecha esperada; si no tiene, el día que se entregó.
const calendarDate = (i: GmcItem) => i.expected || i.done;

// Tipo de caso: GMC = VAWA DD, OTHER = VAWA NDD (o Gov Request), NON VAWA.
const CATEGORIES = ["VAWA DD", "VAWA NDD", "Gov Request", "Non VAWA"] as const;

function category(i: GmcItem): (typeof CATEGORIES)[number] {
  if (i.tab === "GMC") return "VAWA DD";
  if (i.tab === "NON VAWA") return "Non VAWA";
  return /GOV/i.test(i.tipo) ? "Gov Request" : "VAWA NDD";
}

const tabTag = (tab: GmcTab) => (tab === "NON VAWA" ? "NV" : tab === "GMC" ? "GMC" : "OTH");

export default function Gmc() {
  const [data, setData] = useState<(GmcData & { canEdit: boolean }) | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const [view, setView] = useState<"calendar" | "table">("calendar");
  const [tabs, setTabs] = useState<GmcTab[]>(TABS);
  const [member, setMember] = useState("todos");
  const [estado, setEstado] = useState<Estado>("todas");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/gmc", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar GMC");
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

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  async function save(item: GmcItem, field: GmcField, value: string) {
    setSaving(`${item.key}:${field}`);
    setError("");
    try {
      const res = await fetch("/api/gmc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: item.tab, row: item.row, cliente: item.cliente, field, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo guardar");
      setData((prev) =>
        prev && {
          ...prev,
          items: prev.items.map((x) => (x.key === item.key ? json.item || x : x)),
        }
      );
      setNotice("Guardado en la Sheet");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  const today = iso(new Date());
  const items = data?.items || [];

  const members = useMemo(
    () =>
      [...new Set(items.map((i) => i.member || "Sin asignar"))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [items]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (i) =>
        tabs.includes(i.tab) &&
        (member === "todos" || (i.member || "Sin asignar") === member) &&
        (estado === "todas" || (estado === "entregadas") === delivered(i)) &&
        (!q ||
          `${i.cliente} ${i.clienteId} ${i.receipt} ${i.member}`.toLowerCase().includes(q))
    );
  }, [items, tabs, member, estado, query]);

  // Indicadores de la semana en curso (lunes a domingo).
  const weekStart = iso(mondayOf(new Date()));
  const weekEnd = iso(addDays(mondayOf(new Date()), 6));
  const inWeek = (s: string | null) => !!s && s >= weekStart && s <= weekEnd;
  const kpis = {
    semana: visible.filter((i) => inWeek(i.expected)).length,
    entregadasSemana: visible.filter((i) => inWeek(i.done)).length,
    vencidas: visible.filter((i) => !delivered(i) && i.expected && i.expected < today).length,
    proximas: visible.filter((i) => !delivered(i) && !!i.expected && i.expected > weekEnd).length,
  };

  // Inventario: lo que sigue sin entregar; un cliente cuenta una vez.
  const pendientes = visible.filter((i) => !delivered(i));
  const inventario = new Set(pendientes.map((i) => i.cliente.toUpperCase())).size;
  const desglose = CATEGORIES.map((c) => ({
    label: c,
    count: pendientes.filter((i) => category(i) === c).length,
  }));

  // Semanas del mes, de lunes a domingo.
  const weeks = useMemo(() => {
    const first = mondayOf(month);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const out: Date[][] = [];
    for (let d = first; d <= last; d = addDays(d, 7)) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
    }
    return out;
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, GmcItem[]>();
    visible.forEach((i) => {
      const day = calendarDate(i);
      if (!day) return;
      map.set(day, [...(map.get(day) || []), i]);
    });
    return map;
  }, [visible]);

  const tableRows = [...visible].sort(
    (a, b) =>
      Number(delivered(a)) - Number(delivered(b)) ||
      (a.expected || "9999").localeCompare(b.expected || "9999") ||
      a.cliente.localeCompare(b.cliente)
  );

  function weekSummary(week: Date[]) {
    const start = iso(week[0]);
    const end = iso(week[6]);
    const events = visible.filter((i) => {
      const day = calendarDate(i);
      return !!day && day >= start && day <= end;
    });
    const done = events.filter(delivered).length;
    const counts = new Map<string, number>();
    events.forEach((i) => counts.set(i.member || "Sin asignar", (counts.get(i.member || "Sin asignar") || 0) + 1));
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const max = rows[0]?.[1] || 1;

    return (
      <div className="calendarWeekSummary">
        <span className="weekSummaryLabel">Sem {isoWeek(week[0])}</span>
        <strong className="weekSummaryTotal">{events.length}</strong>
        <span className="weekSummarySub">
          {events.length === 1 ? "entrega" : "entregas"}
          {done > 0 && ` · ${done} ✓`}
        </span>
        {rows.length > 0 && (
          <ul className="weekSummaryBreakdown">
            {rows.slice(0, 6).map(([name, count]) => (
              <li key={name} title={`${name}: ${count}`}>
                <span className="weekSummaryName">{name}</span>
                <span className="weekSummaryBar">
                  <i style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <b>{count}</b>
              </li>
            ))}
          </ul>
        )}
        {rows.length > 6 && (
          <span
            className="weekSummaryMore"
            title={rows.slice(6).map(([n, c]) => `${n}: ${c}`).join("\n")}
          >
            +{rows.length - 6} más
          </span>
        )}
      </div>
    );
  }

  const canEdit = !!data?.canEdit;
  const busy = (item: GmcItem, field: GmcField) => saving === `${item.key}:${field}`;

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">CÉLULA GMC · GOV BRANCH</p>
          <h1>Entregas GMC</h1>
          <p>Entregas del equipo GMC: pestañas GMC, NON VAWA y OTHER de la Sheet de Gov Branch.</p>
        </div>

        <button className="refreshButton" onClick={load}>
          ↻ Refresh
        </button>
      </header>

      {error && <div className="errorBanner">{error}</div>}
      {notice && <div className="gmNotice">✓ {notice}</div>}

      {loading && !data ? (
        <div className="loadingCard">Cargando GMC…</div>
      ) : (
        data && (
          <>
            <div className="gmKpis">
              <div className="gmKpiHero">
                <span>Clientes en inventario</span>
                <strong>{inventario}</strong>
                <small>{pendientes.length} entregas pendientes</small>
                <ul className="gmBreakdown">
                  {desglose.map((d) => (
                    <li key={d.label}>
                      {d.label} <b>{d.count}</b>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span>Entregas esta semana</span>
                <strong>{kpis.semana}</strong>
              </div>
              <div>
                <span>Entregadas esta semana</span>
                <strong>{kpis.entregadasSemana}</strong>
              </div>
              <div className={kpis.vencidas ? "gmKpiAlert" : ""}>
                <span>Vencidas sin entregar</span>
                <strong>{kpis.vencidas}</strong>
              </div>
              <div>
                <span>Próximas entregas</span>
                <strong>{kpis.proximas}</strong>
                <small>después de esta semana</small>
              </div>
            </div>

            <div className="teamViewToolbar">
              <div className="teamViewSwitch">
                <button
                  className={view === "calendar" ? "teamViewButton active" : "teamViewButton"}
                  onClick={() => setView("calendar")}
                >
                  <span>▦</span>
                  Calendario
                </button>
                <button
                  className={view === "table" ? "teamViewButton active" : "teamViewButton"}
                  onClick={() => setView("table")}
                >
                  <span>≡</span>
                  Tabla
                </button>
              </div>

              <div className="gmFilters">
                <div className="gmChips" role="group" aria-label="Pestañas">
                  {TABS.map((t) => {
                    const on = tabs.includes(t);
                    return (
                      <button
                        key={t}
                        className={on ? "active" : ""}
                        aria-pressed={on}
                        onClick={() =>
                          setTabs((prev) =>
                            on ? prev.filter((x) => x !== t) : TABS.filter((x) => x === t || prev.includes(x))
                          )
                        }
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>

                <select value={member} onChange={(e) => setMember(e.target.value)} aria-label="Colaborador">
                  <option value="todos">Todo el equipo</option>
                  {members.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>

                <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)} aria-label="Estado">
                  <option value="todas">Todas</option>
                  <option value="pendientes">Pendientes</option>
                  <option value="entregadas">Entregadas</option>
                </select>

                <input
                  className="gmSearch"
                  value={query}
                  placeholder="Buscar cliente, ID, recibo…"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            {view === "calendar" ? (
              <section className="calendarCard">
                <div className="calendarToolbar">
                  <div className="calendarTitle">
                    <h2>
                      {MONTHS[month.getMonth()]} {month.getFullYear()}
                    </h2>
                    <span>
                      Por fecha esperada; si no tiene, por fecha de entrega
                      {canEdit ? " · edita fechas y estatus en Tabla" : ""}
                    </span>
                  </div>

                  <div className="calendarControls">
                    <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
                    <button
                      className="todayButton"
                      onClick={() => {
                        const now = new Date();
                        setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                      }}
                    >
                      Hoy
                    </button>
                    <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
                  </div>
                </div>

                <div className="calendarWeekHeader calendarGridWithSummary">
                  {WEEK_DAYS.map((d) => (
                    <div key={d}>{d}</div>
                  ))}
                  <div>SEMANA</div>
                </div>

                <div className="calendarGrid calendarGridWithSummary">
                  {weeks.map((week) => (
                    <Fragment key={iso(week[0])}>
                      {week.map((day) => {
                        const key = iso(day);
                        const events = byDay.get(key) || [];
                        return (
                          <div
                            key={key}
                            className={`calendarDay ${day.getMonth() !== month.getMonth() ? "outsideMonth" : ""}`}
                          >
                            <div className="calendarDayNumber">
                              <span className={key === today ? "todayNumber" : ""}>{day.getDate()}</span>
                            </div>
                            <div className="calendarEvents">
                              {events.map((i) => (
                                <button
                                  key={i.key}
                                  className={`calendarEvent ${
                                    delivered(i)
                                      ? "calendarEventDelivered"
                                      : key < today
                                        ? "calendarEventBacklog"
                                        : key === today
                                          ? "calendarEventPending"
                                          : "calendarEventFuture"
                                  } ${!delivered(i) && !i.member ? "calendarEventUnassigned" : ""}`}
                                  title={`${i.tab} · ${i.tipo} · ${i.cliente}`}
                                  onClick={() => {
                                    setQuery(i.cliente);
                                    setView("table");
                                  }}
                                >
                                  <strong>
                                    <b className="teamStageTag">{tabTag(i.tab)}</b>
                                    {i.cliente}
                                  </strong>
                                  {delivered(i) ? (
                                    <span className="deliveredEventLabel">✓ {i.done ? "Entregado" : "Ready"}</span>
                                  ) : !i.member ? (
                                    <span className="unassignedEventLabel">Sin asignar</span>
                                  ) : (
                                    <span>
                                      {i.member}
                                      {i.status ? ` · ${i.status}` : ""}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {weekSummary(week)}
                    </Fragment>
                  ))}
                </div>
              </section>
            ) : (
              <section className="gmTableCard">
                <div className="gmTableWrap">
                  <table className="gmTable">
                    <thead>
                      <tr>
                        <th>Pestaña</th>
                        <th>Cliente</th>
                        <th>Colaborador</th>
                        <th>Fecha esperada</th>
                        <th>Estatus</th>
                        <th>Entregado</th>
                        <th>Link</th>
                        <th>Deadline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((i) => {
                        const late = !delivered(i) && !!i.expected && i.expected < today;
                        const can = (f: GmcField) => canEdit && i.editable.includes(f);
                        return (
                          <tr key={i.key} className={delivered(i) ? "gmDone" : late ? "gmLate" : ""}>
                            <td>
                              <b className="teamStageTag">{tabTag(i.tab)}</b>
                              <div className="gmSub">{i.tipo}</div>
                            </td>
                            <td>
                              <strong>{i.cliente}</strong>
                              <div className="gmSub">
                                {[i.clienteId && `ID ${i.clienteId}`, i.receipt, i.detalle, i.rehab && `Rehab: ${i.rehab}`]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </td>
                            <td>{i.member || <span className="gmMuted">Sin asignar</span>}</td>
                            <td>
                              {can("expected") ? (
                                <input
                                  type="date"
                                  value={i.expected || ""}
                                  disabled={busy(i, "expected")}
                                  onChange={(e) => save(i, "expected", e.target.value)}
                                />
                              ) : (
                                fmt(i.expected)
                              )}
                            </td>
                            <td>
                              {can("status") ? (
                                <select
                                  value={i.status}
                                  disabled={busy(i, "status")}
                                  onChange={(e) => save(i, "status", e.target.value)}
                                >
                                  {!data.statusOptions.includes(i.status) && (
                                    <option value={i.status}>{i.status || "—"}</option>
                                  )}
                                  {data.statusOptions.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="gmStatus">{i.status || "—"}</span>
                              )}
                            </td>
                            <td>
                              {can("done") ? (
                                <input
                                  type="date"
                                  value={i.done || ""}
                                  disabled={busy(i, "done")}
                                  onChange={(e) => save(i, "done", e.target.value)}
                                />
                              ) : (
                                fmt(i.done)
                              )}
                            </td>
                            <td>
                              {can("link") ? (
                                <LinkCell item={i} busy={busy(i, "link")} onSave={(v) => save(i, "link", v)} />
                              ) : i.link.startsWith("http") ? (
                                <a href={i.link} target="_blank" rel="noreferrer">
                                  Abrir
                                </a>
                              ) : (
                                <span className="gmMuted">{i.link || "—"}</span>
                              )}
                            </td>
                            <td>{fmt(i.deadline)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!tableRows.length && <div className="gmEmpty">No hay entregas con estos filtros.</div>}
                </div>
              </section>
            )}
          </>
        )
      )}
    </>
  );
}

// Link: se guarda al salir del campo o con Enter.
function LinkCell({
  item,
  busy,
  onSave,
}: {
  item: GmcItem;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const [value, setValue] = useState(item.link);
  useEffect(() => setValue(item.link), [item.link]);
  const commit = () => value.trim() !== item.link && onSave(value.trim());

  return (
    <div className="gmLink">
      <input
        value={value}
        placeholder="https://…"
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {item.link.startsWith("http") && (
        <a href={item.link} target="_blank" rel="noreferrer" aria-label="Abrir link">
          ↗
        </a>
      )}
    </div>
  );
}
