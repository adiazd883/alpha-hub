"use client";

import { useMemo, useState } from "react";
import data from "@/lib/reporte-tiempos.json";

/*
 * Reporte "Estudio de tiempos por cliente" (histórico mayo–octubre
 * 2026, Alpha y Gamma). Es una vista estática del estudio ya hecho;
 * los datos viven en lib/reporte-tiempos.json.
 */

type Act = {
  act: string;
  otras?: boolean;
  clientesPct?: number;
  horas?: number;
  rango?: [number, number] | null;
  sesiones?: number;
  durMin?: number;
  pct: number;
};

const num = (s: string | number | null | undefined) =>
  typeof s === "number" ? s : parseFloat(String(s ?? "").replace(",", ".")) || 0;

type Entrega = {
  kpi: string;
  horas: number;
  actividades: { act: string; horas: number; sesiones?: number }[];
};
type ClienteDetalle = {
  areas: {
    area: string;
    horas: number;
    actividades: { act: string; horas: number; sesiones: number }[];
    entregas?: Entrega[];
  }[];
  dias: number;
  registros: number;
};
const DETALLE = data.detalle as Record<string, ClienteDetalle>;
const PL_ENTREGAS = (data as unknown as { paralegalEntregas?: Entrega[] }).paralegalEntregas;

// Vista "Tiempo por entrega": KPIs de paralegales (Draft, Ensamble
// para CVL, MGM review) con sus actividades homologadas.
function EntregasCard({ entregas, color, detalle }: { entregas: Entrega[]; color: string; detalle?: boolean }) {
  return (
    <div className="repEntregas">
      <div className="repEntHead">
        <span>Tiempo por entrega</span>
        <span>Horas</span>
      </div>
      {entregas.map((e) => (
        <div key={e.kpi} className="repEntGroup">
          <div className="repEntKpi">
            <span className="repDot" style={{ background: color }} />
            <strong>{e.kpi}</strong>
            <em>{e.horas} h</em>
          </div>
          {e.actividades.map((a) => (
            <div key={a.act} className="repEntAct">
              <span>{a.act}</span>
              <span>
                {a.horas} h
                {detalle && a.sesiones != null ? ` · ${a.sesiones} ses.` : ""}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Paleta minimalista: una sola familia pizarra, de oscuro a claro.
const AREA_COLOR: Record<string, string> = {
  Paralegales: "#334155",
  Psicólogos: "#64748b",
  "Analistas de evidencia": "#aab4c4",
};

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="repTile">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SubareaSplit() {
  const partes = data.subareas.filter((s) => s.sub !== "Total por cliente");
  return (
    <div className="repSplitBar" role="img" aria-label="Reparto del tiempo por subárea">
      {partes.map((s) => {
        const pct = num(s.pct);
        return (
          <span
            key={s.sub}
            style={{ width: `${pct}%`, background: AREA_COLOR[s.sub] || "#9aa4b5" }}
            title={`${s.sub}: ${s.pct}`}
          />
        );
      })}
    </div>
  );
}

function AreaCard({ area }: { area: (typeof data.areas)[number] }) {
  const color = AREA_COLOR[area.nombre] || "#6b7fd7";
  const acts = area.actividades as Act[];
  const maxPct = Math.max(...acts.map((a) => a.pct || 0), 1);
  const etapas = "etapas" in area ? area.etapas : null;
  const entregables = "entregables" in area ? area.entregables : null;

  return (
    <section className="repArea">
      <h3>
        <span className="repDot" style={{ background: color }} />
        {area.nombre}
      </h3>

      <div className="repTiles repTiles4">
        <StatTile value={area.kpis.horas} label="Horas prom. por cliente" />
        <StatTile value={area.kpis.rango} label="Rango aproximado" />
        <StatTile value={`${area.kpis.dias} días`} label="Días diferentes por cliente" />
        <StatTile value={area.kpis.sesiones} label="Sesiones por cliente" />
      </div>

      {area.nombre === "Paralegales" && PL_ENTREGAS ? (
        <EntregasCard entregas={PL_ENTREGAS} color={color} />
      ) : (
        <div className="repActTable">
          <div className="repActHead">
            <span>Actividad</span>
            <span>% del tiempo del área</span>
            <span className="repColNum">Clientes</span>
            <span className="repColNum">Horas</span>
            <span className="repColNum">Sesiones</span>
            <span className="repColNum">Min/ses.</span>
          </div>
          {acts.map((a) => (
            <div key={a.act} className={`repActRow ${a.otras ? "repActOtras" : ""}`}>
              <span className="repActName">{a.act}</span>
              <span className="repBarCell">
                <span className="repBarTrack">
                  <span
                    className="repBarFill"
                    style={{ width: `${((a.pct || 0) / maxPct) * 100}%`, background: color }}
                  />
                </span>
                <em>{a.pct}%</em>
              </span>
              <span className="repColNum">{a.otras ? "—" : `${a.clientesPct}%`}</span>
              <span className="repColNum">
                {a.otras ? "—" : <>{a.horas} h{a.rango && <small> · {a.rango[0]}–{a.rango[1]}</small>}</>}
              </span>
              <span className="repColNum">{a.otras ? "—" : a.sesiones}</span>
              <span className="repColNum">{a.otras ? "—" : `${a.durMin} min`}</span>
            </div>
          ))}
        </div>
      )}

      {etapas && entregables && (
        <div className="repExtra">
          <div>
            <h4>Entrega vs post-entrega</h4>
            <table className="repMini">
              <thead>
                <tr><th>Etapa</th><th>Horas</th><th>Rango</th><th>% analista</th><th>Clientes</th></tr>
              </thead>
              <tbody>
                {etapas.map((e) => (
                  <tr key={e.etapa} className={e.etapa.startsWith("Total") ? "repMiniTotal" : ""}>
                    <td>{e.etapa}</td><td>{e.horas}</td><td>{e.rango}</td><td>{e.pct}</td><td>{e.clientes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h4>Entregable (DCL / CVL)</h4>
            <table className="repMini">
              <thead>
                <tr><th>Entregable</th><th>Clientes</th><th>% muestra</th><th>Horas</th><th>Rango</th><th>Días</th></tr>
              </thead>
              <tbody>
                {entregables.map((e) => (
                  <tr key={e.entregable}>
                    <td>{e.entregable}</td><td>{e.clientes}</td><td>{e.pctMuestra}</td><td>{e.horas}</td><td>{e.rango}</td><td>{e.dias}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

type Orden = "n" | "total" | "dias";

function ClienteDetalleModal({ n, onClose }: { n: number; onClose: () => void }) {
  const cli = data.clientes.find((c) => c.n === n);
  const det = DETALLE[String(n)];
  if (!cli || !det) return null;
  return (
    <div className="repModalBack" onClick={onClose}>
      <section className="repModal" role="dialog" aria-label={cli.cliente} onClick={(e) => e.stopPropagation()}>
        <header className="repModalHead">
          <div>
            <p className="eyebrow">{cli.equipo}</p>
            <h3>{cli.cliente}</h3>
            <span>
              Total {cli.total} h · {det.dias} días · {det.registros} registros · PL {cli.pl} · PS {cli.ps} · AN {cli.an} h
            </span>
          </div>
          <button className="rgBtn rgBtnGhost" onClick={onClose}>Cerrar</button>
        </header>
        <div className="repModalBody">
          {det.areas.map((a) => (
            <div key={a.area} className="repModalArea">
              <h4>
                <span className="repDot" style={{ background: AREA_COLOR[a.area] || "#9aa4b5" }} />
                {a.area}<em>{a.horas} h</em>
              </h4>
              {a.entregas ? (
                <EntregasCard entregas={a.entregas} color={AREA_COLOR[a.area] || "#9aa4b5"} detalle />
              ) : (
              <div className="repModalActs">
                {a.actividades.map((ac) => {
                  const maxH = Math.max(...a.actividades.map((x) => x.horas), 0.1);
                  return (
                    <div key={ac.act} className="repModalAct">
                      <span className="repModalActName">{ac.act}</span>
                      <span className="repBarTrack">
                        <span className="repBarFill" style={{ width: `${(ac.horas / maxH) * 100}%`, background: AREA_COLOR[a.area] }} />
                      </span>
                      <span className="repModalActNum">{ac.horas} h · {ac.sesiones} ses.</span>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TablaClientes() {
  const [orden, setOrden] = useState<Orden>("total");
  const [equipo, setEquipo] = useState<"todos" | "Alpha" | "Gamma">("todos");
  const [sel, setSel] = useState<number | null>(null);

  const rows = useMemo(() => {
    const base = data.clientes.filter((c) => equipo === "todos" || c.equipo === equipo);
    const s = [...base];
    if (orden === "total") s.sort((a, b) => num(b.total) - num(a.total));
    else if (orden === "dias") s.sort((a, b) => num(b.dias) - num(a.dias));
    else s.sort((a, b) => a.n - b.n);
    return s;
  }, [orden, equipo]);

  const maxTotal = Math.max(...data.clientes.map((c) => num(c.total)), 1);

  return (
    <section className="repClientes">
      {sel !== null && <ClienteDetalleModal n={sel} onClose={() => setSel(null)} />}
      <div className="repClientesTop">
        <div>
          <h3>Detalle por cliente ({data.clientes.length})</h3>
          <p className="repHint">Doble clic en un cliente para ver su desglose de actividades.</p>
        </div>
        <div className="repClientesCtrl">
          <select value={equipo} onChange={(e) => setEquipo(e.target.value as typeof equipo)}>
            <option value="todos">Ambos equipos</option>
            <option value="Alpha">Alpha</option>
            <option value="Gamma">Gamma</option>
          </select>
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            <option value="total">Ordenar por total</option>
            <option value="dias">Ordenar por días</option>
            <option value="n">Orden original</option>
          </select>
        </div>
      </div>

      <div className="repCliHead">
        <span>Cliente</span>
        <span className="repColNum">Equipo</span>
        <span>Reparto PL · PS · AN</span>
        <span className="repColNum">Total</span>
        <span className="repColNum">Días</span>
      </div>
      <div className="repCliBody">
        {rows.map((c) => {
          const pl = num(c.pl), ps = num(c.ps), an = num(c.an), tot = num(c.total) || 1;
          return (
            <div
              key={c.n}
              className="repCliRow repCliClickable"
              onDoubleClick={() => setSel(c.n)}
              title="Doble clic para ver el detalle del cliente"
            >
              <span className="repCliName" title={c.cliente}>{c.cliente}</span>
              <span className="repColNum repCliTeam">{c.equipo}</span>
              <span className="repCliBar" title={`PL ${c.pl} · PS ${c.ps} · AN ${c.an} h`}>
                <span className="repStack" style={{ width: `${(tot / maxTotal) * 100}%` }}>
                  <span style={{ width: `${(pl / tot) * 100}%`, background: AREA_COLOR["Paralegales"] }} />
                  <span style={{ width: `${(ps / tot) * 100}%`, background: AREA_COLOR["Psicólogos"] }} />
                  <span style={{ width: `${(an / tot) * 100}%`, background: AREA_COLOR["Analistas de evidencia"] }} />
                </span>
              </span>
              <span className="repColNum"><strong>{c.total}</strong></span>
              <span className="repColNum">{c.dias}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ReporteTiempos() {
  return (
    <div className="repPage">
      <header className="repHeader">
        <p className="eyebrow">ESTUDIO DE TIEMPOS · HISTÓRICO</p>
        <h1>{data.titulo}</h1>
        <p className="repSub">{data.subtitulo}</p>
        <p className="repMuestra">{data.muestra}</p>
      </header>

      <section className="repBlock">
        <h2>1. Tiempo total invertido por cliente</h2>
        <div className="repTiles repTiles4">
          <StatTile value={data.total.horas} label="Tiempo promedio por cliente (todas las áreas)" />
          <StatTile value={data.total.rango} label="Rango aproximado (mitad central)" />
          <StatTile value={data.total.dias} label="Días diferentes con trabajo" />
          <StatTile value={data.total.diasCalendario} label="Del primer al último registro" />
        </div>
      </section>

      <section className="repBlock">
        <h2>2. Reparto por subárea</h2>
        <SubareaSplit />
        <div className="repLeyenda">
          {data.subareas.filter((s) => s.sub !== "Total por cliente").map((s) => (
            <span key={s.sub}><i style={{ background: AREA_COLOR[s.sub] }} />{s.sub} · {s.horas} ({s.pct})</span>
          ))}
        </div>
        <div className="repSubTable">
          <div className="repSubHead">
            <span>Subárea</span><span className="repColNum">Horas</span><span className="repColNum">Rango</span>
            <span className="repColNum">% cliente</span><span className="repColNum">Días</span><span className="repColNum">h/día</span>
          </div>
          {data.subareas.map((s) => (
            <div key={s.sub} className={`repSubRow ${s.sub.startsWith("Total") ? "repSubTotal" : ""}`}>
              <span>{s.sub}</span><span className="repColNum">{s.horas}</span><span className="repColNum">{s.rango}</span>
              <span className="repColNum">{s.pct}</span><span className="repColNum">{s.dias}</span><span className="repColNum">{s.horasDia}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="repBlock">
        <h2>3. Desglose por área</h2>
        {data.areas.map((a) => <AreaCard key={a.nombre} area={a} />)}
      </section>

      <section className="repBlock">
        <h2>4. Detalle por cliente</h2>
        <TablaClientes />
      </section>
    </div>
  );
}
