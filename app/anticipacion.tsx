"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ANT_FUENTES, ANT_TIPOS, type AntCaso, type AntData, type AntFuente, type AntTipo } from "@/lib/anticipacion-types";

/*
 * Días antes del deadline con los que los casos llegan a revisión
 * (VAWA: READY FOR MGM REVIEW; NON VAWA: FECHA RTP). Solo lectura,
 * para stakeholders: promedio por tipo, tendencia por mes y cuántos
 * llegan con poco margen.
 */

const TIPO_LABEL: Record<AntTipo, string> = {
  NOID: "NOID",
  "RFE DL NOID": "RFE con deadline de NOID",
  RFE: "RFE",
};
// Colores categóricos fijos por tipo (azul, naranja, aqua).
const TIPO_CLS: Record<AntTipo, string> = {
  NOID: "antNoid",
  "RFE DL NOID": "antRfeNoid",
  RFE: "antRfe",
};
const FUENTE_SUB: Record<AntFuente, string> = {
  VAWA: "Deadline − Ready for MGM Review · RFE's I-360 duedate",
  "NON VAWA": "Due Date − Fecha RTP · NW General (Alpha)",
  "VISA T": "Deadline − Ready for MGM Review · RFE/NOID VISA T",
};
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Margen con el que llegó a revisión.
const BUCKETS: { label: string; test: (d: number) => boolean; cls: string }[] = [
  { label: "Vencido (< 0)", test: (d) => d < 0, cls: "antB0" },
  { label: "0–3 días", test: (d) => d >= 0 && d <= 3, cls: "antB1" },
  { label: "4–7 días", test: (d) => d >= 4 && d <= 7, cls: "antB2" },
  { label: "8–14 días", test: (d) => d >= 8 && d <= 14, cls: "antB3" },
  { label: "15–30 días", test: (d) => d >= 15 && d <= 30, cls: "antB4" },
  { label: "Más de 30", test: (d) => d > 30, cls: "antB5" },
];

const avg = (xs: AntCaso[]) => (xs.length ? xs.reduce((t, c) => t + c.dias, 0) / xs.length : null);
const f1 = (v: number | null) => (v === null ? "—" : v.toFixed(1));
const pct0 = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;

// Semana ISO "aaaa-Www" de una fecha "aaaa-mm-dd".
function weekKey(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function weekRange(key: string) {
  const [y, w] = key.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const start = new Date(jan4);
  start.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const f = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${f(start)} – ${f(end)}`;
}

const weekLabel = (k: string) => `Sem ${Number(k.split("-W")[1])}`;

// En Regresos ELP se ven las semanas más recientes.
const SEMANAS_VISIBLES = 13;

function fmt(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

type Tip = { x: number; y: number; content: ReactNode } | null;

function useTip() {
  const [tip, setTip] = useState<Tip>(null);
  const bind = (content: ReactNode) => ({
    onMouseEnter: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, content }),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, content });
    },
    onBlur: () => setTip(null),
  });
  const node = tip ? (
    <div className="elpTip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.content}
    </div>
  ) : null;
  return { bind, node };
}

function TipRows({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <>
      <strong>{title}</strong>
      {rows.map(([label, value, cls]) => (
        <span key={label} className="elpTipRow">
          {cls && <i className={`elpSw ${cls}`} />}
          {label}
          <b>{value}</b>
        </span>
      ))}
    </>
  );
}

/*
 * embedded: dentro de Regresos ELP, sin banner y por semanas
 * (semana de llegada a revisión). Suelta: por año y mes.
 */
export default function Anticipacion({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<AntData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fuente, setFuente] = useState<AntFuente>("VAWA");
  const [year, setYear] = useState<string>("");
  const [weeksSel, setWeeksSel] = useState<string[]>([]);
  const [tipoSel, setTipoSel] = useState<AntTipo | null>(null);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const tip = useTip();

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/anticipacion", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar");
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

  const deFuente = useMemo(() => (data?.casos || []).filter((c) => c.fuente === fuente), [data, fuente]);
  const years = useMemo(() => [...new Set(deFuente.map((c) => c.entrega.slice(0, 4)))].sort(), [deFuente]);

  // Por defecto, el año más reciente de la fuente.
  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[years.length - 1]);
  }, [years, year]);

  // Semanas con casos (más recientes) para el modo por semana.
  const weeks = useMemo(
    () => [...new Set(deFuente.map((c) => weekKey(c.entrega)))].sort().slice(-SEMANAS_VISIBLES),
    [deFuente]
  );
  const activeWeeks = weeksSel.length ? weeksSel : weeks;

  const scope = embedded
    ? deFuente.filter((c) => activeWeeks.includes(weekKey(c.entrega)))
    : deFuente.filter((c) => !year || year === "todos" || c.entrega.startsWith(year));
  const porTipo = ANT_TIPOS.map((t) => {
    const list = scope.filter((c) => c.tipo === t);
    return { tipo: t, list, avg: avg(list), urgentes: list.filter((c) => c.dias <= 3).length };
  });
  const general = avg(scope);
  const urgentes = scope.filter((c) => c.dias <= 3).length;

  // Agrupación de la gráfica: semana (embebido) o mes.
  const groupOf = (c: AntCaso) => (embedded ? weekKey(c.entrega) : monthKey(c.entrega));
  const groupLabel = (k: string) => (embedded ? `S${Number(k.split("-W")[1])}` : monthLabel(k));
  const groupTitle = (k: string) => (embedded ? `${weekLabel(k)} · ${weekRange(k)}` : monthLabel(k));
  const months = embedded ? activeWeeks.filter((w) => scope.some((c) => groupOf(c) === w)) : [...new Set(scope.map(groupOf))].sort();
  const monthly = months.map((m) => ({
    m,
    tipos: ANT_TIPOS.map((t) => {
      const list = scope.filter((c) => c.tipo === t && groupOf(c) === m);
      return { tipo: t, n: list.length, avg: avg(list) };
    }),
  }));
  const maxAvg = Math.max(1, ...monthly.flatMap((x) => x.tipos.map((t) => t.avg || 0)));

  const q = query.trim().toLowerCase();
  const lista = scope
    .filter((c) => (!tipoSel || c.tipo === tipoSel) && (!q || c.cliente.toLowerCase().includes(q)))
    .sort((a, b) => b.entrega.localeCompare(a.entrega) || a.dias - b.dias);
  const shown = showAll ? lista : lista.slice(0, 15);

  return (
    <div className={embedded ? "" : "rgPage elpPage"}>
      {!embedded && (
      <header className="elpBanner">
        <div>
          <p>ENTREGAS · MARGEN AL DEADLINE</p>
          <h1>Días antes del deadline</h1>
          <span>Con cuántos días de anticipación llegan los casos a revisión, en promedio.</span>
        </div>
        <div className="elpBannerSide">
          <div className="elpTabs" role="tablist">
            {ANT_FUENTES.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={fuente === f}
                className={fuente === f ? "active" : ""}
                onClick={() => {
                  setFuente(f);
                  setTipoSel(null);
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <button className="elpRefresh" onClick={load} disabled={loading}>
            {loading ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>
      </header>
      )}

      {error && <div className="errorBanner">{error}</div>}

      {loading && !data ? (
        <div className="loadingCard">Cargando…</div>
      ) : data ? (
        <>
          {embedded && (
            <div className="antFuenteBar">
              <div className="antFuenteTabs" role="tablist" aria-label="Tipo de caso">
                {ANT_FUENTES.map((f) => (
                  <button
                    key={f}
                    role="tab"
                    aria-selected={fuente === f}
                    className={fuente === f ? "active" : ""}
                    onClick={() => {
                      setFuente(f);
                      setTipoSel(null);
                      setWeeksSel([]);
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span>{FUENTE_SUB[fuente]}</span>
            </div>
          )}
          {embedded ? (
            <div className="elpToolbar">
              <div className="elpWeekChips" role="group" aria-label="Semanas">
                <button className={!weeksSel.length ? "active" : ""} onClick={() => setWeeksSel([])}>
                  Todas
                </button>
                {weeks.map((w) => {
                  const on = weeksSel.includes(w);
                  return (
                    <button
                      key={w}
                      className={on ? "active" : ""}
                      aria-pressed={on}
                      title={weekRange(w)}
                      onClick={() => setWeeksSel(on ? weeksSel.filter((x) => x !== w) : [...weeksSel, w].sort())}
                    >
                      {weekLabel(w)}
                    </button>
                  );
                })}
              </div>
              <span>Por semana de llegada a revisión · últimas {weeks.length} semanas</span>
            </div>
          ) : (
          <div className="elpToolbar">
            <div className="elpWeekChips" role="group" aria-label="Año">
              {years.map((y) => (
                <button key={y} className={year === y ? "active" : ""} onClick={() => setYear(y)}>
                  {y}
                </button>
              ))}
              {years.length > 1 && (
                <button className={year === "todos" ? "active" : ""} onClick={() => setYear("todos")}>
                  Todos
                </button>
              )}
            </div>
            <span>{FUENTE_SUB[fuente]}</span>
          </div>
          )}

          <div className="antHero">
            <div className="elpHeroTile antHeroMain">
              <div>
                <span>Promedio general · {fuente}</span>
                <strong>
                  {f1(general)} <em>días</em>
                </strong>
                <small>
                  {scope.length} casos llegaron a revisión
                  {data.pendientes[fuente] > 0 && ` · ${data.pendientes[fuente]} sin fecha de revisión`}
                </small>
              </div>
            </div>
            {porTipo.map((t) => (
              <button
                key={t.tipo}
                className={`elpHeroTile antTipoTile ${tipoSel === t.tipo ? "active" : ""}`}
                aria-pressed={tipoSel === t.tipo}
                onClick={() => setTipoSel(tipoSel === t.tipo ? null : t.tipo)}
              >
                <div>
                  <span>
                    <i className={`elpSw ${TIPO_CLS[t.tipo]}`} /> {TIPO_LABEL[t.tipo]}
                  </span>
                  <strong>
                    {f1(t.avg)} <em>días</em>
                  </strong>
                  <small>
                    {t.list.length} casos
                    {t.urgentes > 0 && ` · ${t.urgentes} con ≤ 3 días`}
                  </small>
                </div>
              </button>
            ))}
          </div>

          <div className="elpRow2 antRow">
            <section className="elpCard">
              <div className="elpCardHead">
                <h3>Promedio por {embedded ? "semana" : "mes"} de llegada a revisión</h3>
                <span>Días antes del deadline · pasa el mouse para ver el detalle</span>
              </div>
              {monthly.length ? (
                <div className="antMonths" style={{ gridTemplateColumns: `repeat(${monthly.length}, minmax(0, 1fr))` }}>
                  {monthly.map((x) => (
                    <div
                      key={x.m}
                      className="antMonth"
                      tabIndex={0}
                      {...tip.bind(
                        <TipRows
                          title={groupTitle(x.m)}
                          rows={x.tipos.map((t) => [
                            TIPO_LABEL[t.tipo],
                            t.n ? `${f1(t.avg)} días · ${t.n} casos` : "—",
                            TIPO_CLS[t.tipo],
                          ])}
                        />
                      )}
                    >
                      <div className="antMonthPlot">
                        {x.tipos.map((t) => (
                          <div key={t.tipo} className="antBarSlot">
                            {t.avg !== null && <b>{Math.round(t.avg)}</b>}
                            <i
                              className={`${TIPO_CLS[t.tipo]} ${tipoSel && tipoSel !== t.tipo ? "antDim" : ""}`}
                              style={{ height: t.avg === null ? 0 : `${Math.max(2, (Math.max(t.avg, 0) / maxAvg) * 100)}%` }}
                            />
                          </div>
                        ))}
                      </div>
                      <span className="elpColLabel">{groupLabel(x.m)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="elpEmpty">Sin casos en este periodo.</div>
              )}
              <div className="elpLegend">
                {ANT_TIPOS.map((t) => (
                  <span key={t}>
                    <i className={`elpSw ${TIPO_CLS[t]}`} />
                    {TIPO_LABEL[t]}
                  </span>
                ))}
              </div>
            </section>

            <section className="elpCard">
              <div className="elpCardHead">
                <h3>¿Con cuánto margen llegan?</h3>
                <span>
                  Reparto de casos por días antes del deadline · {urgentes} de {scope.length} ({pct0(urgentes, scope.length)}) con 3 días o
                  menos
                </span>
              </div>
              <div className="antDist">
                {porTipo.map((t) => (
                  <div key={t.tipo} className={`antDistRow ${tipoSel && tipoSel !== t.tipo ? "antDim" : ""}`}>
                    <span className="antDistName">
                      <i className={`elpSw ${TIPO_CLS[t.tipo]}`} />
                      {TIPO_LABEL[t.tipo]}
                      <small>{t.list.length}</small>
                    </span>
                    <div className="antDistBar">
                      {BUCKETS.map((b) => {
                        const n = t.list.filter((c) => b.test(c.dias)).length;
                        if (!n) return null;
                        return (
                          <i
                            key={b.label}
                            className={b.cls}
                            style={{ flexGrow: n }}
                            {...tip.bind(
                              <TipRows
                                title={`${TIPO_LABEL[t.tipo]} · ${b.label}`}
                                rows={[
                                  ["Casos", String(n)],
                                  ["Del tipo", pct0(n, t.list.length)],
                                ]}
                              />
                            )}
                          >
                            {n / Math.max(1, t.list.length) >= 0.12 ? pct0(n, t.list.length) : ""}
                          </i>
                        );
                      })}
                      {!t.list.length && <em>Sin casos</em>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="elpLegend">
                {BUCKETS.map((b) => (
                  <span key={b.label}>
                    <i className={`elpSw ${b.cls}`} />
                    {b.label}
                  </span>
                ))}
              </div>
            </section>
          </div>

          <section className="elpCard">
            <div className="elpCardHead elpCardHeadRow">
              <h3>
                Casos {tipoSel ? `· ${TIPO_LABEL[tipoSel]}` : ""} <span className="antCount">{lista.length}</span>
              </h3>
              <input
                className="antSearch"
                value={query}
                placeholder="Buscar cliente…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="gmTableWrap">
              <table className="gmTable antTable">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Recibo</th>
                    <th>Deadline</th>
                    <th>{fuente === "NON VAWA" ? "Fecha RTP" : "Ready for MGM Review"}</th>
                    <th>Días antes</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c, i) => (
                    <tr key={`${c.cliente}-${c.entrega}-${i}`}>
                      <td>
                        <strong>{c.cliente}</strong>
                        <div className="gmSub">{c.tipoSheet}</div>
                      </td>
                      <td>
                        <span className="antTipoTag">
                          <i className={`elpSw ${TIPO_CLS[c.tipo]}`} />
                          {TIPO_LABEL[c.tipo]}
                        </span>
                      </td>
                      <td>{fmt(c.recibo)}</td>
                      <td>{fmt(c.deadline)}</td>
                      <td>{fmt(c.entrega)}</td>
                      <td>
                        <span className={`antDias ${c.dias < 0 ? "antDiasLate" : c.dias <= 3 ? "antDiasTight" : ""}`}>
                          {c.dias}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!lista.length && <div className="elpEmpty">Sin casos con estos filtros.</div>}
            </div>
            {lista.length > 15 && (
              <button className="elpShowAll" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Ver menos" : `Ver los ${lista.length} casos`}
              </button>
            )}
          </section>
        </>
      ) : null}
      {tip.node}
    </div>
  );
}
