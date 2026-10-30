"use client";

import { useEffect, useMemo, useState } from "react";
import type { Comm, CommsVista } from "@/lib/comms";

/*
 * Comunicaciones de la célula: la pestaña que llena todo el
 * equipo. Colaborador y posición salen del login; cada registro
 * cae en la siguiente fila libre de la Sheet.
 */

type Data = {
  comms: Comm[];
  options: { medio: string[]; status: string[]; type: string[]; documento: string[] };
  me: string;
  position: string;
  canWrite: boolean;
};

type Periodo = "semana" | "pasada" | "mes" | "todo";

const LABELS: Record<CommsVista, string> = { alpha: "Alpha", gamma: "Gamma", gmc: "GMC" };

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));

function fmt(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const [y, m, d] = s.split("-").map(Number);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${d} ${months[m - 1]} ${String(y).slice(2)}`;
}

export default function Comunicaciones({
  vista,
  clientes = [],
}: {
  vista: CommsVista;
  clientes?: string[];
}) {
  const isGmc = vista === "gmc";
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false);

  const [colab, setColab] = useState("todos");
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [resultado, setResultado] = useState("todos");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/comms?vista=${vista}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudieron cargar las comunicaciones");
      setData(json);
      setColab((c) =>
        c === "todos" && json.comms.some((x: Comm) => x.colaborador === json.me) ? json.me : c
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [vista]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const comms = data?.comms || [];
  const colabs = useMemo(() => [...new Set(comms.map((c) => c.colaborador).filter(Boolean))].sort(), [comms]);

  const today = new Date();
  const ranges: Record<Periodo, [string, string]> = {
    semana: [iso(mondayOf(today)), iso(addDays(mondayOf(today), 6))],
    pasada: [iso(addDays(mondayOf(today), -7)), iso(addDays(mondayOf(today), -1))],
    mes: [iso(new Date(today.getFullYear(), today.getMonth(), 1)), iso(new Date(today.getFullYear(), today.getMonth() + 1, 0))],
    todo: ["0000-00-00", "9999-99-99"],
  };
  const [from, to] = ranges[periodo];
  const resultOf = (c: Comm) => (isGmc ? c.type : c.status).toUpperCase();

  const base = comms.filter((c) => {
    const q = query.trim().toLowerCase();
    return (
      (colab === "todos" || c.colaborador === colab) &&
      c.fecha >= from &&
      c.fecha <= to &&
      (!q || `${c.cliente} ${c.notas} ${c.documento}`.toLowerCase().includes(q))
    );
  });
  const rows = base
    .filter((c) => resultado === "todos" || resultOf(c) === resultado)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.row - a.row);

  const resultOptions = isGmc ? data?.options.type || [] : data?.options.status || [];
  const clientesContactados = new Set(base.map((c) => c.cliente.toUpperCase())).size;

  return (
    <div className="rgPage cmPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">COMUNICACIONES · {LABELS[vista].toUpperCase()}</p>
          <h1>Comunicaciones</h1>
          <p>La pestaña de comunicaciones de la célula. Lo que registres aquí se agrega a la Sheet.</p>
        </div>

        <div className="cmHeaderActions">
          <button className="refreshButton" onClick={load}>
            ↻ Refresh
          </button>
          {data?.canWrite && (
            <button className="rgBtn rgBtnPrimary" onClick={() => setOpen(true)}>
              + Registrar comunicación
            </button>
          )}
        </div>
      </header>

      {error && <div className="errorBanner">{error}</div>}
      {notice && <div className="gmNotice">✓ {notice}</div>}

      {loading && !data ? (
        <div className="loadingCard">Cargando comunicaciones…</div>
      ) : (
        data && (
          <>
            <div className="gmKpis cmKpis">
              <div>
                <span>Comunicaciones</span>
                <strong>{base.length}</strong>
                <small>en el periodo</small>
              </div>
              <div>
                <span>Clientes contactados</span>
                <strong>{clientesContactados}</strong>
              </div>
              {resultOptions.slice(0, 2).map((r) => (
                <div key={r} className={/NO EFECTIVA/.test(r) ? "gmKpiAlert" : ""}>
                  <span>{r.charAt(0) + r.slice(1).toLowerCase()}</span>
                  <strong>{base.filter((c) => resultOf(c) === r).length}</strong>
                </div>
              ))}
            </div>

            <div className="gmFilters cmFilters">
              <select value={colab} onChange={(e) => setColab(e.target.value)} aria-label="Colaborador">
                <option value="todos">Todo el equipo</option>
                {colabs.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Periodo">
                <option value="semana">Esta semana</option>
                <option value="pasada">Semana pasada</option>
                <option value="mes">Este mes</option>
                <option value="todo">Últimos 4 meses</option>
              </select>
              <select value={resultado} onChange={(e) => setResultado(e.target.value)} aria-label={isGmc ? "Type" : "Status"}>
                <option value="todos">{isGmc ? "Received y requested" : "Cualquier status"}</option>
                {resultOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <input
                className="gmSearch"
                value={query}
                placeholder="Buscar cliente, nota, documento…"
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="rsCount">{rows.length} registros</span>
            </div>

            <section className="gmTableCard">
              <div className="gmTableWrap">
                <table className="gmTable">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cliente</th>
                      <th>Colaborador</th>
                      <th>Medio</th>
                      <th>{isGmc ? "Type" : "Status"}</th>
                      <th>{isGmc ? "Cantidad" : "Min"}</th>
                      <th>Tramcase</th>
                      <th>Documento / info</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.row}>
                        <td>{fmt(c.fecha)}</td>
                        <td>
                          <strong>{c.cliente || "—"}</strong>
                        </td>
                        <td>
                          {c.colaborador}
                          {c.posicion && <div className="gmSub">{c.posicion}</div>}
                        </td>
                        <td className="cmMedio">{c.medio || "—"}</td>
                        <td>
                          <span className={/NO EFECTIVA/i.test(c.status) ? "gmLateText" : ""}>
                            {(isGmc ? c.type : c.status) || "—"}
                          </span>
                        </td>
                        <td>{(isGmc ? c.cantidad : c.duracion) || "—"}</td>
                        <td className="cmFlags">
                          {c.mensajeTramcase && <span>Mensaje</span>}
                          {c.notaTramcase && <span>Nota</span>}
                          {!c.mensajeTramcase && !c.notaTramcase && <span className="gmMuted">—</span>}
                        </td>
                        <td>
                          {c.documento || "—"}
                          {c.link.startsWith("http") && (
                            <div>
                              <a href={c.link} target="_blank" rel="noreferrer">
                                Captura ↗
                              </a>
                            </div>
                          )}
                        </td>
                        <td className="rsNota">{c.notas || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && <div className="gmEmpty">No hay comunicaciones con estos filtros.</div>}
              </div>
            </section>

            {open && (
              <CommForm
                vista={vista}
                data={data}
                clientes={[...new Set([...clientes, ...comms.map((c) => c.cliente)])].filter(Boolean).sort()}
                onCancel={() => setOpen(false)}
                onSaved={(another) => {
                  setNotice("Comunicación registrada en la Sheet");
                  if (!another) setOpen(false);
                  load();
                }}
              />
            )}
          </>
        )
      )}
    </div>
  );
}

function CommForm({
  vista,
  data,
  clientes,
  onCancel,
  onSaved,
}: {
  vista: CommsVista;
  data: Data;
  clientes: string[];
  onCancel: () => void;
  onSaved: (another: boolean) => void;
}) {
  const isGmc = vista === "gmc";
  const blank = {
    cliente: "",
    fecha: iso(new Date()),
    duracion: "",
    cantidad: "",
    medio: [] as string[],
    status: "",
    type: "",
    mensajeTramcase: false,
    notaTramcase: false,
    documento: "",
    link: "",
    notas: "",
  };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(another: boolean) {
    setErr("");
    if (!f.cliente.trim()) return setErr("Escribe el cliente");
    if (!f.medio.length) return setErr("Elige el medio");
    if (isGmc ? !f.type : !f.status) return setErr(isGmc ? "Elige Received o Requested" : "Elige el status");
    setSaving(true);
    try {
      const res = await fetch("/api/comms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vista, ...f, medio: f.medio.join(", ") }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo registrar");
      onSaved(another);
      if (another) setF({ ...blank, fecha: f.fecha });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setSaving(false);
    }
  }

  const chips = (values: string[], selected: string[], toggle: (v: string) => void) => (
    <div className="rgChips">
      {values.map((v) => (
        <button
          type="button"
          key={v}
          className={selected.includes(v) ? "active" : ""}
          aria-pressed={selected.includes(v)}
          onClick={() => toggle(v)}
        >
          {v}
        </button>
      ))}
    </div>
  );

  return (
    <div className="modalOverlay rgOverlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="rgForm"
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
      >
        <div className="rgFormHead">
          <h2>Registrar comunicación</h2>
          <button type="button" className="rgClose" onClick={onCancel} aria-label="Cerrar">
            ×
          </button>
        </div>

        <p className="cmWho">
          Se registra como <strong>{data.me}</strong>
          {!isGmc && data.position && <> · {data.position}</>}
        </p>

        <div className="rgRow">
          <label className="rgField">
            <span>Cliente</span>
            <input
              list="cm-clientes"
              value={f.cliente}
              placeholder="Nombre del cliente"
              onChange={(e) => set("cliente", e.target.value)}
            />
            <datalist id="cm-clientes">
              {clientes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="rgField rgFieldNarrow">
            <span>Fecha</span>
            <input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} />
          </label>
          <label className="rgField rgFieldNarrow">
            <span>{isGmc ? "Cantidad" : "Duración (min)"}</span>
            <input
              inputMode="numeric"
              value={isGmc ? f.cantidad : f.duracion}
              onChange={(e) => set(isGmc ? "cantidad" : "duracion", e.target.value.replace(/\D/g, ""))}
            />
          </label>
        </div>

        <div className="rgField">
          <span>Medio (puedes elegir varios)</span>
          {chips(data.options.medio, f.medio, (v) =>
            set("medio", f.medio.includes(v) ? f.medio.filter((x) => x !== v) : [...f.medio, v])
          )}
        </div>

        <div className="rgField">
          <span>{isGmc ? "Type" : "Status"}</span>
          {chips(isGmc ? data.options.type : data.options.status, [isGmc ? f.type : f.status], (v) =>
            set(isGmc ? "type" : "status", v)
          )}
        </div>

        <div className="rgRow cmChecks">
          <label>
            <input type="checkbox" checked={f.mensajeTramcase} onChange={(e) => set("mensajeTramcase", e.target.checked)} />
            Mensaje en Tramcase
          </label>
          <label>
            <input type="checkbox" checked={f.notaTramcase} onChange={(e) => set("notaTramcase", e.target.checked)} />
            Nota en Tramcase
          </label>
        </div>

        <div className="rgRow">
          <label className="rgField">
            <span>Documento / info obtenida</span>
            <input list="cm-docs" value={f.documento} onChange={(e) => set("documento", e.target.value)} />
            <datalist id="cm-docs">
              {data.options.documento.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          {!isGmc && (
            <label className="rgField">
              <span>Link de captura (Drive)</span>
              <input value={f.link} placeholder="https://…" onChange={(e) => set("link", e.target.value)} />
            </label>
          )}
        </div>

        <label className="rgField">
          <span>Notas</span>
          <textarea rows={3} value={f.notas} onChange={(e) => set("notas", e.target.value)} />
        </label>

        {err && <div className="errorBanner rgFormError">{err}</div>}

        <div className="rgFormActions">
          <button type="button" className="rgBtn rgBtnGhost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="rgBtn rgBtnGhost" disabled={saving} onClick={() => submit(true)}>
            Guardar y registrar otra
          </button>
          <button type="submit" className="rgBtn rgBtnPrimary" disabled={saving}>
            {saving ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
