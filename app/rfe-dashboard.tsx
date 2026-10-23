"use client";

import { useEffect, useRef, useState } from "react";
import {
  ARRIVALS_MIN_WEEK,
  ARRIVALS_YEAR,
  CATEGORY_LABELS,
  RFE_CATEGORIES,
  type RfeCategory,
} from "@/lib/rfe/config";
import type {
  ArrivalWeek,
  Counts,
  GoalPeriod,
  GoalPoint,
  InventoryBox,
  RfeDashboardData,
} from "@/lib/rfe/logic";

/*
 * Dashboard RFE del área (vista General). Toma la Sheet
 * general de RFE con las mismas reglas del dashboard
 * "Estatus General RFE". Las metas, el avance manual y los
 * cierres se leen y guardan en ese mismo dashboard.
 */

function weekLabel(weekKey: string) {
  const match = /W(\d+)$/.exec(weekKey);
  return match ? `S${Number(match[1])}` : weekKey;
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function periodLabel(period: GoalPeriod, key: string) {
  if (period === "weekly") return weekLabel(key);
  const [year, month] = key.split("-").map(Number);
  return `${MONTHS[month - 1]} ${String(year).slice(2)}`;
}

function niceCeil(n: number) {
  if (n <= 4) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  const residual = n / magnitude;
  const nice =
    residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return nice * magnitude;
}

// Columna con extremo de datos redondeado (4px) y base recta.
function columnPath(
  x: number,
  y: number,
  w: number,
  h: number,
  rounded: boolean
) {
  if (h <= 0) return "";
  const r = rounded ? Math.min(4, h, w / 2) : 0;
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

const PAD_LEFT = 30;
const PAD_RIGHT = 12;
const PAD_TOP = 18;
const PAD_BOTTOM = 24;
const PLOT_HEIGHT = 150;

// Ancho disponible de la tarjeta, para que la gráfica la llene.
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width)
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

/*
 * Cada semana ocupa un "slot" de entre 28 y 64px; si no caben,
 * la tarjeta hace scroll horizontal. Las barras nunca pasan de
 * 24px de grosor.
 */
function chartFrame(
  count: number,
  maxValue: number,
  available: number
) {
  const SLOT = Math.min(
    64,
    Math.max(28, (available - PAD_LEFT - PAD_RIGHT) / Math.max(count, 1))
  );
  const BAR = Math.min(24, Math.round(SLOT * 0.55));
  const width = PAD_LEFT + PAD_RIGHT + count * SLOT;
  const height = PAD_TOP + PLOT_HEIGHT + PAD_BOTTOM;
  const niceMax = niceCeil(maxValue);
  const baseY = PAD_TOP + PLOT_HEIGHT;
  const scaleY = (v: number) => (v / niceMax) * PLOT_HEIGHT;
  const slotX = (i: number) => PAD_LEFT + i * SLOT;
  return { width, height, niceMax, baseY, scaleY, slotX, SLOT, BAR };
}

function Gridlines({
  frame,
}: {
  frame: ReturnType<typeof chartFrame>;
}) {
  return (
    <>
      {[0, frame.niceMax / 2, frame.niceMax].map((v) => {
        const y = frame.baseY - frame.scaleY(v);
        return (
          <g key={v}>
            <line
              x1={PAD_LEFT}
              x2={frame.width - PAD_RIGHT}
              y1={y}
              y2={y}
              className={v === 0 ? "rfeBaseline" : "rfeGridline"}
            />
            <text
              x={PAD_LEFT - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="rfeTick"
            >
              {Math.round(v)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function InventoryCard({
  category,
  data,
}: {
  category: RfeCategory;
  data: InventoryBox;
}) {
  const pct =
    data.total > 0
      ? Math.round((data.milestoneCount / data.total) * 100)
      : 0;

  return (
    <div className={`rfeInvCard rfeCat-${category}`}>
      <div className="rfeInvTitle">{CATEGORY_LABELS[category]}</div>

      <div className="rfeInvTotal">{data.total}</div>

      <div className="rfeInvPills">
        <span>
          RFE <strong>{data.rfe}</strong>
        </span>

        <span>
          NOID <strong>{data.noid}</strong>
        </span>

        <span className="rfeInvMilestone">
          {category === "otherForms" ? "Ready to Print" : "En revisión"}{" "}
          <strong>{data.milestoneCount}</strong> · {pct}%
        </span>
      </div>
    </div>
  );
}

function GoalChart({
  category,
  period,
  weeks,
}: {
  category: RfeCategory;
  period: GoalPeriod;
  weeks: GoalPoint[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const { ref, width } = useWidth();

  const maxValue = Math.max(
    1,
    ...weeks.map((w) => Math.max(w.goal ?? 0, w.actual ?? 0))
  );
  const frame = chartFrame(weeks.length, maxValue, width);
  const { SLOT, BAR } = frame;
  const center = (i: number) => frame.slotX(i) + SLOT / 2;
  const goalY = (v: number) => frame.baseY - frame.scaleY(v);

  // La línea se corta en las semanas sin meta guardada.
  const segments: string[] = [];
  let current = "";
  weeks.forEach((w, i) => {
    if (w.goal === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${center(i)},${goalY(w.goal)}`;
  });
  if (current) segments.push(current);

  const hovered = weeks.find((w) => w.key === hover);
  const last = weeks[weeks.length - 1];

  return (
    <div className="rfeChartCard">
      <div className="rfeChartHead">
        <div>
          <div className="rfeChartTitle">{CATEGORY_LABELS[category]}</div>

          {last && (
            <div className="rfeChartSub">
              {period === "weekly" ? "Semana actual" : "Mes actual"}:{" "}
              <strong>{last.actual ?? "—"}</strong> de{" "}
              {last.goal ?? "—"}
            </div>
          )}
        </div>

        <div className="rfeLegend">
          <span>
            <i className="rfeSwatchBar rfeSeries1" /> Avance
          </span>

          <span>
            <i className="rfeSwatchLine rfeSeries2" /> Meta
          </span>
        </div>
      </div>

      <div className="rfeChartScroll" ref={ref}>
        <svg
          width={frame.width}
          height={frame.height}
          role="img"
          aria-label={`Avance contra meta, ${CATEGORY_LABELS[category]}`}
        >
          <Gridlines frame={frame} />

          {weeks.map((w, i) => {
            const h = frame.scaleY(w.actual ?? 0);
            const x = center(i) - BAR / 2;
            return (
              <path
                key={w.key}
                d={columnPath(x, frame.baseY - h, BAR, h, true)}
                className={`rfeSeries1Fill ${
                  hover && hover !== w.key ? "rfeDim" : ""
                }`}
              />
            );
          })}

          {segments.map((d) => (
            <path key={d} d={d} className="rfeGoalLine" />
          ))}

          {weeks.map((w, i) =>
            w.goal === null ? null : (
              <circle
                key={w.key}
                cx={center(i)}
                cy={goalY(w.goal)}
                r={4}
                className="rfeGoalDot"
              />
            )
          )}

          {weeks.map((w, i) => (
            <g
              key={w.key}
              tabIndex={0}
              onMouseEnter={() => setHover(w.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(w.key)}
              onBlur={() => setHover(null)}
              className="rfeHit"
            >
              <rect
                x={frame.slotX(i)}
                y={PAD_TOP}
                width={SLOT}
                height={PLOT_HEIGHT}
                fill="transparent"
              />

              <text
                x={center(i)}
                y={frame.height - 6}
                textAnchor="middle"
                className="rfeTick"
              >
                {periodLabel(period, w.key)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="rfeTooltip">
        {hovered ? (
          <>
            <strong>{periodLabel(period, hovered.key)}</strong> · Avance{" "}
            {hovered.actual ?? "—"} · Meta {hovered.goal ?? "—"}
            {hovered.goal && hovered.actual !== null
              ? ` · ${Math.round((hovered.actual / hovered.goal) * 100)}%`
              : ""}
          </>
        ) : (
          <span>Pasa el cursor sobre un periodo para ver el detalle</span>
        )}
      </div>
    </div>
  );
}

function ArrivalsChart({
  category,
  weeks,
}: {
  category: RfeCategory;
  weeks: ArrivalWeek[];
}) {
  const [hover, setHover] = useState<string | null>(null);
  const { ref, width } = useWidth();

  if (!weeks.length) {
    return (
      <div className="rfeChartCard">
        <div className="rfeChartTitle">{CATEGORY_LABELS[category]}</div>
        <p className="rfeEmpty">
          Sin llegadas desde la semana {ARRIVALS_MIN_WEEK} de {ARRIVALS_YEAR}.
        </p>
      </div>
    );
  }

  const frame = chartFrame(
    weeks.length,
    Math.max(1, ...weeks.map((w) => w.rfe + w.noid)),
    width
  );
  const { SLOT, BAR } = frame;
  const hovered = weeks.find((w) => w.weekKey === hover);

  return (
    <div className="rfeChartCard">
      <div className="rfeChartHead">
        <div className="rfeChartTitle">{CATEGORY_LABELS[category]}</div>

        <div className="rfeLegend">
          <span>
            <i className="rfeSwatchBar rfeSeries1" /> RFE
          </span>

          <span>
            <i className="rfeSwatchBar rfeSeries2" /> NOID
          </span>
        </div>
      </div>

      <div className="rfeChartScroll" ref={ref}>
        <svg
          width={frame.width}
          height={frame.height}
          role="img"
          aria-label={`Llegadas semanales, ${CATEGORY_LABELS[category]}`}
        >
          <Gridlines frame={frame} />

          {weeks.map((w, i) => {
            const x = frame.slotX(i) + (SLOT - BAR) / 2;
            const rfeH = frame.scaleY(w.rfe);
            const noidH = frame.scaleY(w.noid);
            // 2px de superficie entre segmentos apilados.
            const gap = w.rfe > 0 && w.noid > 0 ? 2 : 0;
            const rfeY = frame.baseY - rfeH;
            const dim = hover && hover !== w.weekKey ? "rfeDim" : "";
            return (
              <g
                key={w.weekKey}
                tabIndex={0}
                onMouseEnter={() => setHover(w.weekKey)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(w.weekKey)}
                onBlur={() => setHover(null)}
                className="rfeHit"
              >
                <rect
                  x={frame.slotX(i)}
                  y={PAD_TOP}
                  width={SLOT}
                  height={PLOT_HEIGHT}
                  fill="transparent"
                />

                <path
                  d={columnPath(x, rfeY, BAR, rfeH, w.noid === 0)}
                  className={`rfeSeries1Fill ${dim}`}
                />

                <path
                  d={columnPath(x, rfeY - gap - noidH, BAR, noidH, true)}
                  className={`rfeSeries2Fill ${dim}`}
                />

                <text
                  x={x + BAR / 2}
                  y={frame.height - 6}
                  textAnchor="middle"
                  className="rfeTick"
                >
                  {weekLabel(w.weekKey)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="rfeTooltip">
        {hovered ? (
          <>
            <strong>{weekLabel(hovered.weekKey)}</strong> · RFE {hovered.rfe}{" "}
            · NOID {hovered.noid} · Total {hovered.rfe + hovered.noid}
          </>
        ) : (
          <span>Pasa el cursor sobre una barra para ver el detalle</span>
        )}
      </div>
    </div>
  );
}

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error || "No se pudo guardar");
  }
}

type Draft = Record<RfeCategory, string>;

const toDraft = (counts: Partial<Counts> | undefined): Draft =>
  Object.fromEntries(
    RFE_CATEGORIES.map((c) => [c, String(counts?.[c] ?? 0)])
  ) as Draft;

/*
 * Metas del periodo en curso (semana y mes) y avance manual de
 * Other forms. VAWA y VISA T se cuentan solos desde la Sheet.
 */
function GoalsEditor({
  data,
  onSaved,
}: {
  data: RfeDashboardData;
  onSaved: () => void;
}) {
  const metrics = data.metrics;
  const [weekly, setWeekly] = useState(() => toDraft(metrics?.weeklyGoal));
  const [monthly, setMonthly] = useState(() => toDraft(metrics?.monthlyGoal));
  const [other, setOther] = useState(() => ({
    weekly: String(metrics?.otherFormsProgress.weekly ?? 0),
    monthly: String(metrics?.otherFormsProgress.monthly ?? 0),
  }));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus("");
    try {
      await send("/api/rfe-dashboard/metrics", "POST", {
        weeklyGoal: weekly,
        monthlyGoal: monthly,
        otherFormsProgress: other,
      });
      setStatus("Guardado");
      onSaved();
    } catch (err) {
      setStatus(`No se guardó: ${err instanceof Error ? err.message : "error"}`);
    } finally {
      setSaving(false);
    }
  }

  const column = (
    title: string,
    draft: Draft,
    setDraft: (d: Draft) => void,
    otherKey: "weekly" | "monthly"
  ) => (
    <fieldset className="rfeEditColumn">
      <legend>{title}</legend>

      {RFE_CATEGORIES.map((c) => (
        <label key={c}>
          <span>Meta · {CATEGORY_LABELS[c]}</span>
          <input
            type="number"
            min="0"
            value={draft[c]}
            onChange={(e) => setDraft({ ...draft, [c]: e.target.value })}
          />
        </label>
      ))}

      <label>
        <span>Avance · Other forms (manual)</span>
        <input
          type="number"
          min="0"
          value={other[otherKey]}
          onChange={(e) => setOther({ ...other, [otherKey]: e.target.value })}
        />
      </label>
    </fieldset>
  );

  return (
    <details className="rfeEditPanel">
      <summary>Editar metas y avance</summary>

      <p className="rfeEditHelp">
        El avance de VAWA con deadline, VAWA sin deadline y VISA T se cuenta
        solo desde READY FOR MGM REVIEW. Other forms no tiene esa fecha, por eso
        su avance se captura aquí.
      </p>

      <form onSubmit={save}>
        <div className="rfeEditColumns">
          {column(`Semana en curso (${periodLabel("weekly", data.currentWeek)})`, weekly, setWeekly, "weekly")}
          {column(`Mes en curso (${periodLabel("monthly", data.currentMonth)})`, monthly, setMonthly, "monthly")}
        </div>

        <div className="rfeEditActions">
          <button className="rfePrimaryButton" type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
          {status && <span>{status}</span>}
        </div>
      </form>
    </details>
  );
}

/*
 * Cierres: meta y avance final de cada semana o mes. Quien
 * edita puede corregirlos; "hoja: N" toma lo que marca la Sheet.
 */
function ClosingsTable({
  data,
  period,
  onSaved,
}: {
  data: RfeDashboardData;
  period: GoalPeriod;
  onSaved: () => void;
}) {
  const points = data.goals[period];
  const keys = points.vawaDD.map((p) => p.key).reverse();
  const [drafts, setDrafts] = useState<Record<string, { goal: Draft; actual: Draft }> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pointOf = (c: RfeCategory, key: string) =>
    points[c].find((p) => p.key === key);

  function startEditing() {
    setError("");
    setDrafts(
      Object.fromEntries(
        keys.map((key) => {
          const goal = {} as Counts;
          const actual = {} as Counts;
          for (const c of RFE_CATEGORIES) {
            goal[c] = pointOf(c, key)?.goal ?? 0;
            actual[c] = pointOf(c, key)?.actual ?? 0;
          }
          return [key, { goal: toDraft(goal), actual: toDraft(actual) }];
        })
      )
    );
  }

  function update(key: string, kind: "goal" | "actual", c: RfeCategory, value: string) {
    setDrafts((d) =>
      d ? { ...d, [key]: { ...d[key], [kind]: { ...d[key][kind], [c]: value } } } : d
    );
  }

  async function save() {
    if (!drafts) return;
    const entries = keys
      .filter((key) =>
        RFE_CATEGORIES.some(
          (c) =>
            Number(drafts[key].goal[c]) !== (pointOf(c, key)?.goal ?? 0) ||
            Number(drafts[key].actual[c]) !== (pointOf(c, key)?.actual ?? 0)
        )
      )
      .map((key) => ({ period, key, ...drafts[key] }));

    if (!entries.length) {
      setDrafts(null);
      return;
    }

    setSaving(true);
    setError("");
    try {
      await send("/api/rfe-dashboard/history", "PUT", { entries });
      setDrafts(null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rfeTableToggle">
      <summary>
        {period === "weekly" ? "Cierres por semana" : "Cierres por mes"}
      </summary>

      {data.canEdit && (
        <div className="rfeEditActions">
          {drafts ? (
            <>
              <button className="rfePrimaryButton" onClick={save} disabled={saving} type="button">
                {saving ? "Guardando…" : "Guardar cierres"}
              </button>
              <button className="refreshButton" onClick={() => setDrafts(null)} disabled={saving} type="button">
                Cancelar
              </button>
            </>
          ) : (
            <button className="refreshButton" onClick={startEditing} type="button">
              Editar cierres
            </button>
          )}
          {error && <span className="rfeError">No se guardó: {error}</span>}
        </div>
      )}

      <div className="rfeTableWrap">
        <table className="rfeTable">
          <thead>
            <tr>
              <th>{period === "weekly" ? "Semana" : "Mes"}</th>
              {RFE_CATEGORIES.map((c) => (
                <th key={c}>{CATEGORY_LABELS[c]} · avance / meta</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <td>{periodLabel(period, key)}</td>
                {RFE_CATEGORIES.map((c) => {
                  const point = pointOf(c, key);
                  const draft = drafts?.[key];
                  if (!draft) {
                    return (
                      <td key={c}>
                        {point?.actual ?? "—"} / {point?.goal ?? "—"}
                      </td>
                    );
                  }
                  return (
                    <td key={c}>
                      <div className="rfePairInputs">
                        <input
                          type="number"
                          min="0"
                          aria-label={`Avance ${CATEGORY_LABELS[c]} ${periodLabel(period, key)}`}
                          value={draft.actual[c]}
                          onChange={(e) => update(key, "actual", c, e.target.value)}
                        />
                        <span>/</span>
                        <input
                          type="number"
                          min="0"
                          aria-label={`Meta ${CATEGORY_LABELS[c]} ${periodLabel(period, key)}`}
                          value={draft.goal[c]}
                          onChange={(e) => update(key, "goal", c, e.target.value)}
                        />
                      </div>
                      {point?.sheet !== null && point?.sheet !== undefined && (
                        <button
                          type="button"
                          className="rfeSheetHint"
                          title="Usar este valor como avance"
                          onClick={() => update(key, "actual", c, String(point.sheet))}
                        >
                          hoja: {point.sheet}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default function RfeDashboard() {
  const [data, setData] = useState<RfeDashboardData | null>(null);
  const [period, setPeriod] = useState<GoalPeriod>("weekly");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/rfe-dashboard", {
        cache: "no-store",
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "No se pudo cargar el dashboard");
      }
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

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">ÁREA RFE</p>

          <h1>Dashboard RFE</h1>

          <p>Inventario, metas semanales y llegadas de toda el área.</p>
        </div>

        <button className="refreshButton" onClick={load}>
          ↻ Refresh
        </button>
      </header>

      {error && <div className="errorBanner">{error}</div>}

      {loading && !data ? (
        <div className="loadingCard">Cargando dashboard RFE…</div>
      ) : (
        data && (
          <div className="rfeDashboard">
            <section>
              <div className="rfeSectionHead">
                <p className="dashboardSectionEyebrow">PANORAMA ACTUAL</p>
                <h2>Inventario</h2>
              </div>

              <div className="rfeInvGrid">
                {RFE_CATEGORIES.map((c) => (
                  <InventoryCard
                    key={c}
                    category={c}
                    data={data.inventory[c]}
                  />
                ))}
              </div>
            </section>

            <section>
              <div className="rfeSectionHeadRow">
                <div className="rfeSectionHead">
                  <p className="dashboardSectionEyebrow">DESEMPEÑO</p>
                  <h2>
                    Avance vs meta por {period === "weekly" ? "semana" : "mes"}
                  </h2>
                  <p>
                    Barras: entregas a revisión (MGM Review). Línea: meta.
                    Periodos cerrados muestran su cierre; el periodo en curso,
                    el avance en vivo. Other forms usa el avance capturado a mano.
                  </p>
                </div>

                <div className="celulaSwitch rfePeriodSwitch" role="group" aria-label="Periodo">
                  {(["weekly", "monthly"] as const).map((p) => (
                    <button
                      key={p}
                      className={p === period ? "active" : ""}
                      aria-pressed={p === period}
                      onClick={() => setPeriod(p)}
                    >
                      {p === "weekly" ? "Semana" : "Mes"}
                    </button>
                  ))}
                </div>
              </div>

              {data.goalsError && (
                <div className="errorBanner">{data.goalsError}</div>
              )}

              {data.canEdit && data.metrics && (
                <GoalsEditor
                  key={data.generatedAt}
                  data={data}
                  onSaved={load}
                />
              )}

              <div className="rfeChartGrid">
                {RFE_CATEGORIES.map((c) => (
                  <GoalChart
                    key={c}
                    category={c}
                    period={period}
                    weeks={data.goals[period][c]}
                  />
                ))}
              </div>

              <ClosingsTable
                key={`${period}-${data.generatedAt}`}
                data={data}
                period={period}
                onSaved={load}
              />
            </section>

            <section>
              <div className="rfeSectionHead">
                <p className="dashboardSectionEyebrow">TENDENCIA</p>
                <h2>Llegadas de casos por semana</h2>
                <p>
                  Fecha de registro en Dropbox/recibo · semana{" "}
                  {ARRIVALS_MIN_WEEK} en adelante, solo {ARRIVALS_YEAR}.
                </p>
              </div>

              <div className="rfeChartGrid">
                {RFE_CATEGORIES.map((c) => (
                  <ArrivalsChart
                    key={c}
                    category={c}
                    weeks={data.arrivals[c]}
                  />
                ))}
              </div>
            </section>
          </div>
        )
      )}
    </>
  );
}
