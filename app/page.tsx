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

  const [loadingUser, setLoadingUser] =
    useState(true);

  const [loadingCases, setLoadingCases] =
    useState(false);

  const [msg, setMsg] = useState("");

  const [err, setErr] = useState("");

  // --------------------------------------------------
  // OBTENER USUARIO
  // --------------------------------------------------

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

  // --------------------------------------------------
  // CARGAR CASOS
  // --------------------------------------------------

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
          j.error || "Error loading cases"
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

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

  function login() {
    window.location.href =
      "/api/auth/login";
  }

  function logout() {
    window.location.href =
      "/api/auth/logout";
  }

  // --------------------------------------------------
  // PERMISOS
  // --------------------------------------------------

  const canEdit = (header: string) => {
    if (!user?.role) {
      return false;
    }

    // ADMIN puede editar absolutamente todo
    if (user.role === "ADMIN") {
      return true;
    }

    // TL puede asignar, cambiar fecha y status
    if (user.role === "TL") {
      return (
        isAssignment(header) ||
        isDelivery(header) ||
        isStatus(header)
      );
    }

    // Paralegal / Psych / Analyst
    // pueden modificar fecha, status y links
    if (
      ["PARALEGAL", "PSYCH", "ANALYST"].includes(
        user.role
      )
    ) {
      return (
        isDelivery(header) ||
        isStatus(header) ||
        isLink(header)
      );
    }

    // Manager y Coordinator:
    // solo lectura
    return false;
  };

  // --------------------------------------------------
  // FILTRO
  // --------------------------------------------------

  const rows = useMemo(() => {
    const search = q.toLowerCase();

    return data.rows.filter((r) => {
      if (!search) {
        return true;
      }

      return Object.entries(r).some(
        ([k, v]) =>
          k !== "__row" &&
          v
            .toLowerCase()
            .includes(search)
      );
    });
  }, [data.rows, q]);

  // --------------------------------------------------
  // GUARDAR CAMBIO
  // --------------------------------------------------

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
          j.error || "Could not save"
        );
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
      setErr(
        e instanceof Error
          ? e.message
          : "Error"
      );
    }
  }

  // --------------------------------------------------
  // PANTALLA DE CARGA
  // --------------------------------------------------

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

  // --------------------------------------------------
  // LOGIN
  // --------------------------------------------------

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
              margin: "80px auto",
              textAlign: "center",
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
              institutional Google account
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

  // --------------------------------------------------
  // HUB
  // --------------------------------------------------

  return (
    <>
      <header className="top">
        <div className="brand">
          ALPHA HUB
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div className="pill">
            {roleLabels[
              user.role as Role
            ]}
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
        <div className="card">

          <div className="toolbar">

            <input
              placeholder="Buscar caso, nombre, ID..."
              value={q}
              onChange={(e) =>
                setQ(e.target.value)
              }
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
          ) : !data.headers.length ? (
            <div className="empty">
              No se encontraron columnas
              en la Sheet.
            </div>
          ) : (
            <div className="tableWrap">
              <table className="table">

                <thead>
                  <tr>
                    {data.headers.map(
                      (h) => (
                        <th key={h}>
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.__row}
                    >
                      {data.headers.map(
                        (h) => (
                          <td key={h}>

                            {canEdit(h) ? (
                              <input
                                className="editable"
                                value={
                                  r[h] || ""
                                }
                                onChange={(
                                  e
                                ) => {
                                  const value =
                                    e.target
                                      .value;

                                  setData(
                                    (prev) => ({
                                      ...prev,
                                      rows: prev.rows.map(
                                        (
                                          rowData
                                        ) =>
                                          rowData.__row ===
                                          r.__row
                                            ? {
                                                ...rowData,
                                                [h]: value,
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
                                    e.target
                                      .value;

                                  const oldValue =
                                    r[h] || "";

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
                                {r[h] ||
                                  "—"}
                              </span>
                            )}

                          </td>
                        )
                      )}
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
          Usuario: {user.email} · Rol:{" "}
          {user.role}
        </p>
      </main>
    </>
  );
}
