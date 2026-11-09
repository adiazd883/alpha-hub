"use client";

import { useEffect, useMemo, useState } from "react";
import type { ElpCategoria, ElpData, ElpEnvio, ElpRevision } from "@/lib/elp";

/*
 * Regresos de ELP (Sheet "ENTREGAS VS REGRESOS"), solo lectura.
 * - Envíos semanales: lo que escalamos a ELP por semana de envío,
 *   cuánto ya revisaron y cuántos regresos salieron.
 * - Revisiones ELP (COPIA ELP): todo lo revisado por semana de
 *   revisión y sus correcciones.
 */

const CATEGORIAS: ElpCategoria[] = ["VAWA", "VAWA NDD", "NON VAWA"];
const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const SIN = "Sin homologar";

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");

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

// Barras horizontales; un clic filtra la lista de regresos.
function Breakdown({
  title,
  rows,
  total,
  campo,
  zoom,
  onZoom,
}: {
  title: string;
  rows: [string, number][];
  total: number;
  campo: string;
  zoom: Zoom;
  onZoom: (z: Zoom) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className="gmTableCard elpBreakdown">
      <h3>{title}</h3>
      {rows.length ? (
        <ul>
          {rows.map(([name, count]) => {
            const on = zoom?.campo === campo && zoom.valor === name;
            return (
              <li key={name}>
                <button
                  className={on ? "active" : ""}
                  aria-pressed={on}
                  title="Ver estos regresos"
                  onClick={() => onZoom(on ? null : { campo, valor: name })}
                >
                  <span className="elpName">{name}</span>
                  <span className="elpBar">
                    <i style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                  <b>{count}</b>
                  <small>{pct(count, total)}</small>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="gmEmpty">Sin regresos.</div>
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
    <div className="rgChips rgChipsSmall" role="group" aria-label="Semanas">
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
      <header className="pageHeader">
        <div>
          <p className="eyebrow">CALIDAD · ELP</p>
          <h1>Regresos ELP</h1>
          <p>Casos escalados a ELP, revisiones y correcciones (Sheet ENTREGAS VS REGRESOS).</p>
        </div>
        <button className="refreshButton" onClick={load}>
          ↻ Refresh
        </button>
      </header>

      <div className="rgChips" role="tablist">
        <button className={tab === "envios" ? "active" : ""} onClick={() => setTab("envios")}>
          Envíos semanales
        </button>
        <button className={tab === "copia" ? "active" : ""} onClick={() => setTab("copia")}>
          Revisiones ELP
        </button>
      </div>

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

function Envios({ items }: { items: ElpEnvio[] }) {
  const weeks = useMemo(() => [...new Set(items.map((i) => i.semana))].sort(), [items]);
  const [selected, setSelected] = useState<string[]>([]);
  const [cat, setCat] = useState<ElpCategoria | null>(null);
  const [zoom, setZoom] = useState<Zoom>(null);

  const inWeeks = items.filter((i) => !selected.length || selected.includes(i.semana));
  const scope = inWeeks.filter((i) => !cat || i.categoria === cat);
  const revisados = scope.filter((i) => i.revisado);
  const regresos = scope.filter((i) => i.regreso);

  const stats = (list: ElpEnvio[]) => {
    const rev = list.filter((i) => i.revisado).length;
    const reg = list.filter((i) => i.regreso).length;
    return { total: list.length, rev, sin: list.length - rev, reg };
  };

  const subtipos = countBy(scope, (i) => [i.subtipo]).map(([name]) => ({
    name,
    ...stats(scope.filter((i) => i.subtipo === name)),
  }));

  const keysOf = (i: ElpEnvio, campo: string) =>
    campo === "homologada"
      ? i.homologada.length
        ? i.homologada
        : [SIN]
      : campo === "equipo"
        ? [i.equipo || "Sin asignar"]
        : [i.subtipo];

  const lista = regresos.filter((i) => !zoom || keysOf(i, zoom.campo).includes(zoom.valor));

  return (
    <>
      <div className="gmFilters cmFilters">
        <WeekChips weeks={weeks} selected={selected} onChange={setSelected} />
        <span className="rsCount">Semana de envío a ELP</span>
      </div>

      <div className="gmKpis cmKpis">
        <div>
          <span>Escalados a ELP</span>
          <strong>{scope.length}</strong>
        </div>
        <div>
          <span>Revisados</span>
          <strong>{revisados.length}</strong>
          <small>{pct(revisados.length, scope.length)} del total</small>
        </div>
        <div>
          <span>Sin revisión</span>
          <strong>{scope.length - revisados.length}</strong>
          <small>{pct(scope.length - revisados.length, scope.length)} del total</small>
        </div>
        <div className={regresos.length ? "gmKpiAlert" : ""}>
          <span>Regresos</span>
          <strong>{regresos.length}</strong>
          <small>{pct(regresos.length, revisados.length)} de los revisados</small>
        </div>
      </div>

      <div className="elpCats">
        {CATEGORIAS.map((c) => {
          const s = stats(inWeeks.filter((i) => i.categoria === c));
          const on = cat === c;
          return (
            <button
              key={c}
              className={`elpCat ${on ? "active" : ""}`}
              aria-pressed={on}
              onClick={() => {
                setCat(on ? null : c);
                setZoom(null);
              }}
            >
              <span>{c}</span>
              <strong>{s.total}</strong>
              <small>{pct(s.total, inWeeks.length)} de lo escalado</small>
              <em>
                {s.rev} revisados ({pct(s.rev, s.total)}) · {s.reg} regresos ({pct(s.reg, s.rev)})
              </em>
            </button>
          );
        })}
      </div>

      <div className="elpGrid">
        <section className="gmTableCard">
          <h3>Por semana{cat ? ` · ${cat}` : ""}</h3>
          <div className="gmTableWrap">
            <table className="gmTable">
              <thead>
                <tr>
                  <th>Semana envío</th>
                  <th>Escalados</th>
                  <th>Revisados</th>
                  <th>Sin revisión</th>
                  <th>Regresos</th>
                </tr>
              </thead>
              <tbody>
                {weeks
                  .filter((w) => !selected.length || selected.includes(w))
                  .map((w) => {
                    const s = stats(scope.filter((i) => i.semana === w));
                    const l = weekLabel(w);
                    return (
                      <tr key={w}>
                        <td>
                          <strong>{l.short}</strong>
                          <div className="gmSub">{l.range}</div>
                        </td>
                        <td>{s.total}</td>
                        <td>
                          {s.rev} <span className="gmSub">{pct(s.rev, s.total)}</span>
                        </td>
                        <td>
                          {s.sin} <span className="gmSub">{pct(s.sin, s.total)}</span>
                        </td>
                        <td>
                          {s.reg} <span className="gmSub">{pct(s.reg, s.rev)} de revisados</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="gmTableCard">
          <h3>Subtipo (FORM){cat ? ` · ${cat}` : ""}</h3>
          <div className="gmTableWrap">
            <table className="gmTable">
              <thead>
                <tr>
                  <th>Subtipo</th>
                  <th>Escalados</th>
                  <th>Revisados</th>
                  <th>Regresos</th>
                </tr>
              </thead>
              <tbody>
                {subtipos.map((s) => (
                  <tr key={s.name}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>
                      {s.total} <span className="gmSub">{pct(s.total, scope.length)}</span>
                    </td>
                    <td>
                      {s.rev} <span className="gmSub">{pct(s.rev, s.total)}</span>
                    </td>
                    <td>
                      {s.reg ? (
                        <button
                          className="gmCount"
                          title="Ver regresos"
                          onClick={() => setZoom({ campo: "subtipo", valor: s.name })}
                        >
                          {s.reg}
                        </button>
                      ) : (
                        0
                      )}{" "}
                      <span className="gmSub">{pct(s.reg, s.rev)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!subtipos.length && <div className="gmEmpty">Sin casos.</div>}
          </div>
        </section>
      </div>

      <div className="elpGrid">
        <Breakdown
          title="Corrección homologada"
          rows={countBy(regresos, (i) => keysOf(i, "homologada"))}
          total={regresos.length}
          campo="homologada"
          zoom={zoom}
          onZoom={setZoom}
        />
        <Breakdown
          title="Equipo a cargo"
          rows={countBy(regresos, (i) => keysOf(i, "equipo"))}
          total={regresos.length}
          campo="equipo"
          zoom={zoom}
          onZoom={setZoom}
        />
      </div>

      <RegresosTable
        zoom={zoom}
        onClear={() => setZoom(null)}
        rows={lista.map((i, n) => ({
          key: `${i.semana}-${i.cliente}-${n}`,
          cliente: i.cliente,
          semana: weekLabel(i.semana).short,
          tipo: `${i.categoria} · ${i.subtipo}`,
          fecha: i.fechaRevision,
          correctionType: i.correctionType,
          homologada: i.homologada.join(", "),
          equipo: i.equipo,
        }))}
        semanaLabel="Envío"
      />
    </>
  );
}

function Copia({ items, sinFecha }: { items: ElpRevision[]; sinFecha: number }) {
  const weeks = useMemo(() => [...new Set(items.map((i) => i.semana))].sort(), [items]);
  const [selected, setSelected] = useState<string[]>([]);
  const [zoom, setZoom] = useState<Zoom>(null);

  const scope = items.filter((i) => !selected.length || selected.includes(i.semana));
  const regresos = scope.filter((i) => i.regreso);
  const sinHomologar = regresos.filter((i) => !i.homologada.length).length;

  const keysOf = (i: ElpRevision, campo: string): string[] => {
    const v = (x: string, empty: string) => [x || empty];
    switch (campo) {
      case "homologada":
        return i.homologada.length ? i.homologada : [SIN];
      case "equipo":
        return v(i.equipo, "Sin asignar");
      case "tl":
        return v(i.tl, "Sin TL");
      case "colaborador":
        return v(i.colaborador, "Sin colaborador");
      case "caseType":
        return v(i.caseType, "Sin case type");
      case "notice":
        return v(i.notice, "Sin notice type");
      default:
        return v(i.subtipo, "Sin subtipo");
    }
  };

  const lista = regresos.filter((i) => !zoom || keysOf(i, zoom.campo).includes(zoom.valor));

  const porSemana = weeks
    .filter((w) => !selected.length || selected.includes(w))
    .map((w) => {
      const list = items.filter((i) => i.semana === w);
      return { w, total: list.length, reg: list.filter((i) => i.regreso).length };
    });
  const max = Math.max(1, ...porSemana.map((s) => s.total));

  const breakdowns: [string, string][] = [
    ["Corrección homologada", "homologada"],
    ["Equipo a cargo", "equipo"],
    ["TL", "tl"],
    ["Colaborador", "colaborador"],
    ["Case Type", "caseType"],
    ["Notice Type", "notice"],
    ["Subtipo PMO", "subtipo"],
  ];

  return (
    <>
      <div className="gmFilters cmFilters">
        <WeekChips weeks={weeks} selected={selected} onChange={setSelected} />
        <span className="rsCount">Semana de revisión de ELP</span>
      </div>

      <div className="gmKpis cmKpis">
        <div>
          <span>Casos revisados</span>
          <strong>{scope.length}</strong>
        </div>
        <div className={regresos.length ? "gmKpiAlert" : ""}>
          <span>Correcciones</span>
          <strong>{regresos.length}</strong>
          <small>{pct(regresos.length, scope.length)} de los revisados</small>
        </div>
        <div>
          <span>Sin corrección</span>
          <strong>{scope.length - regresos.length}</strong>
          <small>{pct(scope.length - regresos.length, scope.length)}</small>
        </div>
        <div>
          <span>Sin homologar</span>
          <strong>{sinHomologar}</strong>
          <small>{pct(sinHomologar, regresos.length)} de las correcciones</small>
        </div>
      </div>

      <section className="gmTableCard">
        <h3>Revisados y correcciones por semana</h3>
        <div className="gmTableWrap">
          <table className="gmTable">
            <thead>
              <tr>
                <th>Semana revisión</th>
                <th>Revisados</th>
                <th>Correcciones</th>
                <th>%</th>
                <th className="elpTrendHead">Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {porSemana.map((s) => {
                const l = weekLabel(s.w);
                return (
                  <tr key={s.w}>
                    <td>
                      <strong>{l.short}</strong>
                      <div className="gmSub">{l.range}</div>
                    </td>
                    <td>{s.total}</td>
                    <td>{s.reg}</td>
                    <td>
                      <strong>{pct(s.reg, s.total)}</strong>
                    </td>
                    <td className="elpTrend">
                      <span className="elpStack" title={`${s.reg} de ${s.total}`}>
                        <i style={{ width: `${(s.total / max) * 100}%` }}>
                          <b style={{ width: `${s.total ? (s.reg / s.total) * 100 : 0}%` }} />
                        </i>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!porSemana.length && <div className="gmEmpty">Sin revisiones.</div>}
        </div>
        {sinFecha > 0 && (
          <span className="gmSub">
            {sinFecha} {sinFecha === 1 ? "fila sin fecha legible queda" : "filas sin fecha legible quedan"} fuera.
          </span>
        )}
      </section>

      <div className="elpGrid elpGrid3">
        {breakdowns.map(([title, campo]) => (
          <Breakdown
            key={campo}
            title={title}
            rows={countBy(regresos, (i) => keysOf(i, campo))}
            total={regresos.length}
            campo={campo}
            zoom={zoom}
            onZoom={setZoom}
          />
        ))}
      </div>

      <RegresosTable
        zoom={zoom}
        onClear={() => setZoom(null)}
        rows={lista.map((i, n) => ({
          key: `${i.fecha}-${i.cliente}-${n}`,
          cliente: i.cliente,
          semana: weekLabel(i.semana).short,
          tipo: [i.notice, i.caseType, i.subtipo].filter(Boolean).join(" · "),
          fecha: i.fecha,
          correctionType: i.correctionType,
          homologada: i.homologada.join(", "),
          equipo: [i.equipo, i.tl, i.colaborador].filter(Boolean).join(" · "),
        }))}
        semanaLabel="Revisión"
      />
    </>
  );
}

type RegresoRow = {
  key: string;
  cliente: string;
  semana: string;
  tipo: string;
  fecha: string | null;
  correctionType: string;
  homologada: string;
  equipo: string;
};

function RegresosTable({
  rows,
  zoom,
  onClear,
  semanaLabel,
}: {
  rows: RegresoRow[];
  zoom: Zoom;
  onClear: () => void;
  semanaLabel: string;
}) {
  return (
    <section className="gmTableCard">
      <div className="elpListHead">
        <h3>Regresos ({rows.length})</h3>
        {zoom && (
          <button className="elpClear" onClick={onClear}>
            {zoom.valor} ✕
          </button>
        )}
      </div>
      <div className="gmTableWrap">
        <table className="gmTable">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Sem. {semanaLabel}</th>
              <th>Fecha revisión</th>
              <th>Correction Type</th>
              <th>Corrección homologada</th>
              <th>Equipo / responsable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <strong>{r.cliente}</strong>
                  <div className="gmSub">{r.tipo}</div>
                </td>
                <td>{r.semana}</td>
                <td>{fmtDate(r.fecha)}</td>
                <td className="elpCorrection">{r.correctionType || <span className="gmMuted">—</span>}</td>
                <td>{r.homologada || <span className="gmMuted">{SIN}</span>}</td>
                <td>{r.equipo || <span className="gmMuted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="gmEmpty">Sin regresos con estos filtros.</div>}
      </div>
    </section>
  );
}
