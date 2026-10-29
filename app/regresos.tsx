"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CELULAS, type Celula } from "@/lib/celulas";
import {
  ETAPAS,
  AREAS,
  AREA_LABELS,
  ORIGEN_LABELS,
  PUESTO_LABELS,
  TIPO_LABELS,
  canEdit,
  daysBetween,
  isLead,
  areaDeMotivo,
  gruposDe,
  isOverdue,
  pareto,
  type ParetoRow,
  type ActualizacionOrigen,
  type Area,
  type Person,
  type Puesto,
  type Regreso,
  type RegresoTipo,
  type Viewer,
} from "@/lib/regresos";
import type { Role } from "@/lib/auth";

/*
 * Registro de regresos y actualizaciones. Al entrar cada quien
 * ve lo que le toca; los leads además ven todo y el 80/20.
 */

type CaseOption = {
  cliente: string;
  id: string;
  receipt: string;
  celula: Celula;
};

type Tab = "mine" | "sent" | "done" | "all" | "pareto" | "team";

type TipoFilter = "todos" | RegresoTipo;

type Draft = {
  id?: string;
  tipo: RegresoTipo;
  celula: Celula;
  cliente: string;
  clienteId: string;
  receipt: string;
  etapa: string;
  origen: ActualizacionOrigen | "";
  // Un registro por área elegida: qué se pide y a quién.
  areas: Area[];
  picks: Partial<Record<Area, Pick>>;
  detalle: string;
  de: string;
  enviado: string;
  limite: string;
};

type Pick = { motivo: string; para: string };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtDate(value?: string) {
  if (!value) return "—";
  const [y, m, d] = value.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Lunes de la semana de una fecha YYYY-MM-DD.
function weekStart(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  return addDays(date, -day);
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

function dueChip(r: Regreso, today: string) {
  if (r.estado === "concretado") {
    if (r.limite && r.concretado && r.concretado > r.limite) {
      return { tone: "late", text: `Concretado tarde · ${fmtDate(r.concretado)}` };
    }
    return { tone: "done", text: `Concretado · ${fmtDate(r.concretado)}` };
  }
  if (!r.limite) return { tone: "none", text: "Sin fecha límite" };
  const diff = daysBetween(today, r.limite);
  if (diff < 0) return { tone: "late", text: `Vencido hace ${-diff} d` };
  if (diff === 0) return { tone: "today", text: "Vence hoy" };
  if (diff === 1) return { tone: "soon", text: "Vence mañana" };
  return { tone: "ok", text: `Vence ${fmtDate(r.limite)}` };
}

export default function Regresos({
  role,
  email,
  celulas,
  defaultCelula,
  cases,
}: {
  role: Role;
  email: string;
  celulas: Celula[];
  defaultCelula: Celula;
  cases: CaseOption[];
}) {
  const [items, setItems] = useState<Regreso[]>([]);
  const [roster, setRoster] = useState<Person[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const lead = isLead(role);
  const [tab, setTab] = useState<Tab>("mine");
  const [tipoFilter, setTipoFilter] = useState<TipoFilter>("todos");
  const [celulaFilter, setCelulaFilter] = useState<Celula | "todas">("todas");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [closing, setClosing] = useState<Regreso | null>(null);

  const viewer: Viewer = { email, personId: me, role, celulas };

  async function load() {
    setError("");
    try {
      const res = await fetch("/api/regresos", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo cargar");
      setItems(json.items);
      setRoster(json.roster);
      setMe(json.me);
      setToday(json.today);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const names = useMemo(
    () => new Map(roster.map((p) => [p.id, p.name])),
    [roster]
  );
  const nameOf = (id: string) => names.get(id) || "—";

  const mine = items.filter((r) => r.para === me && r.estado === "pendiente");
  const sent = items.filter(
    (r) => (r.de === me || r.deEmail === email) && r.estado === "pendiente"
  );
  const done = items.filter(
    (r) =>
      r.estado === "concretado" &&
      (r.para === me || r.de === me || r.deEmail === email)
  );
  const mineOverdue = mine.filter((r) => isOverdue(r, today)).length;
  const weekFrom = today ? weekStart(today) : "";
  const doneThisWeek = done.filter(
    (r) => r.para === me && (r.concretado || "") >= weekFrom
  ).length;

  const tabRows: Record<"mine" | "sent" | "done" | "all", Regreso[]> = {
    mine,
    sent,
    done,
    all: items,
  };

  const filtered = (rows: Regreso[]) => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (tipoFilter === "todos" || r.tipo === tipoFilter) &&
        (celulaFilter === "todas" || r.celula === celulaFilter) &&
        (!q ||
          [r.cliente, r.clienteId, r.receipt, r.motivo, r.detalle, r.etapa, nameOf(r.para), nameOf(r.de)]
            .join(" ")
            .toLowerCase()
            .includes(q))
    );
  };

  // Lo pendiente primero, lo más vencido arriba.
  const sortRows = (rows: Regreso[]) =>
    [...rows].sort((a, b) => {
      if (a.estado !== b.estado) return a.estado === "pendiente" ? -1 : 1;
      if (a.estado === "concretado") {
        return (b.concretado || "").localeCompare(a.concretado || "");
      }
      return (a.limite || "9999").localeCompare(b.limite || "9999") ||
        a.enviado.localeCompare(b.enviado);
    });

  function openNew(tipo: RegresoTipo = "regreso") {
    setDraft({
      tipo,
      celula: celulas.includes(defaultCelula) ? defaultCelula : celulas[0],
      cliente: "",
      clienteId: "",
      receipt: "",
      etapa: "",
      origen: "",
      areas: [],
      picks: {},
      detalle: "",
      de: me || "",
      enviado: today,
      limite: today ? addDays(today, 1) : "",
    });
  }

  function openEdit(r: Regreso) {
    setDraft({
      id: r.id,
      tipo: r.tipo,
      celula: r.celula,
      cliente: r.cliente,
      clienteId: r.clienteId || "",
      receipt: r.receipt || "",
      etapa: r.etapa,
      origen: r.origen || "",
      ...(() => {
        const area = r.area || areaDeMotivo(r.tipo, r.motivo) || "paralegal";
        return { areas: [area], picks: { [area]: { motivo: r.motivo, para: r.para } } };
      })(),
      detalle: r.detalle,
      de: r.de,
      enviado: r.enviado,
      limite: r.limite || "",
    });
  }

  async function send(method: string, body?: unknown, query = "") {
    const res = await fetch(`/api/regresos${query}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "No se pudo guardar");
    return json;
  }

  async function saveDraft(d: Draft, another: boolean) {
    // Varias áreas: un registro por área, cada quien concreta el suyo.
    const { areas, picks, ...rest } = d;
    const bodies = areas.map((area) => ({ ...rest, area, ...picks[area] }));
    const saved: Regreso[] = [];
    for (const body of bodies) {
      const json = d.id
        ? await send("PATCH", { ...body, action: "editar" })
        : await send("POST", body);
      saved.push(json.item);
    }
    const ids = new Set(saved.map((r) => r.id));
    setItems((prev) => [...saved, ...prev.filter((r) => !ids.has(r.id))]);
    setNotice(
      d.id
        ? "Registro actualizado"
        : saved.length > 1
          ? `${TIPO_LABELS[d.tipo]} registrado para ${d.areas.map((a) => AREA_LABELS[a].toLowerCase()).join(", ")}`
          : `${TIPO_LABELS[d.tipo]} registrado`
    );
    if (another) {
      setDraft({ ...d, id: undefined, cliente: "", clienteId: "", receipt: "", detalle: "", picks: {} });
    } else {
      setDraft(null);
    }
  }

  async function changeState(r: Regreso, action: "concretar" | "reabrir", nota = "", fecha = today) {
    try {
      const json = await send("PATCH", { id: r.id, action, nota, fecha });
      setItems((prev) => prev.map((x) => (x.id === r.id ? json.item : x)));
      setNotice(action === "concretar" ? "Marcado como concretado" : "Regresó a pendiente");
      setClosing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  async function remove(r: Regreso) {
    if (!window.confirm(`¿Borrar el registro de ${r.cliente}? No se puede deshacer.`)) return;
    try {
      await send("DELETE", undefined, `?id=${encodeURIComponent(r.id)}`);
      setItems((prev) => prev.filter((x) => x.id !== r.id));
      setNotice("Registro borrado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "mine", label: "Me toca", count: mine.length },
    { key: "sent", label: "Mandé", count: sent.length },
    { key: "done", label: "Concretados" },
    ...(lead
      ? ([
          { key: "all", label: "Todos" },
          { key: "pareto", label: "Análisis 80/20" },
        ] as const)
      : []),
    ...(role === "ADMIN" ? ([{ key: "team", label: "Equipo" }] as const) : []),
  ];

  const emptyText: Record<string, string> = {
    mine: "No tienes regresos ni actualizaciones pendientes. 🎉",
    sent: "Todo lo que mandaste ya está concretado.",
    done: "Aún no hay registros concretados.",
    all: "Sin registros con estos filtros.",
  };

  return (
    <div className="rgPage">
      {notice && <div className="floatingMessage">✓ {notice}</div>}

      <header className="pageHeader">
        <div>
          <p className="eyebrow">CALIDAD RFE</p>
          <h1>Regresos y actualizaciones</h1>
          <p>
            Regreso = hubo un error que corregir. Actualización = el cliente recordó
            información o consiguió un documento que antes no se tenía.
          </p>
        </div>

        <div className="rgHeaderActions">
          <button className="rgBtn rgBtnGhost" onClick={() => openNew("actualizacion")} disabled={loading}>
            + Actualización
          </button>
          <button className="rgBtn rgBtnPrimary" onClick={() => openNew("regreso")} disabled={loading}>
            + Regreso
          </button>
        </div>
      </header>

      {error && <div className="errorBanner">{error}</div>}

      {!loading && !me && (
        <div className="rgHint">
          Tu correo no está en la lista del equipo, así que nadie puede asignarte
          registros todavía. Pide al Admin que te agregue en la pestaña Equipo.
        </div>
      )}

      <div className="rgStats">
        <button className={`rgStat ${tab === "mine" ? "active" : ""}`} onClick={() => setTab("mine")}>
          <span>Me toca</span>
          <strong>{mine.length}</strong>
          <em>pendientes de corregir</em>
        </button>
        <button className={`rgStat ${mineOverdue ? "rgStatAlert" : ""}`} onClick={() => setTab("mine")}>
          <span>Vencidos</span>
          <strong>{mineOverdue}</strong>
          <em>de los que me tocan</em>
        </button>
        <button className={`rgStat ${tab === "sent" ? "active" : ""}`} onClick={() => setTab("sent")}>
          <span>Me deben</span>
          <strong>{sent.length}</strong>
          <em>mandé y siguen pendientes</em>
        </button>
        <button className={`rgStat ${tab === "done" ? "active" : ""}`} onClick={() => setTab("done")}>
          <span>Concreté esta semana</span>
          <strong>{doneThisWeek}</strong>
          <em>desde el lunes {fmtDate(weekFrom)}</em>
        </button>
      </div>

      <div className="rgTabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count !== undefined && <span className="rgTabCount">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab !== "team" && (
        <div className="rgFilters">
          <div className="rgSegment" role="group" aria-label="Tipo">
            {(["todos", "regreso", "actualizacion"] as TipoFilter[]).map((t) => (
              <button
                key={t}
                className={tipoFilter === t ? "active" : ""}
                aria-pressed={tipoFilter === t}
                onClick={() => setTipoFilter(t)}
              >
                {t === "todos" ? "Todos" : t === "regreso" ? "Regresos" : "Actualizaciones"}
              </button>
            ))}
          </div>

          {celulas.length > 1 && (
            <select
              className="rgSelect"
              value={celulaFilter}
              onChange={(e) => setCelulaFilter(e.target.value as Celula | "todas")}
              aria-label="Célula"
            >
              <option value="todas">Todas las células</option>
              {celulas.map((c) => (
                <option key={c} value={c}>
                  {CELULAS[c].label}
                </option>
              ))}
            </select>
          )}

          {tab !== "pareto" && (
            <input
              className="rgSearch"
              type="search"
              placeholder="Buscar cliente, ID, persona, motivo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}

          {lead && (
            <a className="rgBtn rgBtnGhost rgExport" href="/api/regresos/export">
              ⤓ Exportar CSV
            </a>
          )}
        </div>
      )}

      {loading ? (
        <div className="rgEmpty">Cargando…</div>
      ) : tab === "pareto" ? (
        <ParetoView
          items={items.filter(
            (r) =>
              (tipoFilter === "todos" || r.tipo === tipoFilter) &&
              (celulaFilter === "todas" || r.celula === celulaFilter)
          )}
          today={today}
          nameOf={nameOf}
        />
      ) : tab === "team" ? (
        <TeamEditor
          roster={roster}
          celulas={celulas}
          onSaved={(next) => {
            setRoster(next);
            setNotice("Equipo guardado");
          }}
        />
      ) : (
        <div className="rgList">
          {sortRows(filtered(tabRows[tab])).map((r) => {
            const chip = dueChip(r, today);
            const editable = canEdit(viewer, r);
            return (
              <article key={r.id} className={`rgCard rgCard-${r.tipo} ${r.estado === "concretado" ? "rgCardDone" : ""}`}>
                <div className="rgCardMain">
                  <div className="rgCardTop">
                    <span className={`rgBadge rgBadge-${r.tipo}`}>{TIPO_LABELS[r.tipo]}</span>
                    <span className="rgMeta">{r.etapa}</span>
                    {r.area && <span className="rgMeta">{AREA_LABELS[r.area]}</span>}
                    {r.origen && <span className="rgMeta">{ORIGEN_LABELS[r.origen]}</span>}
                    {celulas.length > 1 && <span className="rgMeta">{CELULAS[r.celula]?.label}</span>}
                    <span className={`rgDue rgDue-${chip.tone}`}>{chip.text}</span>
                  </div>
                  <h3>
                    {r.cliente}
                    {r.clienteId && <small> · ID {r.clienteId}</small>}
                    {r.receipt && <small> · {r.receipt}</small>}
                  </h3>
                  <p className="rgMotivo">{r.motivo}</p>
                  {r.detalle && <p className="rgDetalle">{r.detalle}</p>}
                  {r.nota && <p className="rgNota">Cierre: {r.nota}</p>}
                  <p className="rgPeople">
                    <span>{nameOf(r.de)}</span> → <strong>{nameOf(r.para)}</strong>
                    <span className="rgDot">·</span> enviado {fmtDate(r.enviado)}
                  </p>
                </div>

                <div className="rgCardActions">
                  {r.estado === "pendiente" ? (
                    <button className="rgBtn rgBtnDone" onClick={() => setClosing(r)}>
                      ✓ Concretar
                    </button>
                  ) : (
                    <button className="rgBtn rgBtnGhost" onClick={() => changeState(r, "reabrir")}>
                      Reabrir
                    </button>
                  )}
                  {editable && (
                    <div className="rgCardMinor">
                      <button onClick={() => openEdit(r)}>Editar</button>
                      {/* Borrar: solo el Admin. */}
                      {role === "ADMIN" && <button onClick={() => remove(r)}>Borrar</button>}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
          {!filtered(tabRows[tab]).length && <div className="rgEmpty">{emptyText[tab]}</div>}
        </div>
      )}

      {draft && (
        <RegistroForm
          draft={draft}
          roster={roster}
          celulas={celulas}
          cases={cases}
          today={today}
          onCancel={() => setDraft(null)}
          onSave={saveDraft}
        />
      )}

      {closing && (
        <CloseDialog
          item={closing}
          today={today}
          onCancel={() => setClosing(null)}
          onConfirm={(nota, fecha) => changeState(closing, "concretar", nota, fecha)}
        />
      )}
    </div>
  );
}

/* ---------------- Formulario de registro ---------------- */

// Qué se pide a un área y a quién: lista del área + persona.
function MotivoPicker({
  label,
  tipo,
  area,
  motivo,
  para,
  people,
  showCelula,
  onMotivo,
  onPara,
}: {
  label?: string;
  tipo: RegresoTipo;
  area: Area;
  motivo: string;
  para: string;
  people: Person[];
  showCelula: boolean;
  onMotivo: (v: string) => void;
  onPara: (v: string) => void;
}) {
  const grupos = gruposDe(tipo, area);
  // Solo gente de esa área (y quien aún no tenga puesto).
  const candidates = people.filter(
    (p) => !p.puesto || p.puesto === area || p.id === para
  );
  const opciones = grupos.flatMap((g) => g.motivos);
  const hint = opciones.find((m) => m.label === motivo)?.hint;
  const options = (g: (typeof grupos)[number]) =>
    g.motivos.map((m) => (
      <option key={m.label} value={m.label}>
        {m.label}
      </option>
    ));

  return (
    <div className="rgPicker">
      {label && <strong className="rgPickerLabel">{label}</strong>}
      <div className="rgRow">
        <select
          className="rgPickerMotivo"
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
          aria-label={`Qué se pide${label ? ` a ${label}` : ""}`}
        >
          <option value="">Elige qué se pide…</option>
          {/* Motivo de un registro anterior que ya no está en la lista. */}
          {motivo && !opciones.some((m) => m.label === motivo) && (
            <option value={motivo}>{motivo}</option>
          )}
          {grupos.length > 2
            ? grupos.map((g) => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {options(g)}
                </optgroup>
              ))
            : grupos.map(options)}
        </select>
        <select
          className="rgPickerPara"
          value={para}
          onChange={(e) => onPara(e.target.value)}
          aria-label={`Para quién va${label ? ` (${label})` : ""}`}
        >
          <option value="">Para quién va…</option>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {showCelula ? ` (${CELULAS[p.celula]?.label})` : ""}
            </option>
          ))}
        </select>
      </div>
      {hint && <p className="rgMotivoHint">{hint}</p>}
    </div>
  );
}

function RegistroForm({
  draft,
  roster,
  celulas,
  cases,
  today,
  onCancel,
  onSave,
}: {
  draft: Draft;
  roster: Person[];
  celulas: Celula[];
  cases: CaseOption[];
  today: string;
  onCancel: () => void;
  onSave: (d: Draft, another: boolean) => Promise<void>;
}) {
  const [d, setD] = useState<Draft>(draft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [suggest, setSuggest] = useState(false);
  const clientRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setD(draft);
    setErr("");
    clientRef.current?.focus();
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setD((prev) => ({ ...prev, [key]: value }));

  const setPick = (area: Area, patch: Partial<Pick>) =>
    setD((prev) => ({
      ...prev,
      picks: {
        ...prev.picks,
        [area]: { motivo: "", para: "", ...prev.picks[area], ...patch },
      },
    }));

  const q = d.cliente.trim().toLowerCase();
  const matches = q.length < 2
    ? []
    : cases
        .filter((c) =>
          `${c.cliente} ${c.id} ${c.receipt}`.toLowerCase().includes(q)
        )
        .slice(0, 8);

  // Activos primero; los de la célula elegida arriba.
  const people = roster
    .filter((p) => p.active || p.id === d.de || Object.values(d.picks).some((k) => k?.para === p.id))
    .sort((a, b) =>
      Number(b.celula === d.celula) - Number(a.celula === d.celula) ||
      a.name.localeCompare(b.name)
    );

  async function submit(another: boolean) {
    setErr("");
    if (!d.cliente.trim()) return setErr("Escribe el cliente");
    if (d.tipo === "actualizacion" && !d.origen) return setErr("Elige qué trajo el cliente");
    if (!d.areas.length) return setErr("Elige para qué área va");
    for (const a of d.areas) {
      if (!d.picks[a]?.motivo) return setErr(`Elige qué se pide a ${AREA_LABELS[a]}`);
      if (!d.picks[a]?.para) return setErr(`Elige para quién va (${AREA_LABELS[a]})`);
    }
    setSaving(true);
    try {
      await onSave({ ...d, etapa: d.etapa || "Otra" }, another);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const quickDates = today
    ? [
        { label: "Hoy", value: today },
        { label: "Mañana", value: addDays(today, 1) },
        { label: "+2 días", value: addDays(today, 2) },
        { label: "+1 semana", value: addDays(today, 7) },
        { label: "Sin fecha", value: "" },
      ]
    : [];

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
          <h2>{d.id ? "Editar registro" : "Nuevo registro"}</h2>
          <button type="button" className="rgClose" onClick={onCancel} aria-label="Cerrar">
            ×
          </button>
        </div>

        <div className="rgTipoPick" role="radiogroup" aria-label="Tipo">
          {(["regreso", "actualizacion"] as RegresoTipo[]).map((t) => (
            <button
              type="button"
              key={t}
              role="radio"
              aria-checked={d.tipo === t}
              className={`rgTipo rgTipo-${t} ${d.tipo === t ? "active" : ""}`}
              onClick={() =>
                setD((prev) => ({
                  ...prev,
                  tipo: t,
                  picks: {},
                }))
              }
            >
              <strong>{TIPO_LABELS[t]}</strong>
              <span>{t === "regreso" ? "Hubo un error y hay que corregirlo" : "El cliente recordó información o consiguió un documento que antes no se tenía"}</span>
            </button>
          ))}
        </div>

        <label className="rgField rgClientField">
          <span>Cliente</span>
          <input
            ref={clientRef}
            value={d.cliente}
            placeholder="Nombre, ID o receipt number"
            autoComplete="off"
            onChange={(e) => {
              setD((prev) => ({ ...prev, cliente: e.target.value, clienteId: "", receipt: "" }));
              setSuggest(true);
            }}
            onFocus={() => setSuggest(true)}
            onBlur={() => setTimeout(() => setSuggest(false), 150)}
          />
          {(d.clienteId || d.receipt) && (
            <em className="rgLinked">
              Ligado a la Sheet: ID {d.clienteId || "—"} · {d.receipt || "sin receipt"}
            </em>
          )}
          {suggest && matches.length > 0 && (
            <ul className="rgSuggest">
              {matches.map((c) => (
                <li key={`${c.celula}-${c.id}-${c.receipt}-${c.cliente}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setD((prev) => ({
                        ...prev,
                        cliente: c.cliente,
                        clienteId: c.id,
                        receipt: c.receipt,
                        celula: celulas.includes(c.celula) ? c.celula : prev.celula,
                      }));
                      setSuggest(false);
                    }}
                  >
                    <strong>{c.cliente}</strong>
                    <span>
                      ID {c.id || "—"} · {c.receipt || "sin receipt"}
                      {celulas.length > 1 && ` · ${CELULAS[c.celula]?.label}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>

        <div className="rgRow">
          <label className="rgField">
            <span>Quién lo manda</span>
            <select value={d.de} onChange={(e) => set("de", e.target.value)}>
              <option value="">Elegir…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {celulas.length > 1 && (
            <label className="rgField rgFieldNarrow">
              <span>Célula</span>
              <select value={d.celula} onChange={(e) => set("celula", e.target.value as Celula)}>
                {celulas.map((c) => (
                  <option key={c} value={c}>
                    {CELULAS[c].label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="rgField">
          <span>Etapa</span>
          <div className="rgChips">
            {ETAPAS.map((e) => (
              <button
                type="button"
                key={e}
                className={d.etapa === e ? "active" : ""}
                aria-pressed={d.etapa === e}
                onClick={() => set("etapa", d.etapa === e ? "" : e)}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {d.tipo === "actualizacion" && (
          <div className="rgField">
            <span>Qué trajo el cliente</span>
            <div className="rgChips">
              {(Object.keys(ORIGEN_LABELS) as ActualizacionOrigen[]).map((o) => (
                <button
                  type="button"
                  key={o}
                  className={d.origen === o ? "active" : ""}
                  aria-pressed={d.origen === o}
                  onClick={() => set("origen", o)}
                >
                  {ORIGEN_LABELS[o]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="rgField">
          <span>Para qué área{d.id ? "" : " (puedes elegir varias)"}</span>
          <div className="rgChips">
            {AREAS.map((a) => {
              const on = d.areas.includes(a);
              return (
                <button
                  type="button"
                  key={a}
                  className={on ? "active" : ""}
                  aria-pressed={on}
                  onClick={() =>
                    setD((prev) => ({
                      ...prev,
                      // Un registro ya guardado es de una sola área.
                      areas: prev.id
                        ? [a]
                        : on
                          ? prev.areas.filter((x) => x !== a)
                          : AREAS.filter((x) => x === a || prev.areas.includes(x)),
                      picks: prev.id
                        ? { [a]: { motivo: "", para: prev.picks[prev.areas[0]]?.para || "" } }
                        : prev.picks,
                    }))
                  }
                >
                  {AREA_LABELS[a]}
                </button>
              );
            })}
          </div>
        </div>

        {d.areas.length > 0 && (
          <div className="rgField">
            <span>Qué se pide</span>
            {d.areas.map((a) => (
              <MotivoPicker
                key={a}
                label={d.areas.length > 1 ? AREA_LABELS[a] : undefined}
                tipo={d.tipo}
                area={a}
                motivo={d.picks[a]?.motivo || ""}
                para={d.picks[a]?.para || ""}
                people={people}
                showCelula={celulas.length > 1}
                onMotivo={(v) => setPick(a, { motivo: v })}
                onPara={(v) => setPick(a, { para: v })}
              />
            ))}
          </div>
        )}

        <div className="rgField">
          <textarea
            rows={2}
            value={d.detalle}
            placeholder="Detalle (opcional): qué hay que corregir o qué documento llegó"
            onChange={(e) => set("detalle", e.target.value)}
          />
        </div>

        <div className="rgRow">
          <label className="rgField rgFieldNarrow">
            <span>Cuándo se manda</span>
            <input type="date" value={d.enviado} max={today || undefined} onChange={(e) => set("enviado", e.target.value)} />
          </label>
          <div className="rgField">
            <span>Para cuándo</span>
            <div className="rgDateRow">
              <input type="date" value={d.limite} min={d.enviado} onChange={(e) => set("limite", e.target.value)} />
              <div className="rgChips rgChipsSmall">
                {quickDates.map((q) => (
                  <button
                    type="button"
                    key={q.label}
                    className={d.limite === q.value ? "active" : ""}
                    onClick={() => set("limite", q.value)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {err && <div className="errorBanner rgFormError">{err}</div>}

        <div className="rgFormActions">
          <button type="button" className="rgBtn rgBtnGhost" onClick={onCancel}>
            Cancelar
          </button>
          {!d.id && (
            <button type="button" className="rgBtn rgBtnGhost" disabled={saving} onClick={() => submit(true)}>
              Guardar y registrar otro
            </button>
          )}
          <button type="submit" className="rgBtn rgBtnPrimary" disabled={saving}>
            {saving ? "Guardando…" : d.id ? "Guardar cambios" : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Concretar ---------------- */

function CloseDialog({
  item,
  today,
  onCancel,
  onConfirm,
}: {
  item: Regreso;
  today: string;
  onCancel: () => void;
  onConfirm: (nota: string, fecha: string) => void;
}) {
  const [nota, setNota] = useState("");
  const [fecha, setFecha] = useState(today);

  return (
    <div className="modalOverlay rgOverlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form
        className="rgForm rgFormSmall"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(nota, fecha);
        }}
      >
        <div className="rgFormHead">
          <h2>Marcar como concretado</h2>
          <button type="button" className="rgClose" onClick={onCancel} aria-label="Cerrar">
            ×
          </button>
        </div>
        <p className="rgCloseWhat">
          {TIPO_LABELS[item.tipo]} · <strong>{item.cliente}</strong> · {item.motivo}
        </p>
        <label className="rgField rgFieldNarrow">
          <span>Fecha en que se concretó</span>
          <input type="date" value={fecha} min={item.enviado} max={today} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className="rgField">
          <span>Nota (opcional)</span>
          <textarea rows={2} value={nota} autoFocus placeholder="Qué se hizo" onChange={(e) => setNota(e.target.value)} />
        </label>
        <div className="rgFormActions">
          <button type="button" className="rgBtn rgBtnGhost" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="rgBtn rgBtnDone">
            ✓ Concretado
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------------- Análisis 80/20 ---------------- */

type Period = "month" | "30" | "90" | "year" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "Este mes" },
  { key: "30", label: "30 días" },
  { key: "90", label: "90 días" },
  { key: "year", label: "Este año" },
  { key: "all", label: "Todo" },
];

function ParetoView({
  items,
  today,
  nameOf,
}: {
  items: Regreso[];
  today: string;
  nameOf: (id: string) => string;
}) {
  const [period, setPeriod] = useState<Period>("month");

  const from =
    period === "month"
      ? `${today.slice(0, 7)}-01`
      : period === "year"
      ? `${today.slice(0, 4)}-01-01`
      : period === "all"
      ? ""
      : addDays(today, -Number(period) + 1);

  const inPeriod = items.filter((r) => r.enviado >= from);
  const regresos = inPeriod.filter((r) => r.tipo === "regreso");
  const actualizaciones = inPeriod.filter((r) => r.tipo === "actualizacion");
  const closed = inPeriod.filter((r) => r.estado === "concretado" && r.concretado);
  const withLimit = closed.filter((r) => r.limite);
  const onTime = withLimit.filter((r) => r.concretado! <= r.limite!).length;
  const avgDays = closed.length
    ? closed.reduce((s, r) => s + daysBetween(r.enviado, r.concretado!), 0) / closed.length
    : null;
  const overdue = inPeriod.filter((r) => isOverdue(r, today)).length;

  // El 80/20 se hace sobre regresos (errores); si se filtran
  // solo actualizaciones, se hace sobre esas.
  const base = regresos.length ? regresos : actualizaciones;
  const baseLabel = regresos.length ? "regresos" : "actualizaciones";

  const countBy = (key: (r: Regreso) => string) => {
    const m = new Map<string, number>();
    for (const r of base) m.set(key(r), (m.get(key(r)) || 0) + 1);
    return m;
  };

  const byPerson = pareto(countBy((r) => r.para));
  const byMotivo = pareto(countBy((r) => r.motivo));
  const byEtapa = pareto(countBy((r) => r.etapa));

  // Últimas 12 semanas, regresos vs actualizaciones.
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(weekStart(today), -7 * (11 - i)));
  const weekly = weeks.map((w) => {
    const end = addDays(w, 7);
    const inWeek = items.filter((r) => r.enviado >= w && r.enviado < end);
    return {
      week: w,
      regreso: inWeek.filter((r) => r.tipo === "regreso").length,
      actualizacion: inWeek.filter((r) => r.tipo === "actualizacion").length,
    };
  });
  const weekMax = Math.max(4, ...weekly.map((w) => w.regreso + w.actualizacion));

  // Tabla de feedback por persona.
  const people = new Map<string, Regreso[]>();
  for (const r of inPeriod) {
    const list = people.get(r.para) || [];
    list.push(r);
    people.set(r.para, list);
  }
  const top = (rows: Regreso[], key: (r: Regreso) => string) => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(key(r), (m.get(key(r)) || 0) + 1));
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? `${best[0]} (${best[1]})` : "—";
  };
  const feedback = [...people.entries()]
    .map(([id, rows]) => {
      const reg = rows.filter((r) => r.tipo === "regreso");
      const closedRows = rows.filter((r) => r.estado === "concretado" && r.limite && r.concretado);
      return {
        id,
        name: nameOf(id),
        regresos: reg.length,
        actualizaciones: rows.length - reg.length,
        share: regresos.length ? reg.length / regresos.length : 0,
        motivo: top(reg, (r) => r.motivo),
        etapa: top(reg, (r) => r.etapa),
        pendientes: rows.filter((r) => r.estado === "pendiente").length,
        aTiempo: closedRows.length
          ? closedRows.filter((r) => r.concretado! <= r.limite!).length / closedRows.length
          : null,
      };
    })
    .sort((a, b) => b.regresos - a.regresos || b.actualizaciones - a.actualizaciones);

  const vitalPeople = byPerson.filter((r) => r.vital);

  return (
    <div className="rgPareto">
      <div className="rgSegment rgPeriod" role="group" aria-label="Periodo">
        {PERIODS.map((p) => (
          <button key={p.key} className={period === p.key ? "active" : ""} aria-pressed={period === p.key} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="rgTiles">
        <div className="rgTile">
          <span>Regresos</span>
          <strong>{regresos.length}</strong>
          <em>{inPeriod.length ? pct(regresos.length / inPeriod.length) : "0%"} del total</em>
        </div>
        <div className="rgTile">
          <span>Actualizaciones</span>
          <strong>{actualizaciones.length}</strong>
          <em>por información del cliente</em>
        </div>
        <div className="rgTile">
          <span>Pendientes</span>
          <strong>{inPeriod.filter((r) => r.estado === "pendiente").length}</strong>
          <em>{overdue} vencidos</em>
        </div>
        <div className="rgTile">
          <span>Días para concretar</span>
          <strong>{avgDays === null ? "—" : avgDays.toFixed(1)}</strong>
          <em>promedio</em>
        </div>
        <div className="rgTile">
          <span>A tiempo</span>
          <strong>{withLimit.length ? pct(onTime / withLimit.length) : "—"}</strong>
          <em>de {withLimit.length} con fecha límite</em>
        </div>
      </div>

      {base.length > 0 && vitalPeople.length > 0 && (
        <p className="rgInsight">
          <strong>{vitalPeople.length}</strong> de {byPerson.length}{" "}
          {byPerson.length === 1 ? "persona concentra" : "personas concentran"} el{" "}
          <strong>{pct(vitalPeople[vitalPeople.length - 1].cumulative)}</strong> de los {baseLabel}:{" "}
          {vitalPeople.map((p) => nameOf(p.key)).join(", ")}. El motivo principal es{" "}
          <strong>{byMotivo[0]?.key}</strong> ({pct(byMotivo[0]?.share || 0)}).
        </p>
      )}

      <div className="rgParetoGrid">
        <ParetoCard title={`Por persona (${baseLabel} recibidos)`} rows={byPerson} label={nameOf} />
        <ParetoCard title="Por qué se pide" rows={byMotivo} label={(k) => k} />
        <ParetoCard title="Por etapa" rows={byEtapa} label={(k) => k} />

        <section className="rgCardBox">
          <header>
            <h3>Últimas 12 semanas</h3>
            <div className="rgLegend">
              <span><i className="rgSw rgSw-regreso" />Regresos</span>
              <span><i className="rgSw rgSw-actualizacion" />Actualizaciones</span>
            </div>
          </header>
          <div className="rgWeeks">
            {weekly.map((w) => (
              <div
                key={w.week}
                className="rgWeek"
                title={`Semana del ${fmtDate(w.week)}: ${w.regreso} regresos, ${w.actualizacion} actualizaciones`}
              >
                <div className="rgWeekBars">
                  <div className="rgWeekStack" style={{ height: `${((w.regreso + w.actualizacion) / weekMax) * 100}%` }}>
                    {w.actualizacion > 0 && <i className="rgSw-actualizacion" style={{ flexGrow: w.actualizacion }} />}
                    {w.regreso > 0 && <i className="rgSw-regreso" style={{ flexGrow: w.regreso }} />}
                  </div>
                </div>
                <span className="rgWeekTotal">{w.regreso + w.actualizacion || ""}</span>
                <span className="rgWeekLabel">{fmtDate(w.week).slice(0, -3)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rgCardBox">
        <header>
          <h3>Feedback por persona</h3>
          <p>Regresos que le llegaron a cada quien en el periodo, con su motivo y etapa más frecuentes.</p>
        </header>
        <div className="rgTableWrap">
          <table className="rgTable">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Regresos</th>
                <th>% del total</th>
                <th>Actualiz.</th>
                <th>Motivo más común</th>
                <th>Etapa más común</th>
                <th>Pendientes</th>
                <th>A tiempo</th>
              </tr>
            </thead>
            <tbody>
              {feedback.map((f) => (
                <tr key={f.id}>
                  <td>
                    <strong>{f.name}</strong>
                  </td>
                  <td>{f.regresos}</td>
                  <td>{f.regresos ? pct(f.share) : "—"}</td>
                  <td>{f.actualizaciones}</td>
                  <td>{f.regresos ? f.motivo : "—"}</td>
                  <td>{f.regresos ? f.etapa : "—"}</td>
                  <td>{f.pendientes}</td>
                  <td>{f.aTiempo === null ? "—" : pct(f.aTiempo)}</td>
                </tr>
              ))}
              {!feedback.length && (
                <tr>
                  <td colSpan={8} className="rgEmptyCell">
                    Sin registros en este periodo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/*
 * Barras horizontales ordenadas; las que suman el 80% van en
 * color y el resto en gris, con la línea de corte entre ambas.
 * Un solo eje: la cifra y el acumulado van como texto.
 */
function ParetoCard({
  title,
  rows,
  label,
}: {
  title: string;
  rows: ParetoRow[];
  label: (key: string) => string;
}) {
  const max = rows[0]?.count || 1;
  const cut = rows.findIndex((r) => !r.vital);

  return (
    <section className="rgCardBox">
      <header>
        <h3>{title}</h3>
        <p>En color: los que suman el 80%.</p>
      </header>
      {!rows.length ? (
        <p className="rgEmptyCell">Sin datos en este periodo.</p>
      ) : (
        <ol className="rgBars">
          {rows.slice(0, 10).map((r, i) => (
            <li key={r.key} className={`${r.vital ? "vital" : ""} ${i === cut ? "rgCut" : ""}`}>
              <span className="rgBarLabel" title={label(r.key)}>
                {label(r.key)}
              </span>
              <span className="rgBarTrack" title={`${r.count} · ${pct(r.share)} · acumulado ${pct(r.cumulative)}`}>
                <i style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <span className="rgBarValue">
                <strong>{r.count}</strong> <em>{pct(r.share)}</em>
              </span>
              <span className="rgBarCum">acum. {pct(r.cumulative)}</span>
            </li>
          ))}
          {rows.length > 10 && <li className="rgMore">+{rows.length - 10} más</li>}
        </ol>
      )}
    </section>
  );
}

/* ---------------- Equipo (solo Admin) ---------------- */

function TeamEditor({
  roster,
  celulas,
  onSaved,
}: {
  roster: Person[];
  celulas: Celula[];
  onSaved: (next: Person[]) => void;
}) {
  const [rows, setRows] = useState<Person[]>(roster);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setRows(roster), [roster]);

  const update = (i: number, patch: Partial<Person>) =>
    setRows((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function save() {
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/regresos/roster", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roster: rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo guardar");
      onSaved(json.roster);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rgCardBox">
      <header>
        <h3>Equipo</h3>
        <p>
          Nombres que aparecen en "Para quién va" y "Quién lo manda". El puesto decide en qué
          área sale cada quien. Quien tiene correo ve sus pendientes al entrar; puedes agregar
          personas sin acceso al hub solo para asignarles.
        </p>
      </header>
      <div className="rgTableWrap">
        <table className="rgTable rgTeam">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Célula</th>
              <th>Puesto</th>
              <th>Activo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.id || i} className={p.active ? "" : "rgInactive"}>
                <td>
                  <input value={p.name} onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td>
                  {roster.some((r) => r.id === p.id && r.email) ? (
                    <span className="rgMuted">{p.email}</span>
                  ) : (
                    <input value={p.email || ""} placeholder="(opcional)" onChange={(e) => update(i, { email: e.target.value })} />
                  )}
                </td>
                <td>
                  <select value={p.celula} onChange={(e) => update(i, { celula: e.target.value as Celula })}>
                    {celulas.map((c) => (
                      <option key={c} value={c}>
                        {CELULAS[c].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={p.puesto || ""}
                    onChange={(e) => update(i, { puesto: (e.target.value || undefined) as Puesto | undefined })}
                  >
                    <option value="">—</option>
                    {(Object.keys(PUESTO_LABELS) as Puesto[]).map((k) => (
                      <option key={k} value={k}>
                        {PUESTO_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="checkbox" checked={p.active} onChange={(e) => update(i, { active: e.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <div className="errorBanner rgFormError">{err}</div>}
      <div className="rgFormActions">
        <button
          className="rgBtn rgBtnGhost"
          onClick={() => setRows((prev) => [...prev, { id: "", name: "", celula: celulas[0], active: true }])}
        >
          + Agregar persona
        </button>
        <button className="rgBtn rgBtnPrimary" disabled={saving} onClick={save}>
          {saving ? "Guardando…" : "Guardar equipo"}
        </button>
      </div>
    </section>
  );
}
