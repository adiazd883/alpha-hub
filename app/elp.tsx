"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ElpCategoria, ElpData, ElpEnvio, ElpRevision } from "@/lib/elp";

/*
 * Regresos de ELP (Sheet "ENTREGAS VS REGRESOS"), solo lectura,
 * pensado para stakeholders: lo visual primero, el detalle al dar clic.
 * - Envíos semanales: lo que escalamos a ELP por semana de envío,
 *   cuánto ya revisaron y cuántos regresos salieron.
 * - Revisiones ELP (COPIA ELP): todo lo revisado por semana de
 *   revisión y sus correcciones.
 *
 * Colores por estado (siempre con leyenda y etiqueta):
 * azul = revisado sin regreso, rojo = regreso, gris = sin revisión.
 */

const CATEGORIAS: ElpCategoria[] = ["VAWA", "VAWA NDD", "NON VAWA"];
const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const SIN = "Sin homologar";

const pctNum = (n: number, d: number) => (d ? (n / d) * 100 : 0);
const pct = (n: number, d: number) => (d ? `${pctNum(n, d).toFixed(1)}%` : "—");
const pct0 = (n: number, d: number) => (d ? `${Math.round(pctNum(n, d))}%` : "—");

// "2026-W45" → lunes de esa semana.
function mondayOf(key: string) {
  const [y, w] = key.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return monday;
}

function weekLabel(key: string) {
  const start = mondayOf(key);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const f = (d: Date) => `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
  return { short: `Sem ${Number(key.split("-W")[1])}`, range: `${f(start)} – ${f(end)}` };
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${String(y).slice(2)}`;
}

function countBy<T>(items: T[], keys: (i: T) => string[]) {
  const m = new Map<string, number>();
  items.forEach((i) => keys(i).forEach((k) => m.set(k, (m.get(k) || 0) + 1)));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

type Zoom = { campo: string; valor: string } | null;

/* ---------- Tooltip compartido ---------- */

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

/* ---------- Piezas visuales ---------- */

function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="elpLegend">
      {items.map(([label, cls]) => (
        <span key={label}>
          <i className={`elpSw ${cls}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

type Seg = { value: number; cls: string; label: string };

// Barra horizontal apilada; el resto hasta `total` queda como pista gris.
function StackBar({ segs, total, tip }: { segs: Seg[]; total: number; tip?: object }) {
  return (
    <div className="elpStackBar" {...tip}>
      {segs
        .filter((s) => s.value > 0)
        .map((s) => (
          <i key={s.label} className={s.cls} style={{ width: `${pctNum(s.value, total)}%` }} />
        ))}
    </div>
  );
}

// Embudo: escalados → revisados → regresos.
function Funnel({ total, rev, reg }: { total: number; rev: number; reg: number }) {
  const steps = [
    { label: "Escalados a ELP", value: total, sub: "100% de lo enviado", cls: "elpFunnelAll", w: 100 },
    { label: "Revisados por ELP", value: rev, sub: `${pct(rev, total)} de lo escalado`, cls: "elpFunnelRev", w: pctNum(rev, total) },
    { label: "Con regreso", value: reg, sub: `${pct(reg, rev)} de lo revisado`, cls: "elpFunnelReg", w: pctNum(reg, total) },
  ];
  return (
    <section className="elpCard elpFunnel">
      <div className="elpCardHead">
        <h3>Del envío al regreso</h3>
        <span>Cuántos casos escalados ya revisó ELP y cuántos regresaron</span>
      </div>
      {steps.map((s) => (
        <div key={s.label} className="elpFunnelRow">
          <div className="elpFunnelLabel">
            <span>{s.label}</span>
            <small>{s.sub}</small>
          </div>
          <div className="elpFunnelTrack">
            <i className={s.cls} style={{ width: `${Math.max(s.w, s.value ? 2 : 0)}%` }} />
            <b>{s.value}</b>
          </div>
        </div>
      ))}
    </section>
  );
}

// Anillo de progreso para un porcentaje (con su número al centro).
function Ring({ value, cls, label }: { value: number; cls: string; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg className="elpRing" viewBox="0 0 84 84" role="img" aria-label={`${label}: ${value.toFixed(1)}%`}>
      <circle cx="42" cy="42" r={r} className="elpRingTrack" />
      <circle
        cx="42"
        cy="42"
        r={r}
        className={`elpRingValue ${cls}`}
        strokeDasharray={`${(Math.min(value, 100) / 100) * c} ${c}`}
        transform="rotate(-90 42 42)"
      />
      <text x="42" y="46" textAnchor="middle">
        {Math.round(value)}%
      </text>
    </svg>
  );
}

function Hero({
  items,
}: {
  items: { label: string; value: number | string; sub?: string; ring?: { value: number; cls: string }; alert?: boolean }[];
}) {
  return (
    <div className="elpHero">
      {items.map((k) => (
        <div key={k.label} className={`elpHeroTile ${k.alert ? "elpHeroAlert" : ""}`}>
          <div>
            <span>{k.label}</span>
            <strong>{k.value}</strong>
            {k.sub && <small>{k.sub}</small>}
          </div>
          {k.ring && <Ring value={k.ring.value} cls={k.ring.cls} label={k.label} />}
        </div>
      ))}
    </div>
  );
}

// Columnas apiladas por semana, con total en la punta y % debajo.
function WeekColumns({
  weeks,
  tip,
  pctLabel,
}: {
  weeks: { key: string; segs: Seg[]; total: number; pct: string; tipRows: [string, string, string?][] }[];
  tip: ReturnType<typeof useTip>["bind"];
  pctLabel: string;
}) {
  const max = Math.max(1, ...weeks.map((w) => w.total));
  return (
    <div className="elpColumns" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(34px, 1fr))` }}>
      {weeks.map((w) => {
        const l = weekLabel(w.key);
        return (
          <div
            key={w.key}
            className="elpCol"
            tabIndex={0}
            {...tip(<TipRows title={`${l.short} · ${l.range}`} rows={w.tipRows} />)}
          >
            <div className="elpColPlot">
              <b className="elpColTotal">{w.total}</b>
              <div className="elpColStack" style={{ height: `${(w.total / max) * 100}%` }}>
                {w.segs
                  .filter((s) => s.value > 0)
                  .map((s) => (
                    <i key={s.label} className={s.cls} style={{ flexGrow: s.value }} />
                  ))}
              </div>
            </div>
            <span className="elpColLabel">{l.short}</span>
            <span className="elpColPct" title={pctLabel}>
              {w.pct}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Ranking horizontal; un clic filtra las tarjetas de regresos.
function RankBars({
  title,
  rows,
  total,
  campo,
  zoom,
  onZoom,
  tip,
}: {
  title: string;
  rows: [string, number][];
  total: number;
  campo: string;
  zoom: Zoom;
  onZoom: (z: Zoom) => void;
  tip: ReturnType<typeof useTip>["bind"];
}) {
  // Lo que no trae dato no compite en el ranking: va como nota.
  const isMissing = (name: string) => name === SIN || name.startsWith("Sin ");
  const missing = rows.filter(([name]) => isMissing(name));
  const ranked = rows.filter(([name]) => !isMissing(name));
  const missingCount = missing.reduce((t, r) => t + r[1], 0);
  const max = Math.max(1, ...ranked.map((r) => r[1]));
  return (
    <section className="elpCard elpRank">
      <div className="elpCardHead">
        <h3>{title}</h3>
      </div>
      {ranked.length ? (
        <ul>
          {ranked.slice(0, 8).map(([name, count]) => {
            const on = zoom?.campo === campo && zoom.valor === name;
            return (
              <li key={name}>
                <button
                  className={on ? "active" : ""}
                  aria-pressed={on}
                  onClick={() => onZoom(on ? null : { campo, valor: name })}
                  {...tip(<TipRows title={name} rows={[["Regresos", String(count)], ["Del total", pct(count, total)]]} />)}
                >
                  <span className="elpRankName">{name}</span>
                  <span className="elpRankTrack">
                    <i className="elpSegReg" style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                  <b>{count}</b>
                  <small>{pct0(count, total)}</small>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="elpEmpty">{rows.length ? "Aún sin clasificar." : "Sin regresos en estas semanas."}</div>
      )}
      {ranked.length > 8 && <span className="elpMore">+{ranked.length - 8} más</span>}
      {missingCount > 0 && (
        <button
          className={`elpMissing ${zoom?.campo === campo && zoom.valor === missing[0][0] ? "active" : ""}`}
          onClick={() =>
            onZoom(zoom?.campo === campo && zoom.valor === missing[0][0] ? null : { campo, valor: missing[0][0] })
          }
        >
          {missingCount} de {total} sin dato ({pct0(missingCount, total)}) · ver casos
        </button>
      )}
    </section>
  );
}

function WeekChips({
  weeks,
  selected,
  onChange,
}: {
  weeks: string[];
  selected: string[];
  onChange: (w: string[]) => void;
}) {
  return (
    <div className="elpWeekChips" role="group" aria-label="Semanas">
      <button className={!selected.length ? "active" : ""} onClick={() => onChange([])}>
        Todas
      </button>
      {weeks.map((w) => {
        const on = selected.includes(w);
        const l = weekLabel(w);
        return (
          <button
            key={w}
            className={on ? "active" : ""}
            aria-pressed={on}
            title={l.range}
            onClick={() => onChange(on ? selected.filter((x) => x !== w) : [...selected, w].sort())}
          >
            {l.short}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Página ---------- */

export default function ElpRegresos() {
  const [data, setData] = useState<ElpData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"envios" | "copia">("envios");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/elp", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar ELP");
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
    <div className="rgPage elpPage">
      <header className="elpBanner">
        <div>
          <p>CALIDAD · REVISIÓN EXTERNA</p>
          <h1>Regresos ELP</h1>
          <span>Qué escalamos a ELP, cuánto revisaron y qué tuvimos que corregir.</span>
        </div>
        <div className="elpBannerSide">
          <div className="elpTabs" role="tablist">
            <button role="tab" aria-selected={tab === "envios"} className={tab === "envios" ? "active" : ""} onClick={() => setTab("envios")}>
              Envíos semanales
            </button>
            <button role="tab" aria-selected={tab === "copia"} className={tab === "copia" ? "active" : ""} onClick={() => setTab("copia")}>
              Revisiones ELP
            </button>
          </div>
          <button className="elpRefresh" onClick={load} disabled={loading}>
            {loading ? "Cargando…" : "↻ Actualizar"}
          </button>
        </div>
      </header>

      {error && <div className="errorBanner">{error}</div>}

      {loading && !data ? (
        <div className="loadingCard">Cargando ELP…</div>
      ) : data ? (
        tab === "envios" ? (
          <Envios items={data.envios} />
        ) : (
          <Copia items={data.revisiones} sinFecha={data.sinFecha} />
        )
      ) : null}
    </div>
  );
}

/* ---------- Envíos semanales ---------- */

const ENVIO_LEGEND: [string, string][] = [
  ["Revisado sin regreso", "elpSegOk"],
  ["Regreso", "elpSegReg"],
  ["Sin revisión", "elpSegNone"],
];

function envioStats(list: ElpEnvio[]) {
  const rev = list.filter((i) => i.revisado).length;
  const reg = list.filter((i) => i.regreso).length;
  return { total: list.length, rev, sin: list.length - rev, reg, ok: rev - reg };
}

const envioSegs = (s: ReturnType<typeof envioStats>): Seg[] => [
  { value: s.ok, cls: "elpSegOk", label: "Revisado sin regreso" },
  { value: s.reg, cls: "elpSegReg", label: "Regreso" },
];

const envioTip = (s: ReturnType<typeof envioStats>): [string, string, string?][] => [
  ["Escalados", String(s.total)],
  ["Revisados", `${s.rev} · ${pct(s.rev, s.total)}`, "elpSegOk"],
  ["Regresos", `${s.reg} · ${pct(s.reg, s.rev)} de revisados`, "elpSegReg"],
  ["Sin revisión", `${s.sin} · ${pct(s.sin, s.total)}`, "elpSegNone"],
];

function Envios({ items }: { items: ElpEnvio[] }) {
  const weeks = useMemo(() => [...new Set(items.map((i) => i.semana))].sort(), [items]);
  const [selected, setSelected] = useState<string[]>([]);
  const [cat, setCat] = useState<ElpCategoria | null>(null);
  const [zoom, setZoom] = useState<Zoom>(null);
  const tip = useTip();

  const inWeeks = items.filter((i) => !selected.length || selected.includes(i.semana));
  const scope = inWeeks.filter((i) => !cat || i.categoria === cat);
  const s = envioStats(scope);
  const regresos = scope.filter((i) => i.regreso);

  const keysOf = (i: ElpEnvio, campo: string) =>
    campo === "homologada"
      ? i.homologada.length
        ? i.homologada
        : [SIN]
      : campo === "equipo"
        ? [i.equipo || "Sin asignar"]
        : [i.subtipo];

  const subtipos = countBy(scope, (i) => [i.subtipo]).map(([name]) => ({
    name,
    ...envioStats(scope.filter((i) => i.subtipo === name)),
  }));
  const maxSub = Math.max(1, ...subtipos.map((x) => x.total));

  const lista = regresos.filter((i) => !zoom || keysOf(i, zoom.campo).includes(zoom.valor));

  return (
    <>
      <div className="elpToolbar">
        <WeekChips weeks={weeks} selected={selected} onChange={setSelected} />
        <span>Por semana de envío a ELP{cat ? ` · ${cat}` : ""}</span>
      </div>

      <Hero
        items={[
          { label: "Casos escalados", value: s.total, sub: selected.length ? `${selected.length} semana(s)` : `${weeks.length} semanas` },
          { label: "Revisados por ELP", value: s.rev, sub: `${s.sin} siguen sin revisión`, ring: { value: pctNum(s.rev, s.total), cls: "elpSegOk" } },
          { label: "Regresos", value: s.reg, sub: "sobre los casos revisados", ring: { value: pctNum(s.reg, s.rev), cls: "elpSegReg" }, alert: s.reg > 0 },
        ]}
      />

      <div className="elpRow2">
        <Funnel total={s.total} rev={s.rev} reg={s.reg} />

        <section className="elpCard">
          <div className="elpCardHead">
            <h3>Semana a semana</h3>
            <span>Total escalado · % revisado debajo</span>
          </div>
          <WeekColumns
            tip={tip.bind}
            pctLabel="% revisado"
            weeks={weeks
              .filter((w) => !selected.length || selected.includes(w))
              .map((w) => {
                const ws = envioStats(scope.filter((i) => i.semana === w));
                return { key: w, total: ws.total, segs: [...envioSegs(ws), { value: ws.sin, cls: "elpSegNone", label: "Sin revisión" }], pct: pct0(ws.rev, ws.total), tipRows: envioTip(ws) };
              })}
          />
          <Legend items={ENVIO_LEGEND} />
        </section>
      </div>

      <div className="elpSectionTitle">
        <h2>Por tipo de caso</h2>
        <span>Clic en un tipo para ver sus subtipos</span>
      </div>
      <div className="elpCats">
        {CATEGORIAS.map((c) => {
          const cs = envioStats(inWeeks.filter((i) => i.categoria === c));
          const on = cat === c;
          return (
            <button
              key={c}
              className={`elpCat ${on ? "active" : ""} ${cat && !on ? "dim" : ""}`}
              aria-pressed={on}
              onClick={() => {
                setCat(on ? null : c);
                setZoom(null);
              }}
            >
              <div className="elpCatTop">
                <span>{c}</span>
                <em>{pct0(cs.total, inWeeks.length)} del total</em>
              </div>
              <strong>{cs.total}</strong>
              <StackBar segs={envioSegs(cs)} total={cs.total} tip={tip.bind(<TipRows title={c} rows={envioTip(cs)} />)} />
              <div className="elpCatStats">
                <span>
                  <b>{pct0(cs.rev, cs.total)}</b> revisado
                </span>
                <span className={cs.reg ? "elpRegText" : ""}>
                  <b>{cs.reg}</b> {cs.reg === 1 ? "regreso" : "regresos"}
                  {cs.rev > 0 && ` · ${pct0(cs.reg, cs.rev)}`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <section className="elpCard">
        <div className="elpCardHead">
          <h3>Subtipos{cat ? ` · ${cat}` : ""}</h3>
          <span>Según FORM · barra = casos escalados</span>
        </div>
        <div className="elpSubList">
          {subtipos.map((x) => (
            <div key={x.name} className="elpSub" {...tip.bind(<TipRows title={x.name} rows={envioTip(x)} />)}>
              <span className="elpSubName">{x.name}</span>
              <div className="elpSubBar">
                <div style={{ width: `${(x.total / maxSub) * 100}%` }}>
                  <StackBar segs={envioSegs(x)} total={x.total} />
                </div>
                <b>{x.total}</b>
              </div>
              <span className="elpSubMeta">
                {pct0(x.rev, x.total)} revisado
                {x.reg > 0 && (
                  <button className="elpRegPill" onClick={() => setZoom({ campo: "subtipo", valor: x.name })}>
                    {x.reg} {x.reg === 1 ? "regreso" : "regresos"}
                  </button>
                )}
              </span>
            </div>
          ))}
          {!subtipos.length && <div className="elpEmpty">Sin casos.</div>}
        </div>
        <Legend items={ENVIO_LEGEND} />
      </section>

      <div className="elpSectionTitle">
        <h2>¿Qué regresó?</h2>
        <span>Clic en una barra para ver esos casos</span>
      </div>
      <div className="elpRow2">
        <RankBars title="Corrección homologada" rows={countBy(regresos, (i) => keysOf(i, "homologada"))} total={regresos.length} campo="homologada" zoom={zoom} onZoom={setZoom} tip={tip.bind} />
        <RankBars title="Equipo a cargo" rows={countBy(regresos, (i) => keysOf(i, "equipo"))} total={regresos.length} campo="equipo" zoom={zoom} onZoom={setZoom} tip={tip.bind} />
      </div>

      <RegresoCards
        zoom={zoom}
        onClear={() => setZoom(null)}
        rows={lista.map((i, n) => ({
          key: `${i.semana}-${i.cliente}-${n}`,
          cliente: i.cliente,
          tags: [i.categoria, i.subtipo, `Envío ${weekLabel(i.semana).short}`],
          fecha: i.fechaRevision,
          correctionType: i.correctionType,
          homologada: i.homologada,
          equipo: i.equipo,
        }))}
      />
      {tip.node}
    </>
  );
}

/* ---------- Revisiones ELP (COPIA ELP) ---------- */

const COPIA_LEGEND: [string, string][] = [
  ["Sin corrección", "elpSegOk"],
  ["Con corrección", "elpSegReg"],
];

function Copia({ items, sinFecha }: { items: ElpRevision[]; sinFecha: number }) {
  const weeks = useMemo(() => [...new Set(items.map((i) => i.semana))].sort(), [items]);
  const [selected, setSelected] = useState<string[]>([]);
  const [zoom, setZoom] = useState<Zoom>(null);
  const tip = useTip();

  const scope = items.filter((i) => !selected.length || selected.includes(i.semana));
  const regresos = scope.filter((i) => i.regreso);

  const keysOf = (i: ElpRevision, campo: string): string[] => {
    const v = (x: string, empty: string) => [x || empty];
    switch (campo) {
      case "homologada":
        return i.homologada;
      case "equipo":
        return v(i.equipo, "Sin asignar");
      case "tl":
        return v(i.tl, "Sin TL");
      case "colaborador":
        return v(i.colaborador, "Sin colaborador");
      default:
        return v(i.caseType, "Sin case type");
    }
  };

  const lista = regresos.filter((i) => !zoom || keysOf(i, zoom.campo).includes(zoom.valor));

  const porSemana = weeks
    .filter((w) => !selected.length || selected.includes(w))
    .map((w) => {
      const list = items.filter((i) => i.semana === w);
      const reg = list.filter((i) => i.regreso).length;
      return { w, total: list.length, reg };
    });
  const avg = pctNum(regresos.length, scope.length);
  const best = porSemana.filter((x) => x.total >= 5).sort((a, b) => pctNum(a.reg, a.total) - pctNum(b.reg, b.total))[0];

  const breakdowns: [string, string][] = [
    ["Corrección homologada", "homologada"],
    ["Equipo a cargo", "equipo"],
    ["Case Type", "caseType"],
    ["TL", "tl"],
    ["Colaborador", "colaborador"],
  ];

  return (
    <>
      <div className="elpToolbar">
        <WeekChips weeks={weeks} selected={selected} onChange={setSelected} />
        <span>Por semana de revisión de ELP</span>
      </div>

      <Hero
        items={[
          { label: "Casos revisados por ELP", value: scope.length, sub: selected.length ? `${selected.length} semana(s)` : `${weeks.length} semanas` },
          { label: "Con corrección", value: regresos.length, sub: `${scope.length - regresos.length} pasaron sin corrección`, ring: { value: avg, cls: "elpSegReg" }, alert: regresos.length > 0 },
          {
            label: "Mejor semana",
            value: best ? weekLabel(best.w).short : "—",
            sub: best ? `${pct(best.reg, best.total)} de corrección · ${best.total} revisados` : "Sin datos",
          },
        ]}
      />

      <section className="elpCard">
        <div className="elpCardHead">
          <h3>Revisados y correcciones por semana</h3>
          <span>Barra = casos revisados · % de corrección debajo · promedio {pct(regresos.length, scope.length)}</span>
        </div>
        <WeekColumns
          tip={tip.bind}
          pctLabel="% con corrección"
          weeks={porSemana.map((x) => ({
            key: x.w,
            total: x.total,
            segs: [
              { value: x.total - x.reg, cls: "elpSegOk", label: "Sin corrección" },
              { value: x.reg, cls: "elpSegReg", label: "Con corrección" },
            ],
            pct: pct0(x.reg, x.total),
            tipRows: [
              ["Revisados", String(x.total)],
              ["Con corrección", `${x.reg} · ${pct(x.reg, x.total)}`, "elpSegReg"],
              ["Sin corrección", String(x.total - x.reg), "elpSegOk"],
            ],
          }))}
        />
        <Legend items={COPIA_LEGEND} />
        {sinFecha > 0 && (
          <span className="elpFootnote">
            {sinFecha} {sinFecha === 1 ? "fila sin fecha legible queda" : "filas sin fecha legible quedan"} fuera de las semanas.
          </span>
        )}
      </section>

      <div className="elpSectionTitle">
        <h2>¿Qué se corrigió?</h2>
        <span>
          Según Corrección homologada · clic en una barra para ver esos casos
        </span>
      </div>
      <div className="elpRow2">
        {breakdowns.slice(0, 2).map(([title, campo]) => (
          <RankBars key={campo} title={title} rows={countBy(regresos, (i) => keysOf(i, campo))} total={regresos.length} campo={campo} zoom={zoom} onZoom={setZoom} tip={tip.bind} />
        ))}
      </div>
      <div className="elpRow3">
        {breakdowns.slice(2).map(([title, campo]) => (
          <RankBars key={campo} title={title} rows={countBy(regresos, (i) => keysOf(i, campo))} total={regresos.length} campo={campo} zoom={zoom} onZoom={setZoom} tip={tip.bind} />
        ))}
      </div>

      <RegresoCards
        zoom={zoom}
        onClear={() => setZoom(null)}
        rows={lista.map((i, n) => ({
          key: `${i.fecha}-${i.cliente}-${n}`,
          cliente: i.cliente,
          tags: [i.caseType].filter(Boolean),
          fecha: i.fecha,
          correctionType: i.correctionType,
          homologada: i.homologada,
          equipo: [i.equipo, i.tl, i.colaborador].filter(Boolean).join(" · "),
        }))}
      />
      {tip.node}
    </>
  );
}

/* ---------- Tarjetas de regresos ---------- */

type RegresoRow = {
  key: string;
  cliente: string;
  tags: string[];
  fecha: string | null;
  correctionType: string;
  homologada: string[];
  equipo: string;
};

function RegresoCards({ rows, zoom, onClear }: { rows: RegresoRow[]; zoom: Zoom; onClear: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  return (
    <section className="elpCard">
      <div className="elpCardHead elpCardHeadRow">
        <h3>
          Casos con regreso <span className="elpCount">{rows.length}</span>
        </h3>
        {zoom && (
          <button className="elpClear" onClick={onClear}>
            Filtro: {zoom.valor} ✕
          </button>
        )}
      </div>
      <div className="elpCards">
        {shown.map((r) => (
          <article key={r.key} className="elpRegCard">
            <header>
              <strong>{r.cliente}</strong>
              <time>{fmtDate(r.fecha)}</time>
            </header>
            <div className="elpTags">
              {r.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <p>{r.correctionType || "Sin detalle de la corrección"}</p>
            <footer>
              {r.homologada.length ? (
                r.homologada.map((h) => (
                  <span key={h} className="elpHomTag">
                    {h}
                  </span>
                ))
              ) : (
                <span className="elpHomTag elpHomNone">{SIN}</span>
              )}
              {r.equipo && <span className="elpTeam">{r.equipo}</span>}
            </footer>
          </article>
        ))}
      </div>
      {!rows.length && <div className="elpEmpty">Sin regresos con estos filtros.</div>}
      {rows.length > 12 && (
        <button className="elpShowAll" onClick={() => setAll(!all)}>
          {all ? "Ver menos" : `Ver los ${rows.length} casos`}
        </button>
      )}
    </section>
  );
}
