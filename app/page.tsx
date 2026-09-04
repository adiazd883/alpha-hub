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
  norm(h).includes("LINK") ||
  norm(h).includes("URL");

/*
====================================================
KPI ENTREGAS MGM
====================================================
*/

const isMgmCaseType = (value: string) => {
  const type = norm(value);

  return [
    "DUE DATE",
    "NO DUE DATE",
    "NOID",
  ].includes(type);
};

const isMgmDelivered = (status: string) => {
  const value = norm(status);

  return [
    "MGM REVIEW",
    "SENT TO USCIS",
  ].includes(value);
};

const parseDateOnly = (value: string): Date | null => {
  const raw = value.trim();

  if (!raw) {
    return null;
  }

  /*
   * Google Sheets puede devolver fechas en diferentes formatos.
   * Primero intentamos YYYY-MM-DD.
   */
  const isoMatch = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})/
  );

  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);

    return new Date(
      year,
      month - 1,
      day
    );
  }

  /*
   * También soportamos MM/DD/YYYY
   */
  const slashMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (slashMatch) {
    const first = Number(slashMatch[1]);
    const second = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);

    /*
     * En este HUB tratamos las fechas con slash
     * como MM/DD/YYYY cuando vienen así de Google Sheets.
     */
    return new Date(
      year,
      first - 1,
      second
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

  /*
   * JavaScript:
   * domingo = 0
   * lunes = 1
   *
   * Convertimos la semana a lunes-domingo.
   */
  const diff =
    day === 0 ? -6 : 1 - day;

  result.setDate(
    result.getDate() + diff
  );

  return result;
};

const addDays = (
  date: Date,
  days: number
) => {
  const result = new Date(date);
  result.setDate(
    result.getDate() + days
  );
  return result;
};

const isBefore = (
  a: Date,
  b: Date
) => a.getTime() < b.getTime();

const isOnOrAfter = (
  a: Date,
  b: Date
) => a.getTime() >= b.getTime();

const getMgmKpi = (
  row: CaseRow
) => {
  const caseType =
    row["DUE DATE/NO DUE DATE"] || "";

  /*
   * WAIVER / MTR / DECISION quedan fuera.
   */
  if (!isMgmCaseType(caseType)) {
    return "none";
  }

  /*
   * Si ya fue entregado a MGM o USCIS,
   * no cuenta como backlog/pending/future.
   */
  const status =
    row["STATUS"] || "";

  if (isMgmDelivered(status)) {
    return "none";
  }

  /*
   * Sin commitment no podemos medirlo.
   */
  const commitment =
    row["COMMITMENT"] || "";

  const commitmentDate =
    parseDateOnly(commitment);

  if (!commitmentDate) {
    return "none";
  }

  const today = new Date();

  const currentWeekStart =
    startOfWeek(today);

  const nextWeekStart =
    addDays(currentWeekStart, 7);

  /*
   * Semana anterior o cualquier fecha
   * anterior al lunes de esta semana.
   */
  if (
    isBefore(
      commitmentDate,
      currentWeekStart
    )
  ) {
    return "backlog";
  }

  /*
   * Lunes-domingo de la semana actual.
   */
  if (
    isOnOrAfter(
      commitmentDate,
      currentWeekStart
    ) &&
    isBefore(
      commitmentDate,
      nextWeekStart
    )
  ) {
    return "pending";
  }

  /*
   * Próximas semanas.
   */
  if (
    isOnOrAfter(
      commitmentDate,
      nextWeekStart
    )
  ) {
    return "future";
  }

  return "none";
};

export default function Home() {
  const [user, setUser] =
    useState<User | null>(null);

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

  const [loadingUser, setLoadingUser] =
    useState(true);

  const [loadingCases, setLoadingCases] =
    useState(false);

  const [msg, setMsg] = useState("");

  const [err, setErr] = useState("");

  /*
  ==================================================
  OBTENER USUARIO
  ==================================================
  */

  async function loadUser() {
    try {
      const r = await fetch(
        "/api/auth/me",
        {
          cache: "no-store",
        }
      );

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

  /*
  ==================================================
  CARGAR CASOS
  ==================================================
  */

  async function loadCases() {
    setLoadingCases(true);
    setErr("");

    try {
      const r = await fetch(
        "/api/cases",
        {
          cache: "no-store",
        }
      );

      const j = await r.json();

      if (!r.ok) {
        throw new Error(
          j.error ||
            "Error loading cases"
        );
      }

      setData(j);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : "Error"
      );
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

  /*
  ==================================================
  LOGIN
  ==================================================
  */

  function login() {
    window.location.href =
      "/api/auth/login";
  }

  function logout() {
    window.location.href =
      "/api/auth/logout";
  }

  /*
  ==================================================
  PERMISOS
  ==================================================
  */

  const canEdit = (
    header: string
  ) => {
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
      [
        "PARALEGAL",
        "PSYCH",
        "ANALYST",
      ].includes(user.role)
    ) {
      return (
        isDelivery(header) ||
        isStatus(header) ||
        isLink(header)
      );
    }

    return false;
  };

  /*
  ==================================================
  FILTRO DE BÚSQUEDA
  ==================================================
  */

  const rows = useMemo(() => {
    const search =
      q.toLowerCase();

    return data.rows.filter(
      (r) => {
        if (!search) {
          return true;
        }

        return Object.entries(
          r
        ).some(
          ([k, v]) =>
            k !== "__row" &&
            v
              .toLowerCase()
              .includes(search)
        );
      }
    );
  }, [data.rows, q]);

  /*
  ==================================================
  KPIs MGM
  ==================================================
  */

  const mgmStats = useMemo(() => {
    let backlog = 0;
    let pending = 0;
    let future = 0;

    data.rows.forEach((row) => {
      const kpi =
        getMgmKpi(row);

      if (kpi === "backlog") {
        backlog++;
      }

      if (kpi === "pending") {
        pending++;
      }

      if (kpi === "future") {
        future++;
      }
    });

    return {
      backlog,
      pending,
      future,
    };
  }, [data.rows]);

  /*
  ==================================================
  GUARDAR CAMBIO
  ==================================================
  */

  async function save(
    row: number,
    header: string,
    value: string
  ) {
    setMsg("");
    setErr("");

    try {
      const r = await fetch(
        "/api/cases/update",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            row,
            role: user?.role,
            changes: {
              [header]: value,
            },
          }),
        }
      );

      const j = await r.json();

      if (!r.ok) {
        throw new Error(
          j.error ||
            "Could not save"
        );
      }

      setData((prev) => ({
        ...prev,
        rows: prev.rows.map(
          (r) =>
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
      setErr(
        e instanceof Error
          ? e.message
          : "Error"
      );
    }
  }

  /*
  ==================================================
  PANTALLA DE CARGA
  ==================================================
  */

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

  /*
  ==================================================
  LOGIN
  ==================================================
  */

  if (!user?.authenticated) {
    return (
      <>
        <header className="top">
          <div className="brand">
            ALPHA HUB
          </div>
        </header>

        <main className="shell">
          <div
            className="card"
            style={{
              maxWidth: 500,
              margin:
                "80px auto",
              textAlign:
                "center",
              padding: 40,
            }}
          >
            <h1>
              Welcome to Alpha Hub
            </h1>

            <p
              className="muted"
              style={{
                marginTop: 10,
                marginBottom: 30,
              }}
            >
              Sign in with your
              institutional
              Google account
              to continue.
            </p>

            <button
              className="btn"
              onClick={login}
            >
              Continue with Google
            </button>
          </div>
        </main>
      </>
    );
  }

  /*
  ==================================================
  HUB
  ==================================================
  */

  return (
    <>
      <header className="top">
        <div className="brand">
          ALPHA HUB
        </div>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap: 12,
          }}
        >
          <div className="pill">
            {
              roleLabels[
                user.role as Role
              ]
            }
          </div>

          <span className="muted">
            {user.email}
          </span>

          <button
            className="btn btnGhost"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </header>

      <main className="shell">

        {/* =========================================
            KPI DASHBOARD
        ========================================= */}

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: 16,
            marginBottom: 20,
          }}
        >

          {/* BACKLOG */}

          <div
            className="card"
            style={{
              padding: 22,
            }}
          >
            <div
              className="muted"
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform:
                  "uppercase",
                letterSpacing:
                  ".06em",
              }}
            >
              Entregas MGM
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Backlog
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {
                mgmStats.backlog
              }
            </div>

            <div
              className="muted"
              style={{
                marginTop: 8,
              }}
            >
              Commitment anterior
            </div>
          </div>

          {/* PENDIENTES */}

          <div
            className="card"
            style={{
              padding: 22,
            }}
          >
            <div
              className="muted"
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform:
                  "uppercase",
                letterSpacing:
                  ".06em",
              }}
            >
              Entregas MGM
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Pendientes
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {
                mgmStats.pending
              }
            </div>

            <div
              className="muted"
              style={{
                marginTop: 8,
              }}
            >
              Commitment de esta semana
            </div>
          </div>

          {/* PRÓXIMAS */}

          <div
            className="card"
            style={{
              padding: 22,
            }}
          >
            <div
              className="muted"
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform:
                  "uppercase",
                letterSpacing:
                  ".06em",
              }}
            >
              Entregas MGM
            </div>

            <div
              style={{
                marginTop: 8,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              Próximas entregas
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {
                mgmStats.future
              }
            </div>

            <div
              className="muted"
              style={{
                marginTop: 8,
              }}
            >
              Commitment futuro
            </div>
          </div>

        </div>

        {/* =========================================
            TABLA
        ========================================= */}

        <div className="card">

          <div className="toolbar">

            <input
              placeholder="Buscar caso, nombre, ID..."
              value={q}
              onChange={(e) =>
                setQ(
                  e.target.value
                )
              }
            />

            <button
              className="btn btnGhost"
              onClick={
                loadCases
              }
            >
              Actualizar
            </button>

            <span className="muted">
              {data.title
                ? `Hoja: ${data.title} · ${rows.length} casos`
                : ""}
            </span>

          </div>

          {err && (
            <div className="error">
              {err}
            </div>
          )}

          {msg && (
            <div className="ok">
              {msg}
            </div>
          )}

          {loadingCases ? (
            <div className="empty">
              Cargando casos…
            </div>
          ) : !data
              .headers
              .length ? (
            <div className="empty">
              No se encontraron
              columnas en la
              Sheet.
            </div>
          ) : (
            <div className="tableWrap">

              <table className="table">

                <thead>
                  <tr>
                    {data.headers.map(
                      (h) => (
                        <th
                          key={h}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>

                  {rows.map(
                    (r) => (
                      <tr
                        key={
                          r.__row
                        }
                      >

                        {data.headers.map(
                          (h) => (
                            <td
                              key={
                                h
                              }
                            >

                              {canEdit(
                                h
                              ) ? (
                                <input
                                  className="editable"
                                  value={
                                    r[
                                      h
                                    ] ||
                                    ""
                                  }
                                  onChange={(
                                    e
                                  ) => {
                                    const value =
                                      e
                                        .target
                                        .value;

                                    setData(
                                      (
                                        prev
                                      ) => ({
                                        ...prev,
                                        rows:
                                          prev.rows.map(
                                            (
                                              rowData
                                            ) =>
                                              rowData.__row ===
                                              r.__row
                                                ? {
                                                    ...rowData,
                                                    [h]:
                                                      value,
                                                  }
                                                : rowData
                                          ),
                                      })
                                    );
                                  }}
                                  onBlur={(
                                    e
                                  ) => {
                                    const newValue =
                                      e
                                        .target
                                        .value;

                                    const oldValue =
                                      r[
                                        h
                                      ] ||
                                      "";

                                    if (
                                      newValue !==
                                      oldValue
                                    ) {
                                      save(
                                        Number(
                                          r.__row
                                        ),
                                        h,
                                        newValue
                                      );
                                    }
                                  }}
                                />
                              ) : (
                                <span>
                                  {r[
                                    h
                                  ] ||
                                    "—"}
                                </span>
                              )}

                            </td>
                          )
                        )}

                      </tr>
                    )
                  )}

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
          Usuario:{" "}
          {user.email} · Rol:{" "}
          {user.role}
        </p>

      </main>
    </>
  );
}
