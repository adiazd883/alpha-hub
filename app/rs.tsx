"use client";

import { useEffect, useMemo, useState } from "react";
import type { Celula } from "@/lib/celulas";
import type { RsCase } from "@/lib/rs";

/*
 * Rap Sheet (pestaña RS): quién debe entregar su Rap Sheet antes
 * de la fecha límite. Solo lectura; se actualiza en la Sheet.
 */

type Estado = "pendientes" | "recibidas" | "todas";

const received = (c: RsCase) => !!(c.recibida || c.linkRs);

function fmtDeadline(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[m - 1]} ${y}`;
}

function daysLeft(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400000);
}

export default function RapSheet({ celula }: { celula: Celula }) {
  const [data, setData] = useState<{ deadline: string; cases: RsCase[]; me: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [colab, setColab] = useState("todos");
  const [estado, setEstado] = useState<Estado>("pendientes");
  const [contacto, setContacto] = useState("todos");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/rs?celula=${celula}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar la lista de RS");
      setData(json);
      // Si la persona está en la lista, abre con sus casos.
      if (json.me && json.cases.some((c: RsCase) => c.colaborador === json.me)) {
        setColab(json.me);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [celula]);

  const cases = data?.cases || [];
  const colabs = useMemo(
    () => [...new Set(cases.map((c) => c.colaborador || "SIN ASIGNAR"))].sort(),
    [cases]
  );
  const contactos = useMemo(
    () => [...new Set(cases.map((c) => c.contacto).filter(Boolean))].sort(),
    [cases]
  );

  // Los indicadores respetan colaborador y búsqueda, no el estado.
  const base = cases.filter((c) => {
    const q = query.trim().toLowerCase();
    return (
      (colab === "todos" || (c.colaborador || "SIN ASIGNAR") === colab) &&
      (contacto === "todos" || c.contacto === contacto) &&
      (!q || `${c.cliente} ${c.clienteId} ${c.nota}`.toLowerCase().includes(q))
    );
  });
  const rows = base.filter(
    (c) => estado === "todas" || (estado === "recibidas") === received(c)
  );

  const recibidas = base.filter(received).length;
  const pendientes = base.length - recibidas;
  const unresponsive = base.filter((c) => !received(c) && c.contacto === "UNRESPONSIVE").length;
  const conCita = base.filter((c) => !received(c) && /AGENDADA/i.test(c.estatusCita)).length;
  const left = data ? daysLeft(data.deadline) : 0;

  return (
    <>
      <header className="pageHeader">
        <div>
          <p className="eyebrow">RAP SHEET</p>
          <h1>Clientes con RS</h1>
          <p>Pestaña RS: clientes que deben entregar su Rap Sheet. Se actualiza en la Sheet.</p>
        </div>

        <button className="refreshButton" onClick={load}>
          ↻ Refresh
        </button>
      </header>

      {error && <div className="errorBanner">{error}</div>}

      {loading && !data ? (
        <div className="loadingCard">Cargando lista de RS…</div>
      ) : (
        data && (
          <>
            <div className={`rsDeadline ${left <= 7 ? "rsDeadlineSoon" : ""}`}>
              <strong>Fecha límite: {fmtDeadline(data.deadline)}</strong>
              <span>
                {left > 0
                  ? `faltan ${left} ${left === 1 ? "día" : "días"}`
                  : left === 0
                    ? "es hoy"
                    : `venció hace ${-left} días`}{" "}
                · {pendientes} pendientes
              </span>
            </div>

            <div className="gmKpis rsKpis">
              <div>
                <span>Clientes con RS</span>
                <strong>{base.length}</strong>
              </div>
              <div>
                <span>RS recibidas</span>
                <strong>{recibidas}</strong>
                <small>con fecha o link de RS</small>
              </div>
              <div className={pendientes ? "gmKpiAlert" : ""}>
                <span>Pendientes</span>
                <strong>{pendientes}</strong>
              </div>
              <div>
                <span>Con cita agendada</span>
                <strong>{conCita}</strong>
                <small>pendientes</small>
              </div>
              <div>
                <span>Unresponsive</span>
                <strong>{unresponsive}</strong>
                <small>pendientes</small>
              </div>
            </div>

            <div className="gmFilters rsFilters">
              <select value={colab} onChange={(e) => setColab(e.target.value)} aria-label="Colaborador">
                <option value="todos">Todos los colaboradores</option>
                {colabs.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)} aria-label="Estado">
                <option value="pendientes">Pendientes</option>
                <option value="recibidas">Recibidas</option>
                <option value="todas">Todas</option>
              </select>
              <select value={contacto} onChange={(e) => setContacto(e.target.value)} aria-label="Contacto">
                <option value="todos">Cualquier contacto</option>
                {contactos.map((c) => (
                  <option key={c} value={c}>
                    Contacto: {c}
                  </option>
                ))}
              </select>
              <input
                className="gmSearch"
                value={query}
                placeholder="Buscar cliente, ID, nota…"
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="rsCount">{rows.length} clientes</span>
            </div>

            <section className="gmTableCard">
              <div className="gmTableWrap">
                <table className="gmTable">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Colaborador</th>
                      <th>Contacto</th>
                      <th>Identificación</th>
                      <th>Último contacto</th>
                      <th>Cita</th>
                      <th>Acudió</th>
                      <th>Proveedor</th>
                      <th>RS</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.row} className={received(c) ? "gmDone" : ""}>
                        <td>
                          <strong>{c.cliente}</strong>
                          <div className="gmSub">{c.clienteId && `ID ${c.clienteId}`}</div>
                        </td>
                        <td>{c.colaborador || <span className="gmMuted">Sin asignar</span>}</td>
                        <td>
                          <span className={c.contacto === "UNRESPONSIVE" ? "gmLateText" : ""}>
                            {c.contacto || "—"}
                          </span>
                        </td>
                        <td>{c.identificacion || "—"}</td>
                        <td>{c.ultimoContacto || "—"}</td>
                        <td>
                          {c.estatusCita || "—"}
                          {c.fechaCita && <div className="gmSub">{c.fechaCita}</div>}
                        </td>
                        <td>{c.acudio || "—"}</td>
                        <td>
                          {c.proveedor.startsWith("http") ? (
                            <a href={c.proveedor} target="_blank" rel="noreferrer">
                              Ver
                            </a>
                          ) : (
                            c.proveedor || "—"
                          )}
                        </td>
                        <td>
                          {received(c) ? (
                            <>
                              <span className="rsOk">✓ {c.recibida || "Recibida"}</span>
                              {c.linkRs.startsWith("http") && (
                                <div>
                                  <a href={c.linkRs} target="_blank" rel="noreferrer">
                                    Abrir RS
                                  </a>
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="gmMuted">Pendiente</span>
                          )}
                        </td>
                        <td className="rsNota">{c.nota || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && <div className="gmEmpty">No hay clientes con estos filtros.</div>}
              </div>
            </section>
          </>
        )
      )}
    </>
  );
}
