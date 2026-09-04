"use client";

import { useEffect, useMemo, useState } from "react";

type Role =
  | "ADMIN"
  | "TL"
  | "PARALEGAL"
  | "PSYCH"
  | "ANALYST"
  | "MANAGER"
  | "COORDINATOR";

type CaseRow = Record<string, string> & {
  __row: string;
};

type User = {
  authenticated: boolean;
  email: string | null;
  role: Role | null;
};

type KpiType = "backlog" | "pending" | "future" | "none";

type ExpandedKpi =
  | "mgm-backlog"
  | "mgm-pending"
  | "mgm-future"
  | "psych-backlog"
  | "psych-pending"
  | "psych-future"
  | "paralegal-backlog"
  | "paralegal-pending"
  | "paralegal-future"
  | null;

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  TL: "Team Leader",
  PARALEGAL: "Paralegal",
  PSYCH: "Psych",
  ANALYST: "Analyst",
  MANAGER: "Manager",
  COORDINATOR: "Coordinator",
};

const norm = (s: string) =>
  s.trim().toUpperCase().replace(/\s+/g, " ");

const isStatus = (h: string) =>
  ["STATUS", "ESTATUS"].includes(norm(h));

const isDelivery = (h: string) =>
  [
    "FECHA DE ENTREGA",
    "FECHA ENTREGA",
    "DELIVERY DATE",
  ].includes(norm(h));

const isAssignment = (h: string) =>
  norm(h) === "PARALEGAL ASIGNADO";

const isLink = (h: string) =>
  norm(h).includes("LINK") || norm(h).includes("URL");

/* ====================================================
   FECHAS
==================================================== */

const parseDateOnly = (value: string): Date | null => {
  const raw = value.trim();

  if (!raw) return null;

  // YYYY-MM-DD
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3])
    );
  }

  // MM/DD/YYYY
  const slashMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (slashMatch) {
    return new Date(
      Number(slashMatch[3]),
      Number(slashMatch[1]) - 1,
      Number(slashMatch[2])
    );
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
};

const startOfWeek = (date: Date) => {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  result.setDate(result.getDate() + diff);

  return result;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const classifyDate = (date: Date): KpiType => {
  const today = new Date();
  const currentWeekStart = startOfWeek(today);
  const nextWeekStart = addDays(currentWeekStart, 7);

  if (date.getTime() < currentWeekStart.getTime()) {
    return "backlog";
  }

  if (
    date.getTime() >= currentWeekStart.getTime() &&
    date.getTime() < nextWeekStart.getTime()
  ) {
    return "pending";
  }

  if (date.getTime() >= nextWeekStart.getTime()) {
    return "future";
  }

  return "none";
};

/* ====================================================
   MGM
==================================================== */

const isMgmCaseType = (value: string) => {
  const type = norm(value);

  return ["DUE DATE", "NO DUE DATE", "NOID"].includes(type);
};

const isExcludedMgmStatus = (status: string) => {
  const value = norm(status);

  return [
    "MGM REVIEW",
    "SENT TO USCIS",
    "SPECIAL CASE",
    "CANCELLED/CLOSED",
  ].includes(value);
};

const getMgmKpi = (row: CaseRow): KpiType => {
  const caseType = row["DUE DATE/NO DUE DATE"] || "";

  if (!isMgmCaseType(caseType)) {
    return "none";
  }

  const status = row["STATUS"] || "";

  if (isExcludedMgmStatus(status)) {
    return "none";
  }

  const commitment = row["COMMITMENT"] || "";
  const commitmentDate = parseDateOnly(commitment);

  if (!commitmentDate) {
    return "none";
  }

  return classifyDate(commitmentDate);
};

/* ====================================================
   PSYCH
==================================================== */

const isExcludedPsychStatus = (status: string) => {
  const value = norm(status);

  return [
    "SPECIAL CASE",
    "NA",
    "N/A",
    "UNRESPONSIVE",
    "ON HOLD",
    "CANCELLED",
    "CANCELED",
    "CANCELLED/CLOSED",
  ].includes(value);
};

const getPsychKpi = (row: CaseRow): KpiType => {
  const status = row["DOE STATUS"] || "";

  if (isExcludedPsychStatus(status)) {
    return "none";
  }

  const done = row["DONE (doe)"] || "";

  if (done.trim()) {
    return "none";
  }

  const expected = row["EXPECTED DONE (doe)"] || "";
  const expectedDate = parseDateOnly(expected);

  if (!expectedDate) {
    return "none";
  }

  return classifyDate(expectedDate);
};

/* ====================================================
   PARALEGAL / 1ST DRAFT
==================================================== */

const isExcludedParalegalStatus = (status: string) => {
  const value = norm(status);

  return [
    "NA",
    "N/A",
    "UNRESPONSIVE",
    "CANCELLED/CLOSED",
    "CANCELLED",
    "CANCELED",
    "SPECIAL CASE",
  ].includes(value);
};

const getParalegalKpi = (row: CaseRow): KpiType => {
  /*
   * STATUS que no deben medirse.
   */
  const status = row["STATUS 1ST DRAFT"] || "";

  if (isExcludedParalegalStatus(status)) {
    return "none";
  }

  /*
   * Si ya tiene fecha de DONE,
   * el 1st Draft ya fue terminado.
   */
  const done = row["1ST DRAFT DONE"] || "";

  if (done.trim()) {
    return "none";
  }

  /*
   * Sin fecha esperada no entra al KPI.
   */
  const expected = row["1ST DRAFT EXP DONE"] || "";
  const expectedDate = parseDateOnly(expected);

  if (!expectedDate) {
    return "none";
  }

  return classifyDate(expectedDate);
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  const [data, setData] = useState<{
    headers: string[];
    rows: CaseRow[];
    title: string;
  }>({
    headers: [],
    rows: [],
    title: "",
  });

  const [q, setQ] = useState("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [expandedKpi, setExpandedKpi] =
    useState<ExpandedKpi>(null);

  /* ====================================================
     USUARIO
  ==================================================== */

  async function loadUser() {
    try {
      const r = await fetch("/api/auth/me", {
        cache: "no-store",
      });

      const j = await r.json();

      setUser(j);
    } catch {
      setUser({
        authenticated: false,
        email: null,
        role: null,
      });
    } finally {
      setLoadingUser(false);
    }
  }

  /* ====================================================
     CASOS
  ==================================================== */

  async function loadCases() {
    setLoadingCases(true);
    setErr("");

    try {
      const r = await fetch("/api/cases", {
        cache: "no-store",
      });

      const j = await r.json();

      if (!r.ok) {
        throw new Error(j.error || "Error loading cases");
      }

      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoadingCases(false);
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user?.authenticated) {
      loadCases();
    }
  }, [user]);

  /* ====================================================
     LOGIN
  ==================================================== */

  function login() {
    window.location.href = "/api/auth/login";
  }

  function logout() {
    window.location.href = "/api/auth/logout";
  }

  /* ====================================================
     PERMISOS ACTUALES
  ==================================================== */

  const canEdit = (header: string) => {
    if (!user?.role) {
      return false;
    }

    if (user.role === "ADMIN") {
      return true;
    }

    if (user.role === "TL") {
      return (
        isAssignment(header) ||
        isDelivery(header) ||
        isStatus(header)
      );
    }

    if (
      ["PARALEGAL", "PSYCH", "ANALYST"].includes(user.role)
    ) {
      return (
        isDelivery(header) ||
        isStatus(header) ||
        isLink(header)
      );
    }

    return false;
  };

  /* ====================================================
     BÚSQUEDA GENERAL
  ==================================================== */

  const rows = useMemo(() => {
    const search = q.toLowerCase();

    return data.rows.filter((r) => {
      if (!search) {
        return true;
      }

      return Object.entries(r).some(
        ([k, v]) =>
          k !== "__row" &&
          v.toLowerCase().includes(search)
      );
    });
  }, [data.rows, q]);

  /* ====================================================
     MGM STATS
  ==================================================== */

  const mgmStats = useMemo(() => {
    let backlog = 0;
    let pending = 0;
    let future = 0;

    data.rows.forEach((row) => {
      const kpi = getMgmKpi(row);

      if (kpi === "backlog") backlog++;
      if (kpi === "pending") pending++;
      if (kpi === "future") future++;
    });

    return {
      backlog,
      pending,
      future,
    };
  }, [data.rows]);

  /* ====================================================
     PSYCH STATS
  ==================================================== */

  const psychStats = useMemo(() => {
    let backlog = 0;
    let pending = 0;
    let future = 0;

    data.rows.forEach((row) => {
      const kpi = getPsychKpi(row);

      if (kpi === "backlog") backlog++;
      if (kpi === "pending") pending++;
      if (kpi === "future") future++;
    });

    return {
      backlog,
      pending,
      future,
    };
  }, [data.rows]);

  /* ====================================================
     PARALEGAL STATS
  ==================================================== */

  const paralegalStats = useMemo(() => {
    let backlog = 0;
    let pending = 0;
    let future = 0;

    data.rows.forEach((row) => {
      const kpi = getParalegalKpi(row);

      if (kpi === "backlog") backlog++;
      if (kpi === "pending") pending++;
      if (kpi === "future") future++;
    });

    return {
      backlog,
      pending,
      future,
    };
  }, [data.rows]);

  /* ====================================================
     DETALLE MGM
  ==================================================== */

  const mgmDetailType: KpiType | null =
    expandedKpi === "mgm-backlog"
      ? "backlog"
      : expandedKpi === "mgm-pending"
      ? "pending"
      : expandedKpi === "mgm-future"
      ? "future"
      : null;

  const mgmCases = useMemo(() => {
    if (!mgmDetailType) {
      return [];
    }

    return data.rows
      .filter((row) => getMgmKpi(row) === mgmDetailType)
      .map((row) => ({
        row: row.__row,
        client: row["CLIENTE"] || "Sin cliente",
        id: row["ID"] || "",
        caseType: row["DUE DATE/NO DUE DATE"] || "",
        commitment: row["COMMITMENT"] || "",
        status: row["STATUS"] || "",
      }))
      .sort((a, b) => {
        const dateA = parseDateOnly(a.commitment);
        const dateB = parseDateOnly(b.commitment);

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return dateA.getTime() - dateB.getTime();
      });
  }, [data.rows, mgmDetailType]);

  /* ====================================================
     DETALLE PSYCH
  ==================================================== */

  const psychDetailType: KpiType | null =
    expandedKpi === "psych-backlog"
      ? "backlog"
      : expandedKpi === "psych-pending"
      ? "pending"
      : expandedKpi === "psych-future"
      ? "future"
      : null;

  const psychCases = useMemo(() => {
    if (!psychDetailType) {
      return [];
    }

    return data.rows
      .filter((row) => getPsychKpi(row) === psychDetailType)
      .map((row) => ({
        row: row.__row,
        client: row["CLIENTE"] || "Sin cliente",
        id: row["ID"] || "",
        psych: row["PSYCH"] || "",
        status: row["DOE STATUS"] || "",
        expected: row["EXPECTED DONE (doe)"] || "",
        done: row["DONE (doe)"] || "",
        classValue: row["CLASS"] || "",
      }))
      .sort((a, b) => {
        const dateA = parseDateOnly(a.expected);
        const dateB = parseDateOnly(b.expected);

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return dateA.getTime() - dateB.getTime();
      });
  }, [data.rows, psychDetailType]);

  /* ====================================================
     DETALLE PARALEGAL
  ==================================================== */

  const paralegalDetailType: KpiType | null =
    expandedKpi === "paralegal-backlog"
      ? "backlog"
      : expandedKpi === "paralegal-pending"
      ? "pending"
      : expandedKpi === "paralegal-future"
      ? "future"
      : null;

  const paralegalCases = useMemo(() => {
    if (!paralegalDetailType) {
      return [];
    }

    return data.rows
      .filter(
        (row) =>
          getParalegalKpi(row) === paralegalDetailType
      )
      .map((row) => ({
        row: row.__row,
        client: row["CLIENTE"] || "Sin cliente",
        id: row["ID"] || "",
        paralegal: row["PARALEGAL"] || "",
        status: row["STATUS 1ST DRAFT"] || "",
        expected: row["1ST DRAFT EXP DONE"] || "",
        done: row["1ST DRAFT DONE"] || "",
        link: row["LINK INF AFFIDAVIT"] || "",
      }))
      .sort((a, b) => {
        const dateA = parseDateOnly(a.expected);
        const dateB = parseDateOnly(b.expected);

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return dateA.getTime() - dateB.getTime();
      });
  }, [data.rows, paralegalDetailType]);

  /* ====================================================
     GUARDAR
  ==================================================== */

  async function save(
    row: number,
    header: string,
    value: string
  ) {
    setMsg("");
    setErr("");

    try {
      const r = await fetch("/api/cases/update", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          row,
          role: user?.role,
          changes: {
            [header]: value,
          },
        }),
      });

      const j = await r.json();

      if (!r.ok) {
        throw new Error(j.error || "Could not save");
      }

      setData((prev) => ({
        ...prev,

        rows: prev.rows.map((r) =>
          Number(r.__row) === row
            ? {
                ...r,
                [header]: value,
              }
            : r
        ),
      }));

      setMsg(
        value === ""
          ? "Cambio guardado y campo borrado."
          : "Cambio guardado en Google Sheets."
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  /* ====================================================
     COMPONENTE DE TARJETA KPI
  ==================================================== */

  function KpiCard({
    section,
    title,
    value,
    description,
    expandedName,
  }: {
    section: string;
    title: string;
    value: number;
    description: string;
    expandedName: ExpandedKpi;
  }) {
    return (
      <div
        className="card"
        onDoubleClick={() =>
          setExpandedKpi(
            expandedKpi === expandedName
              ? null
              : expandedName
          )
        }
        style={{
          padding: 22,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <div className="muted">{section}</div>

        <div
          style={{
            marginTop: 8,
            fontWeight: 700,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: 4,
            fontSize: 34,
            fontWeight: 800,
          }}
        >
          {value}
        </div>

        <div className="muted">{description}</div>
      </div>
    );
  }

  /* ====================================================
     LOADING
  ==================================================== */

  if (loadingUser) {
    return (
      <main className="shell">
        <div className="card">
          <div className="empty">
            Verificando acceso…
          </div>
        </div>
      </main>
    );
  }

  /* ====================================================
     LOGIN
  ==================================================== */

  if (!user?.authenticated) {
    return (
      <>
        <header className="top">
          <div className="brand">ALPHA HUB</div>
        </header>

        <main className="shell">
          <div
            className="card"
            style={{
              maxWidth: 500,
              margin: "80px auto",
              textAlign: "center",
              padding: 40,
            }}
          >
            <h1>Welcome to Alpha Hub</h1>

            <p
              className="muted"
              style={{
                marginTop: 10,
                marginBottom: 30,
              }}
            >
              Sign in with your institutional Google
              account to continue.
            </p>

            <button className="btn" onClick={login}>
              Continue with Google
            </button>
          </div>
        </main>
      </>
    );
  }

  /* ====================================================
     HUB
  ==================================================== */

  return (
    <>
      <header className="top">
        <div className="brand">ALPHA HUB</div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div className="pill">
            {roleLabels[user.role as Role]}
          </div>

          <span className="muted">{user.email}</span>

          <button
            className="btn btnGhost"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="shell">
        {/* =================================================
            MGM
        ================================================= */}

        <div
          style={{
            marginBottom: 10,
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          Entregas MGM
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <KpiCard
            section="ENTREGAS MGM"
            title="Backlog"
            value={mgmStats.backlog}
            description="Commitment anterior"
            expandedName="mgm-backlog"
          />

          <KpiCard
            section="ENTREGAS MGM"
            title="Pendientes"
            value={mgmStats.pending}
            description="Commitment de esta semana"
            expandedName="mgm-pending"
          />

          <KpiCard
            section="ENTREGAS MGM"
            title="Próximas entregas"
            value={mgmStats.future}
            description="Commitment futuro"
            expandedName="mgm-future"
          />
        </div>

        {mgmDetailType && (
          <div
            className="card"
            style={{
              marginBottom: 24,
              padding: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                  }}
                >
                  {mgmDetailType === "backlog"
                    ? "Backlog MGM"
                    : mgmDetailType === "pending"
                    ? "Pendientes MGM"
                    : "Próximas entregas MGM"}
                </div>

                <div className="muted">
                  {mgmCases.length} caso
                  {mgmCases.length === 1 ? "" : "s"}
                </div>
              </div>

              <button
                className="btn btnGhost"
                onClick={() => setExpandedKpi(null)}
              >
                Cerrar
              </button>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>ID</th>
                    <th>Tipo</th>
                    <th>Commitment</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {mgmCases.map((item) => (
                    <tr key={item.row}>
                      <td>
                        <strong>{item.client}</strong>
                      </td>
                      <td>{item.id || "—"}</td>
                      <td>{item.caseType || "—"}</td>
                      <td>{item.commitment || "—"}</td>
                      <td>{item.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================
            PSYCH
        ================================================= */}

        <div
          style={{
            marginTop: 28,
            marginBottom: 10,
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          Psych
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <KpiCard
            section="PSYCH"
            title="Backlog"
            value={psychStats.backlog}
            description="Expected Done anterior"
            expandedName="psych-backlog"
          />

          <KpiCard
            section="PSYCH"
            title="Pendientes"
            value={psychStats.pending}
            description="Expected Done de esta semana"
            expandedName="psych-pending"
          />

          <KpiCard
            section="PSYCH"
            title="Próximas entregas"
            value={psychStats.future}
            description="Expected Done futuro"
            expandedName="psych-future"
          />
        </div>

        {psychDetailType && (
          <div
            className="card"
            style={{
              marginBottom: 24,
              padding: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                  }}
                >
                  {psychDetailType === "backlog"
                    ? "Backlog Psych"
                    : psychDetailType === "pending"
                    ? "Pendientes Psych"
                    : "Próximas entregas Psych"}
                </div>

                <div className="muted">
                  {psychCases.length} caso
                  {psychCases.length === 1 ? "" : "s"}
                </div>
              </div>

              <button
                className="btn btnGhost"
                onClick={() => setExpandedKpi(null)}
              >
                Cerrar
              </button>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>ID</th>
                    <th>Psych</th>
                    <th>DOE Status</th>
                    <th>Expected Done</th>
                    <th>Done</th>
                    <th>Class</th>
                  </tr>
                </thead>

                <tbody>
                  {psychCases.map((item) => (
                    <tr key={item.row}>
                      <td>
                        <strong>{item.client}</strong>
                      </td>
                      <td>{item.id || "—"}</td>
                      <td>{item.psych || "—"}</td>
                      <td>{item.status || "—"}</td>
                      <td>{item.expected || "—"}</td>
                      <td>{item.done || "—"}</td>
                      <td>{item.classValue || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================
            PARALEGAL / 1ST DRAFT
        ================================================= */}

        <div
          style={{
            marginTop: 28,
            marginBottom: 10,
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          Paralegal · 1st Draft
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <KpiCard
            section="1ST DRAFT"
            title="Backlog"
            value={paralegalStats.backlog}
            description="Expected Done anterior"
            expandedName="paralegal-backlog"
          />

          <KpiCard
            section="1ST DRAFT"
            title="Pendientes"
            value={paralegalStats.pending}
            description="Expected Done de esta semana"
            expandedName="paralegal-pending"
          />

          <KpiCard
            section="1ST DRAFT"
            title="Próximas entregas"
            value={paralegalStats.future}
            description="Expected Done futuro"
            expandedName="paralegal-future"
          />
        </div>

        {paralegalDetailType && (
          <div
            className="card"
            style={{
              marginBottom: 24,
              padding: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                  }}
                >
                  {paralegalDetailType === "backlog"
                    ? "Backlog Paralegal · 1st Draft"
                    : paralegalDetailType === "pending"
                    ? "Pendientes Paralegal · 1st Draft"
                    : "Próximas entregas Paralegal · 1st Draft"}
                </div>

                <div className="muted">
                  {paralegalCases.length} caso
                  {paralegalCases.length === 1 ? "" : "s"}
                </div>
              </div>

              <button
                className="btn btnGhost"
                onClick={() => setExpandedKpi(null)}
              >
                Cerrar
              </button>
            </div>

            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>ID</th>
                    <th>Paralegal</th>
                    <th>Status 1st Draft</th>
                    <th>Expected Done</th>
                    <th>1st Draft Done</th>
                    <th>Link Inf Affidavit</th>
                  </tr>
                </thead>

                <tbody>
                  {paralegalCases.map((item) => (
                    <tr key={item.row}>
                      <td>
                        <strong>{item.client}</strong>
                      </td>

                      <td>{item.id || "—"}</td>

                      <td>{item.paralegal || "—"}</td>

                      <td>{item.status || "—"}</td>

                      <td>{item.expected || "—"}</td>

                      <td>{item.done || "—"}</td>

                      <td>
                        {item.link ? (
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir link
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =================================================
            TABLA GENERAL
        ================================================= */}

        <div
          style={{
            marginTop: 30,
            marginBottom: 10,
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          Casos
        </div>

        <div className="card">
          <div className="toolbar">
            <input
              placeholder="Buscar caso, nombre, ID..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            <button
              className="btn btnGhost"
              onClick={loadCases}
            >
              Actualizar
            </button>

            <span className="muted">
              {data.title
                ? `Hoja: ${data.title} · ${rows.length} casos`
                : ""}
            </span>
          </div>

          {err && <div className="error">{err}</div>}

          {msg && <div className="ok">{msg}</div>}

          {loadingCases ? (
            <div className="empty">
              Cargando casos…
            </div>
          ) : !data.headers.length ? (
            <div className="empty">
              No se encontraron columnas en la Sheet.
            </div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    {data.headers.map((h, index) => (
                      <th key={`${h}-${index}`}>{h}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => (
                    <tr key={r.__row}>
                      {data.headers.map((h, index) => (
                        <td key={`${h}-${index}`}>
                          {canEdit(h) ? (
                            <input
                              className="editable"
                              value={r[h] || ""}
                              onChange={(e) => {
                                const value = e.target.value;

                                setData((prev) => ({
                                  ...prev,

                                  rows: prev.rows.map(
                                    (rowData) =>
                                      rowData.__row === r.__row
                                        ? {
                                            ...rowData,
                                            [h]: value,
                                          }
                                        : rowData
                                  ),
                                }));
                              }}
                              onBlur={(e) => {
                                const newValue = e.target.value;
                                const oldValue = r[h] || "";

                                if (newValue !== oldValue) {
                                  save(
                                    Number(r.__row),
                                    h,
                                    newValue
                                  );
                                }
                              }}
                            />
                          ) : (
                            <span>{r[h] || "—"}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p
          className="muted"
          style={{
            marginTop: 14,
          }}
        >
          Usuario: {user.email} · Rol: {user.role}
        </p>
      </main>
    </>
  );
}
