"use client";

import { useEffect, useMemo, useState } from "react";
import type { GmcComm } from "@/lib/comms-gmc";

/*
 * Comunicaciones de GMC: se guardan en la memoria del hub (no en
 * la Sheet). Se registra primero el tipo (Requested / Received),
 * luego cliente, entidad, item y medio.
 */

type Data = {
  comms: GmcComm[];
  tipos: string[];
  medios: string[];
  entidades: string[];
  items: string[];
  clientes: string[];
  me: string;
  email: string;
  canWrite: boolean;
  isAdmin: boolean;
};

type Periodo = "semana" | "pasada" | "mes" | "todo";

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

const TIPO_LABEL: Record<string, string> = {
  REQUESTED: "Requested · solicitar",
  RECEIVED: "Received · recibir",
};

export default function ComunicacionesGmc() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState<GmcComm | "new" | null>(null);

  const [colab, setColab] = useState("todos");
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [tipo, setTipo] = useState("todos");
  const [medio, setMedio] = useState("todos");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/comms-gmc", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudieron cargar las comunicaciones");
      setData(json);
      setColab((c) =>
        c === "todos" && json.comms.some((x: GmcComm) => x.email === json.email) ? json.me : c
      );
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
    const t = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  async function remove(c: GmcComm) {
    if (!window.confirm(`¿Borrar la comunicación de ${c.cliente} con ${c.entidad} (${fmt(c.fecha)})?`)) return;
    setError("");
    try {
      const res = await fetch("/api/comms-gmc", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo borrar");
      setNotice("Comunicación borrada");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

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

  const base = comms.filter((c) => {
    const q = query.trim().toLowerCase();
    return (
      (colab === "todos" || c.colaborador === colab) &&
      (medio === "todos" || c.medio === medio) &&
      c.fecha >= from &&
      c.fecha <= to &&
      (!q || `${c.cliente} ${c.entidad} ${c.item} ${c.notas}`.toLowerCase().includes(q))
    );
  });
  const rows = base
    .filter((c) => tipo === "todos" || c.tipo === tipo)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado));
  const canTouch = (c: GmcComm) => !!data && (data.isAdmin || (data.canWrite && c.email === data.email));

  return (
    <div className="rgPage cmPage">
      <header className="pageHeader">
        <div>
          <p className="eyebrow">COMUNICACIONES · GMC</p>
          <h1>Comunicaciones</h1>
          <p>Lo que se solicita y se recibe de cada entidad. Se guarda en el hub (no en la Sheet).</p>
        </div>

        <div className="cmHeaderActions">
          <button className="refreshButton" onClick={load}>
            ↻ Refresh
          </button>
          <a className="rgBtn rgBtnGhost" href="/api/comms-gmc/export">
            ⬇ CSV
          </a>
          {data?.canWrite && (
            <button className="rgBtn rgBtnPrimary" onClick={() => setForm("new")}>
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
              {data.tipos.map((t) => (
                <div key={t}>
                  <span>{t.charAt(0) + t.slice(1).toLowerCase()}</span>
                  <strong>{base.filter((c) => c.tipo === t).length}</strong>
                </div>
              ))}
              <div>
                <span>Clientes</span>
                <strong>{new Set(base.map((c) => c.cliente)).size}</strong>
              </div>
              <div>
                <span>Entidades</span>
                <strong>{new Set(base.map((c) => c.entidad.toUpperCase())).size}</strong>
              </div>
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
                <option value="todo">Todo</option>
              </select>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo">
                <option value="todos">Requested y received</option>
                {data.tipos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select value={medio} onChange={(e) => setMedio(e.target.value)} aria-label="Medio">
                <option value="todos">Cualquier medio</option>
                {data.medios.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                className="gmSearch"
                value={query}
                placeholder="Buscar cliente, entidad, item…"
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
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Entidad</th>
                      <th>Item</th>
                      <th>Medio</th>
                      <th>Colaborador</th>
                      <th>Notas</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id}>
                        <td>{fmt(c.fecha)}</td>
                        <td>
                          <span className={`cgTipo ${c.tipo === "RECEIVED" ? "cgReceived" : "cgRequested"}`}>
                            {c.tipo}
                          </span>
                        </td>
                        <td>
                          <strong>{c.cliente}</strong>
                        </td>
                        <td>{c.entidad}</td>
                        <td>{c.item}</td>
                        <td className="cmMedio">{c.medio}</td>
                        <td>{c.colaborador}</td>
                        <td className="rsNota">{c.notas || "—"}</td>
                        <td>
                          {canTouch(c) && (
                            <span className="rgCardMinor">
                              <button onClick={() => setForm(c)}>Editar</button>
                              <button onClick={() => remove(c)}>Borrar</button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && <div className="gmEmpty">No hay comunicaciones con estos filtros.</div>}
              </div>
            </section>

            {form && (
              <GmcCommForm
                data={data}
                editing={form === "new" ? null : form}
                onCancel={() => setForm(null)}
                onSaved={(another, edited) => {
                  setNotice(edited ? "Comunicación actualizada" : "Comunicación registrada");
                  if (!another) setForm(null);
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

function GmcCommForm({
  data,
  editing,
  onCancel,
  onSaved,
}: {
  data: Data;
  editing: GmcComm | null;
  onCancel: () => void;
  onSaved: (another: boolean, edited: boolean) => void;
}) {
  const blank = {
    tipo: "",
    cliente: "",
    entidad: "",
    item: "",
    medio: "",
    fecha: iso(new Date()),
    notas: "",
  };
  const [f, setF] = useState(
    editing
      ? {
          tipo: editing.tipo as string,
          cliente: editing.cliente,
          entidad: editing.entidad,
          item: editing.item,
          medio: editing.medio,
          fecha: editing.fecha,
          notas: editing.notas,
        }
      : blank
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof blank>(k: K, v: (typeof blank)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(another: boolean) {
    setErr("");
    if (!f.tipo) return setErr("Elige si es Requested o Received");
    if (!f.cliente.trim()) return setErr("Escribe el cliente");
    if (!f.entidad.trim()) return setErr("Escribe la entidad");
    if (!f.item.trim()) return setErr("Escribe el item");
    if (!f.medio) return setErr("Elige el medio");
    setSaving(true);
    try {
      const res = await fetch("/api/comms-gmc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, id: editing?.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo registrar");
      onSaved(another, !!editing);
      // Para registrar otra del mismo cliente y entidad, solo cambia el item.
      if (another) setF({ ...f, item: "", notas: "" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo registrar");
    } finally {
      setSaving(false);
    }
  }

  const chips = (values: string[], selected: string, pick: (v: string) => void, label?: (v: string) => string) => (
    <div className="rgChips">
      {values.map((v) => (
        <button
          type="button"
          key={v}
          className={selected === v ? "active" : ""}
          aria-pressed={selected === v}
          onClick={() => pick(v)}
        >
          {label ? label(v) : v}
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
          <h2>{editing ? "Editar comunicación" : "Registrar comunicación"}</h2>
          <button type="button" className="rgClose" onClick={onCancel} aria-label="Cerrar">
            ×
          </button>
        </div>

        <p className="cmWho">
          Se registra como <strong>{editing?.colaborador || data.me}</strong>
        </p>

        <div className="rgField">
          <span>1 · Tipo: ¿te comunicas para solicitar o para recibir?</span>
          {chips(data.tipos, f.tipo, (v) => set("tipo", v), (v) => TIPO_LABEL[v] || v)}
        </div>

        <div className="rgRow">
          <label className="rgField">
            <span>2 · Cliente</span>
            <input
              list="cg-clientes"
              value={f.cliente}
              placeholder="Nombre del cliente"
              onChange={(e) => set("cliente", e.target.value)}
            />
            <datalist id="cg-clientes">
              {data.clientes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="rgField rgFieldNarrow">
            <span>Fecha</span>
            <input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} />
          </label>
        </div>

        <div className="rgRow">
          <label className="rgField">
            <span>3 · Entidad (agencia)</span>
            <input
              list="cg-entidades"
              value={f.entidad}
              placeholder="Ej. FBI, Corte de…, Policía de…"
              onChange={(e) => set("entidad", e.target.value)}
            />
            <datalist id="cg-entidades">
              {data.entidades.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
          <label className="rgField">
            <span>4 · Item (documento)</span>
            <input
              list="cg-items"
              value={f.item}
              placeholder="Qué documento se solicita o recibe"
              onChange={(e) => set("item", e.target.value)}
            />
            <datalist id="cg-items">
              {data.items.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="rgField">
          <span>5 · Medio</span>
          {chips(data.medios, f.medio, (v) => set("medio", v))}
        </div>

        <label className="rgField">
          <span>Notas (opcional)</span>
          <textarea rows={2} value={f.notas} onChange={(e) => set("notas", e.target.value)} />
        </label>

        {err && <div className="errorBanner rgFormError">{err}</div>}

        <div className="rgFormActions">
          <button type="button" className="rgBtn rgBtnGhost" onClick={onCancel}>
            Cancelar
          </button>
          {!editing && (
            <button type="button" className="rgBtn rgBtnGhost" disabled={saving} onClick={() => submit(true)}>
              Guardar y registrar otra
            </button>
          )}
          <button type="submit" className="rgBtn rgBtnPrimary" disabled={saving}>
            {saving ? "Guardando…" : editing ? "Guardar cambios" : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
