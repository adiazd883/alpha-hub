"use client";

import { useEffect, useMemo, useState } from "react";
import type { Celula } from "@/lib/celulas";
import type { RsCase, RsField, RsOptions } from "@/lib/rs";

/*
 * Rap Sheet (pestaña RS): quién debe entregar su Rap Sheet antes
 * de la fecha límite. Cada dato se edita aquí y se guarda en la
 * Sheet; los desplegables usan las mismas opciones que la Sheet.
 */

type Estado = "pendientes" | "recibidas" | "todas";

const received = (c: RsCase) => !!(c.recibida || c.linkRs);

const isIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function fmtDate(v: string) {
  if (!isIso(v)) return v || "—";
  const [y, m, d] = v.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[m - 1]} ${String(y).slice(2)}`;
}

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
  const [data, setData] = useState<{
    deadline: string;
    cases: RsCase[];
    options: RsOptions;
    canEdit: boolean;
    me: string;
  } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
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

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  async function save(c: RsCase, field: RsField, value: string) {
    if ((c[field] || "") === value) return;
    setSaving(`${c.row}:${field}`);
    setError("");
    try {
      const res = await fetch("/api/rs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ celula, row: c.row, cliente: c.cliente, field, value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo guardar");
      setData((prev) =>
        prev && { ...prev, cases: prev.cases.map((x) => (x.row === c.row ? json.item : x)) }
      );
      setNotice("Guardado en la Sheet");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

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
      {notice && <div className="gmNotice">✓ {notice}</div>}

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
                      <th>Estatus cita</th>
                      <th>Fecha cita</th>
                      <th>Acudió</th>
                      <th>Con proveedor</th>
                      <th>RS recibida</th>
                      <th>Link RS</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => {
                      const edit = data.canEdit;
                      const busy = (f: RsField) => saving === `${c.row}:${f}`;
                      const list = (f: RsField) =>
                        edit ? (
                          <ListCell
                            value={c[f]}
                            options={data.options[f] || []}
                            busy={busy(f)}
                            onSave={(v) => save(c, f, v)}
                            warn={f === "contacto" && c[f] === "UNRESPONSIVE"}
                          />
                        ) : (
                          c[f] || "—"
                        );
                      const date = (f: RsField) =>
                        edit ? (
                          <DateCell value={c[f]} busy={busy(f)} onSave={(v) => save(c, f, v)} />
                        ) : (
                          fmtDate(c[f])
                        );
                      const textCell = (f: RsField, placeholder: string, wide = false) =>
                        edit ? (
                          <TextCell
                            value={c[f]}
                            placeholder={placeholder}
                            wide={wide}
                            busy={busy(f)}
                            onSave={(v) => save(c, f, v)}
                          />
                        ) : c[f].startsWith("http") ? (
                          <a href={c[f]} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        ) : (
                          c[f] || "—"
                        );

                      return (
                        <tr key={c.row} className={received(c) ? "rsRowDone" : ""}>
                          <td>
                            <strong>{c.cliente}</strong>
                            <div className="gmSub">{c.clienteId && `ID ${c.clienteId}`}</div>
                            {received(c) && <span className="rsOk">✓ RS recibida</span>}
                          </td>
                          <td>{c.colaborador || <span className="gmMuted">Sin asignar</span>}</td>
                          <td>{list("contacto")}</td>
                          <td>{list("identificacion")}</td>
                          <td>{date("ultimoContacto")}</td>
                          <td>{list("estatusCita")}</td>
                          <td>{date("fechaCita")}</td>
                          <td>{list("acudio")}</td>
                          <td>{textCell("proveedor", "Link o nota")}</td>
                          <td>{date("recibida")}</td>
                          <td>{textCell("linkRs", "https://…")}</td>
                          <td className="rsNota">{textCell("nota", "Nota", true)}</td>
                        </tr>
                      );
                    })}
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

// Desplegable con las opciones de la Sheet; guarda al elegir.
function ListCell({
  value,
  options,
  busy,
  warn,
  onSave,
}: {
  value: string;
  options: string[];
  busy: boolean;
  warn?: boolean;
  onSave: (v: string) => void;
}) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <select
      className={`rsInput ${warn ? "rsWarn" : ""}`}
      value={value}
      disabled={busy}
      onChange={(e) => onSave(e.target.value)}
    >
      <option value="">—</option>
      {all.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// Fecha: si en la Sheet hay texto que no es fecha, se muestra abajo.
function DateCell({
  value,
  busy,
  onSave,
}: {
  value: string;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const iso = isIso(value) ? value : "";
  return (
    <>
      <input
        type="date"
        className="rsInput"
        value={iso}
        disabled={busy}
        onChange={(e) => onSave(e.target.value)}
      />
      {value && !iso && <div className="gmSub">{value}</div>}
    </>
  );
}

// Texto o link: se guarda al salir del campo o con Enter.
function TextCell({
  value,
  placeholder,
  wide,
  busy,
  onSave,
}: {
  value: string;
  placeholder: string;
  wide?: boolean;
  busy: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="gmLink">
      {wide ? (
        <textarea
          className="rsInput rsNotaInput"
          rows={2}
          value={draft}
          placeholder={placeholder}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== value && onSave(draft.trim())}
        />
      ) : (
        <input
          className="rsInput"
          value={draft}
          placeholder={placeholder}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== value && onSave(draft.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
      {value.startsWith("http") && (
        <a href={value} target="_blank" rel="noreferrer" aria-label="Abrir link">
          ↗
        </a>
      )}
    </div>
  );
}
