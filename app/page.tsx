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

type MgmKpiType =
  | "backlog"
  | "pending"
  | "future"
  | "none";

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

const isExcludedMgmStatus = (
  status: string
) => {
  const value = norm(status);

  return [
    "MGM REVIEW",
    "SENT TO USCIS",
    "SPECIAL CASE",
    "CANCELLED/CLOSED",
  ].includes(value);
};

const parseDateOnly = (
  value: string
): Date | null => {
  const raw = value.trim();

  if (!raw) {
    return null;
  }

  // YYYY-MM-DD
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

  // MM/DD/YYYY
  const slashMatch = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const year = Number(slashMatch[3]);

    return new Date(
      year,
      month - 1,
      day
    );
  }

  const parsed = new Date(raw);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
};

const startOfWeek = (
  date: Date
) => {
  const result = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  const day =
    result.getDay();

  // Semana lunes-domingo
  const diff =
    day === 0
      ? -6
      : 1 - day;

  result.setDate(
    result.getDate() + diff
  );

  return result;
};

const addDays = (
  date: Date,
  days: number
) => {
  const result =
    new Date(date);

  result.setDate(
    result.getDate() + days
  );

  return result;
};

const getMgmKpi = (
  row: CaseRow
): MgmKpiType => {
  const caseType =
    row["DUE DATE/NO DUE DATE"] || "";

  /*
   * Solo entran:
   * DUE DATE
   * NO DUE DATE
   * NOID
   *
   * WAIVER / MTR / DECISION
   * quedan fuera.
   */
  if (
    !isMgmCaseType(
      caseType
    )
  ) {
    return "none";
  }

  /*
   * Estos status no cuentan
   * para backlog / pending / future.
   */
  const status =
    row["STATUS"] || "";

  if (
    isExcludedMgmStatus(
      status
    )
  ) {
    return "none";
  }

  /*
   * Sin commitment
   * no se mide.
   */
  const commitment =
    row["COMMITMENT"] || "";

  const commitmentDate =
    parseDateOnly(
      commitment
    );

  if (!commitmentDate) {
    return "none";
  }

  const today =
    new Date();

  const currentWeekStart =
    startOfWeek(today);

  const nextWeekStart =
    addDays(
      currentWeekStart,
      7
    );

  /*
   * Cualquier fecha anterior
   * al lunes de esta semana
   * es BACKLOG.
   */
  if (
    commitmentDate.getTime() <
    currentWeekStart.getTime()
  ) {
    return "backlog";
  }

  /*
   * Esta semana
   * lunes-domingo.
   */
  if (
    commitmentDate.getTime() >=
      currentWeekStart.getTime() &&
    commitmentDate.getTime() <
      nextWeekStart.getTime()
  ) {
    return "pending";
  }

  /*
   * Desde el próximo lunes
   * hacia adelante.
   */
  if (
    commitmentDate.getTime() >=
    nextWeekStart.getTime()
  ) {
    return "future";
  }

  return "none";
};

export default function Home() {
  const [user, setUser] =
    useState<User | null>(
      null
    );

  const [data, setData] =
    useState<{
      headers: string[];
      rows: CaseRow[];
      title: string;
    }>({
      headers: [],
      rows: [],
      title: "",
    });

  const [q, setQ] =
    useState("");

  const [
    loadingUser,
    setLoadingUser,
  ] = useState(true);

  const [
    loadingCases,
    setLoadingCases,
  ] = useState(false);

  const [msg, setMsg] =
    useState("");

  const [err, setErr] =
    useState("");

  const [
    expandedKpi,
    setExpandedKpi,
  ] = useState<
    | "backlog"
    | "pending"
    | "future"
    | null
  >(null);

  /*
  ==================================================
  OBTENER USUARIO
  ==================================================
  */

  async function loadUser() {
    try {
      const r =
        await fetch(
          "/api/auth/me",
          {
            cache:
              "no-store",
          }
        );

      const j =
        await r.json();

      setUser(j);
    } catch {
      setUser({
        authenticated:
          false,
        email: null,
        role: null,
      });
    } finally {
      setLoadingUser(
        false
      );
    }
  }

  /*
  ==================================================
  CARGAR CASOS
  ==================================================
  */

  async function loadCases() {
    setLoadingCases(
      true
    );

    setErr("");

    try {
      const r =
        await fetch(
          "/api/cases",
          {
            cache:
              "no-store",
          }
        );

      const j =
        await r.json();

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
      setLoadingCases(
        false
      );
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (
      user?.authenticated
    ) {
      loadCases();
    }
  }, [user]);

  /*
  ==================================================
  LOGIN / LOGOUT
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

    if (
      user.role ===
      "ADMIN"
    ) {
      return true;
    }

    if (
      user.role ===
      "TL"
    ) {
      return (
        isAssignment(
          header
        ) ||
        isDelivery(
          header
        ) ||
        isStatus(header)
      );
    }

    if (
      [
        "PARALEGAL",
        "PSYCH",
        "ANALYST",
      ].includes(
        user.role
      )
    ) {
      return (
        isDelivery(
          header
        ) ||
        isStatus(
          header
        ) ||
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

  const rows =
    useMemo(() => {
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
              k !==
                "__row" &&
              v
                .toLowerCase()
                .includes(
                  search
                )
          );
        }
      );
    }, [data.rows, q]);

  /*
  ==================================================
  KPI MGM - CONTADORES
  ==================================================
  */

  const mgmStats =
    useMemo(() => {
      let backlog = 0;
      let pending = 0;
      let future = 0;

      data.rows.forEach(
        (row) => {
          const kpi =
            getMgmKpi(
              row
            );

          if (
            kpi ===
            "backlog"
          ) {
            backlog++;
          }

          if (
            kpi ===
            "pending"
          ) {
            pending++;
          }

          if (
            kpi ===
            "future"
          ) {
            future++;
          }
        }
      );

      return {
        backlog,
        pending,
        future,
      };
    }, [data.rows]);

  /*
  ==================================================
  KPI MGM - CASOS DEL DETALLE
  ==================================================
  */

  const mgmCases =
    useMemo(() => {
      if (
        !expandedKpi
      ) {
        return [];
      }

      return data.rows
        .filter(
          (row) =>
            getMgmKpi(
              row
            ) ===
            expandedKpi
        )
        .map((row) => ({
          row:
            row.__row,
          client:
            row[
              "CLIENTE"
            ] ||
            "Sin cliente",
          id:
            row["ID"] ||
            "",
          commitment:
            row[
              "COMMITMENT"
            ] ||
            "Sin fecha",
          status:
            row[
              "STATUS"
            ] ||
            "",
          caseType:
            row[
              "DUE DATE/NO DUE DATE"
            ] ||
            "",
        }))
        .sort(
          (a, b) => {
            const dateA =
              parseDateOnly(
                a.commitment
              );

            const dateB =
              parseDateOnly(
                b.commitment
              );

            if (
              !dateA &&
              !dateB
            ) {
              return 0;
            }

            if (!dateA) {
              return 1;
            }

            if (!dateB) {
              return -1;
            }

            return (
              dateA.getTime() -
              dateB.getTime()
            );
          }
        );
    }, [
      data.rows,
      expandedKpi,
    ]);

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
      const r =
        await fetch(
          "/api/cases/update",
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                {
                  row,
                  role:
                    user?.role,
                  changes:
                    {
                      [header]:
                        value,
                    },
                }
              ),
          }
        );

      const j =
        await r.json();

      if (!r.ok) {
        throw new Error(
          j.error ||
            "Could not save"
        );
      }

      setData(
        (prev) => ({
          ...prev,
          rows:
            prev.rows.map(
              (r) =>
                Number(
                  r.__row
                ) ===
                row
                  ? {
                      ...r,
                      [header]:
                        value,
                    }
                  : r
            ),
        })
      );

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
  CARGANDO USUARIO
  ==================================================
  */

  if (
    loadingUser
  ) {
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

  if (
    !user?.authenticated
  ) {
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
              maxWidth:
                500,
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
                marginTop:
                  10,
                marginBottom:
                  30,
              }}
            >
              Sign in with your institutional
              Google account to continue.
            </p>

            <button
              className="btn"
              onClick={
                login
              }
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
            onClick={
              logout
            }
          >
            Log out
          </button>
        </div>
      </header>

      <main className="shell">

        <div
          style={{
            marginBottom:
              10,
            fontWeight:
              800,
            fontSize: 18,
          }}
        >
          Entregas MGM
        </div>

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",
            gap: 16,
            marginBottom:
              20,
          }}
        >

          <div
            className="card"
            onDoubleClick={() =>
              setExpandedKpi(
                expandedKpi ===
                  "backlog"
                  ? null
                  : "backlog"
              )
            }
            style={{
              padding: 22,
              cursor:
                "pointer",
              userSelect:
                "none",
            }}
          >
            <div
              className="muted"
              style={{
                fontSize:
                  12,
                fontWeight:
                  700,
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
                fontWeight:
                  700,
              }}
            >
              Backlog
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 34,
                fontWeight:
                  800,
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

          <div
            className="card"
            onDoubleClick={() =>
              setExpandedKpi(
                expandedKpi ===
                  "pending"
                  ? null
                  : "pending"
              )
            }
            style={{
              padding: 22,
              cursor:
                "pointer",
              userSelect:
                "none",
            }}
          >
            <div
              className="muted"
              style={{
                fontSize:
                  12,
                fontWeight:
                  700,
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
                fontWeight:
                  700,
              }}
            >
              Pendientes
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 34,
                fontWeight:
                  800,
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

          <div
            className="card"
            onDoubleClick={() =>
              setExpandedKpi(
                expandedKpi ===
                  "future"
                  ? null
                  : "future"
              )
            }
            style={{
              padding: 22,
              cursor:
                "pointer",
              userSelect:
                "none",
            }}
          >
            <div
              className="muted"
              style={{
                fontSize:
                  12,
                fontWeight:
                  700,
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
                fontWeight:
                  700,
              }}
            >
              Próximas entregas
            </div>

            <div
              style={{
                marginTop: 4,
                fontSize: 34,
                fontWeight:
                  800,
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

        {expandedKpi && (
          <div
            className="card"
            style={{
              marginBottom:
                20,
              padding: 20,
            }}
          >
            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                gap: 12,
                marginBottom:
                  14,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize:
                      18,
                    fontWeight:
                      800,
                  }}
                >
                  {expandedKpi ===
                  "backlog"
                    ? "Backlog MGM"
                    : expandedKpi ===
                      "pending"
                    ? "Pendientes MGM"
                    : "Próximas entregas MGM"}
                </div>

                <div
                  className="muted"
                  style={{
                    marginTop:
                      4,
                  }}
                >
                  {
                    mgmCases.length
                  }{" "}
                  caso
                  {mgmCases.length ===
                  1
                    ? ""
                    : "s"}
                </div>
              </div>

              <button
                className="btn btnGhost"
                onClick={() =>
                  setExpandedKpi(
                    null
                  )
                }
              >
                Cerrar
              </button>
            </div>

            {mgmCases.length ===
            0 ? (
              <div className="empty">
                No hay casos en esta categoría.
              </div>
            ) : (
              <div
                style={{
                  overflowX:
                    "auto",
                }}
              >
                <table
                  className="table"
                  style={{
                    minWidth:
                      700,
                  }}
                >
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
                    {mgmCases.map(
                      (item) => (
                        <tr
                          key={
                            item.row
                          }
                        >
                          <td
                            style={{
                              fontWeight:
                                700,
                            }}
                          >
                            {
                              item.client
                            }
                          </td>

                          <td>
                            {item.id ||
                              "—"}
                          </td>

                          <td>
                            {item.caseType ||
                              "—"}
                          </td>

                          <td>
                            {
                              item.commitment
                            }
                          </td>

                          <td>
                            {item.status ||
                              "—"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
          ) : !data.headers
              .length ? (
            <div className="empty">
              No se encontraron columnas en la Sheet.
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
                                  {r[h] || "—"}
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
            marginTop:
              14,
          }}
        >
          Usuario: {user.email} · Rol: {user.role}
        </p>

      </main>
    </>
  );
}
