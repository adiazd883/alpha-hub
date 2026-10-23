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
  GoalWeek,
  InventoryBox,
  RfeDashboardData,
} from "@/lib/rfe/logic";

/*
 * Dashboard RFE del área (vista General). Toma la Sheet
 * general de RFE con las mismas reglas del dashboard
 * "Estatus General RFE"; las metas se leen de ese dashboard.
 */

function weekLabel(weekKey: string) {
  const match = /W(\d+)$/.exec(weekKey);
  return match ? `S${Number(match[1])}` : weekKey;
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
  weeks,
}: {
  category: RfeCategory;
  weeks: GoalWeek[];
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

  const hovered = weeks.find((w) => w.weekKey === hover);
  const last = weeks[weeks.length - 1];

  return (
    <div className="rfeChartCard">
      <div className="rfeChartHead">
        <div>
          <div className="rfeChartTitle">{CATEGORY_LABELS[category]}</div>

          {last && (
            <div className="rfeChartSub">
              Semana actual: <strong>{last.actual ?? "—"}</strong> de{" "}
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
          aria-label={`Avance contra meta por semana, ${CATEGORY_LABELS[category]}`}
        >
          <Gridlines frame={frame} />

          {weeks.map((w, i) => {
            const h = frame.scaleY(w.actual ?? 0);
            const x = center(i) - BAR / 2;
            return (
              <path
                key={w.weekKey}
                d={columnPath(x, frame.baseY - h, BAR, h, true)}
                className={`rfeSeries1Fill ${
                  hover && hover !== w.weekKey ? "rfeDim" : ""
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
                key={w.weekKey}
                cx={center(i)}
                cy={goalY(w.goal)}
                r={4}
                className="rfeGoalDot"
              />
            )
          )}

          {weeks.map((w, i) => (
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

              <text
                x={center(i)}
                y={frame.height - 6}
                textAnchor="middle"
                className="rfeTick"
              >
                {weekLabel(w.weekKey)}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="rfeTooltip">
        {hovered ? (
          <>
            <strong>{weekLabel(hovered.weekKey)}</strong> · Avance{" "}
            {hovered.actual ?? "—"} · Meta {hovered.goal ?? "—"}
            {hovered.goal && hovered.actual !== null
              ? ` · ${Math.round((hovered.actual / hovered.goal) * 100)}%`
              : ""}
          </>
        ) : (
          <span>Pasa el cursor sobre una semana para ver el detalle</span>
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

function DataTable({
  goals,
}: {
  goals: Record<RfeCategory, GoalWeek[]>;
}) {
  const weeks = goals.vawaDD.map((w) => w.weekKey);
  return (
    <details className="rfeTableToggle">
      <summary>Ver metas en tabla</summary>

      <div className="rfeTableWrap">
        <table className="rfeTable">
          <thead>
            <tr>
              <th>Semana</th>
              {RFE_CATEGORIES.map((c) => (
                <th key={c}>{CATEGORY_LABELS[c]}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {weeks.map((weekKey, i) => (
              <tr key={weekKey}>
                <td>{weekLabel(weekKey)}</td>
                {RFE_CATEGORIES.map((c) => (
                  <td key={c}>
                    {goals[c][i].actual ?? "—"} / {goals[c][i].goal ?? "—"}
                  </td>
                ))}
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
              <div className="rfeSectionHead">
                <p className="dashboardSectionEyebrow">DESEMPEÑO</p>
                <h2>Avance vs meta por semana</h2>
                <p>
                  Barras: entregas a revisión (MGM Review) de la semana. Línea:
                  meta semanal capturada en el dashboard RFE. Other forms usa el
                  avance capturado a mano.
                </p>
              </div>

              {data.goalsError && (
                <div className="errorBanner">{data.goalsError}</div>
              )}

              <div className="rfeChartGrid">
                {RFE_CATEGORIES.map((c) => (
                  <GoalChart key={c} category={c} weeks={data.goals[c]} />
                ))}
              </div>

              <DataTable goals={data.goals} />
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
