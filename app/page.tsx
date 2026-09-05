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

type KpiSection =
  | "mgm"
  | "psych"
  | "caratula"
  | "draft"
  | "plcvl"
  | "ea"
  | "cvl";

type KpiSelection = {
  section: KpiSection;
  type: Exclude<KpiType, "none">;
} | null;

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  TL: "Team Leader",
  PARALEGAL: "Paralegal",
  PSYCH: "Psych",
  ANALYST: "Analyst",
  MANAGER: "Manager",
  COORDINATOR: "Coordinator",
};

const norm = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, " ");

const parseDateOnly = (value: string): Date | null => {
  const raw = value?.trim();

  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);

    const date = new Date(year, month - 1, day);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const slash = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (slash) {
    const first = Number(slash[1]);
    const second = Number(slash[2]);
    const year = Number(slash[3]);

    let month = first;
    let day = second;

    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    }

    const date = new Date(year, month - 1, day);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) return null;

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
};

const toInputDate = (value: string) => {
  const parsed = parseDateOnly(value);

  if (!parsed) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
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
  const currentWeekStart = startOfWeek(new Date());
  const nextWeekStart = addDays(currentWeekStart, 7);

  if (date < currentWeekStart) {
    return "backlog";
  }

  if (date >= currentWeekStart && date < nextWeekStart) {
    return "pending";
  }

  return "future";
};

/* =========================================================
   KPI LOGIC
========================================================= */

const getMgmKpi = (row: CaseRow): KpiType => {
  const type = norm(row["DUE DATE/NO DUE DATE"] || "");

  if (!["DUE DATE", "NO DUE DATE", "NOID"].includes(type)) {
    return "none";
  }

  const status = norm(row["STATUS"] || "");

  if (
    [
      "MGM REVIEW",
      "SENT TO USCIS",
      "SPECIAL CASE",
      "CANCELLED/CLOSED",
    ].includes(status)
  ) {
    return "none";
  }

  const date = parseDateOnly(row["COMMITMENT"] || "");

  if (!date) return "none";

  return classifyDate(date);
};

const getPsychKpi = (row: CaseRow): KpiType => {
  const status = norm(row["DOE STATUS"] || "");

  if (
    [
      "SPECIAL CASE",
      "NA",
      "N/A",
      "UNRESPONSIVE",
      "ON HOLD",
      "CANCELLED",
      "CANCELED",
      "CANCELLED/CLOSED",
    ].includes(status)
  ) {
    return "none";
  }

  if ((row["DONE (doe)"] || "").trim()) {
    return "none";
  }

  const date = parseDateOnly(
    row["EXPECTED DONE (doe)"] || ""
  );

  if (!date) return "none";

  return classifyDate(date);
};

const getCaratulaKpi = (row: CaseRow): KpiType => {
  if ((row["CARATULA DONE"] || "").trim()) {
    return "none";
  }

  const date = parseDateOnly(
    row["CARÁTULA EXPECTED DONE"] || ""
  );

  if (!date) return "none";

  return classifyDate(date);
};

const getDraftKpi = (row: CaseRow): KpiType => {
  const status = norm(row["STATUS 1ST DRAFT"] || "");

  if (
    [
      "NA",
      "N/A",
      "UNRESPONSIVE",
      "CANCELLED/CLOSED",
      "CANCELLED",
      "CANCELED",
      "SPECIAL CASE",
    ].includes(status)
  ) {
    return "none";
  }

  if ((row["1ST DRAFT DONE"] || "").trim()) {
    return "none";
  }

  const date = parseDateOnly(
    row["1ST DRAFT EXP DONE"] || ""
  );

  if (!date) return "none";

  return classifyDate(date);
};

const getPlCvlKpi = (row: CaseRow): KpiType => {
  if ((row["PL CVL DONE"] || "").trim()) {
    return "none";
  }

  const date = parseDateOnly(
    row["PL CVL EXPECTED DONE"] || ""
  );

  if (!date) return "none";

  return classifyDate(date);
};

const getEaKpi = (row: CaseRow): KpiType => {
  const status = norm(row["EA STATUS"] || "");

  if (
    ["NA", "N/A", "SPECIAL CASE", "WAITING GMC"].includes(
      status
    )
  ) {
    return "none";
  }

  if ((row["EA DONE"] || "").trim()) {
    return "none";
  }

  const date = parseDateOnly(
    row["EA EXPECTED DONE"] || ""
  );

  if (!date) return "none";

  return classifyDate(date);
};

const getCvlKpi = (row: CaseRow): KpiType => {
  const status = norm(row["CVL STATUS"] || "");

  if (
    ["NA", "N/A", "CANCELLED", "CANCELED"].includes(status)
  ) {
    return "none";
  }

  if ((row["DONE CVL"] || "").trim()) {
    return "none";
  }

  const date = parseDateOnly(
    row["CVL EXPECTED DONE"] || ""
  );

  if (!date) return "none";

  return classifyDate(date);
};

const kpiGetter = (section: KpiSection) => {
  if (section === "mgm") return getMgmKpi;
  if (section === "psych") return getPsychKpi;
  if (section === "caratula") return getCaratulaKpi;
  if (section === "draft") return getDraftKpi;
  if (section === "plcvl") return getPlCvlKpi;
  if (section === "ea") return getEaKpi;

  return getCvlKpi;
};

/* =========================================================
   COMPONENT
========================================================= */

export default function Home() {
  const [user, setUser] = useState<User | null>(null);

  const [data, setData] = useState<{
    title: string;
    headers: string[];
    rows: CaseRow[];
  }>({
    title: "",
    headers: [],
    rows: [],
  });

  const [loadingUser, setLoadingUser] = useState(true);
  const [loadingCases, setLoadingCases] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedCase, setSelectedCase] =
    useState<CaseRow | null>(null);

  const [selectedKpi, setSelectedKpi] =
    useState<KpiSelection>(null);

  const [savingField, setSavingField] =
    useState<string | null>(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadUser() {
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
      });

      setUser(await response.json());
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

  async function loadCases() {
    setLoadingCases(true);
    setError("");

    try {
      const response = await fetch("/api/cases", {
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || "No se pudieron cargar los casos"
        );
      }

      setData(json);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error"
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

  async function saveField(
    rowNumber: number,
    header: string,
    value: string
  ) {
    setSavingField(header);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/cases/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          row: rowNumber,
          changes: {
            [header]: value,
          },
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "No se pudo guardar");
      }

      setData((prev) => ({
        ...prev,
        rows: prev.rows.map((row) =>
          row.__row === String(rowNumber)
            ? {
                ...row,
                [header]: value,
              }
            : row
        ),
      }));

      setSelectedCase((prev) =>
        prev?.__row === String(rowNumber)
          ? {
              ...prev,
              [header]: value,
            }
          : prev
      );

      setMessage("Cambio guardado");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error"
      );
    } finally {
      setSavingField(null);
    }
  }

  const statsFor = (section: KpiSection) => {
    const getter = kpiGetter(section);

    let backlog = 0;
    let pending = 0;
    let future = 0;

    data.rows.forEach((row) => {
      const result = getter(row);

      if (result === "backlog") backlog++;
      if (result === "pending") pending++;
      if (result === "future") future++;
    });

    return {
      backlog,
      pending,
      future,
    };
  };

  const mgm = useMemo(() => statsFor("mgm"), [data.rows]);
  const psych = useMemo(() => statsFor("psych"), [data.rows]);
  const caratula = useMemo(
    () => statsFor("caratula"),
    [data.rows]
  );
  const draft = useMemo(
    () => statsFor("draft"),
    [data.rows]
  );
  const plcvl = useMemo(
    () => statsFor("plcvl"),
    [data.rows]
  );
  const ea = useMemo(() => statsFor("ea"), [data.rows]);
  const cvl = useMemo(() => statsFor("cvl"), [data.rows]);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();

    return data.rows.filter((row) => {
      const matchesSearch =
        !q ||
        (row["CLIENTE"] || "").toLowerCase().includes(q) ||
        (row["ID"] || "").toLowerCase().includes(q) ||
        (row["RECEIPT NUMBER"] || "")
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        !statusFilter ||
        norm(row["STATUS"] || "") === norm(statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [data.rows, search, statusFilter]);

  const kpiCases = useMemo(() => {
    if (!selectedKpi) return [];

    const getter = kpiGetter(selectedKpi.section);

    return data.rows.filter(
      (row) => getter(row) === selectedKpi.type
    );
  }, [data.rows, selectedKpi]);

  const sectionLabel = (section: KpiSection) => {
    if (section === "mgm") return "Entregas MGM";
    if (section === "psych") return "Psych";
    if (section === "caratula") return "Llenado de Carátula";
    if (section === "draft") return "1st Draft";
    if (section === "plcvl") return "Escalación a CVL";
    if (section === "ea") return "EA · Analyst";

    return "CVL";
  };

  const statusClass = (status: string) => {
    const value = norm(status);

    if (
      value === "DONE" ||
      value === "SENT TO USCIS"
    ) {
      return "status statusGreen";
    }

    if (
      value.includes("REVIEW") ||
      value.includes("CORRECTION")
    ) {
      return "status statusPurple";
    }

    if (
      value.includes("CANCEL") ||
      value === "SPECIAL CASE"
    ) {
      return "status statusRed";
    }

    return "status statusBlue";
  };

  function KpiCard({
    title,
    value,
    type,
    section,
  }: {
    title: string;
    value: number;
    type: Exclude<KpiType, "none">;
    section: KpiSection;
  }) {
    return (
      <button
        className={`metricCard metric-${type}`}
        onDoubleClick={() =>
          setSelectedKpi({
            section,
            type,
          })
        }
      >
        <span className="metricTitle">
          {title}
        </span>

        <strong>{value}</strong>

        <span className="metricHint">
          Doble clic para ver
        </span>
      </button>
    );
  }

  function KpiRow({
    title,
    section,
    stats,
  }: {
    title: string;
    section: KpiSection;
    stats: {
      backlog: number;
      pending: number;
      future: number;
    };
  }) {
    return (
      <section className="workflowSection">
        <div className="sectionTitleRow">
          <div>
            <h2>{title}</h2>
          </div>
        </div>

        <div className="metricGrid">
          <KpiCard
            title="Backlog"
            value={stats.backlog}
            section={section}
            type="backlog"
          />

          <KpiCard
            title="Pendientes"
            value={stats.pending}
            section={section}
            type="pending"
          />

          <KpiCard
            title="Próximas entregas"
            value={stats.future}
            section={section}
            type="future"
          />
        </div>
      </section>
    );
  }

  function Field({
    label,
    header,
    type = "text",
    readOnly = false,
  }: {
    label: string;
    header: string;
    type?: "text" | "date" | "textarea";
    readOnly?: boolean;
  }) {
    if (!selectedCase) return null;

    const value = selectedCase[header] || "";

    return (
      <div className="field">
        <label>{label}</label>

        {readOnly ? (
          <div className="readValue">
            {value || "—"}
          </div>
        ) : type === "textarea" ? (
          <textarea
            value={value}
            onChange={(e) =>
              setSelectedCase({
                ...selectedCase,
                [header]: e.target.value,
              })
            }
            onBlur={(e) =>
              saveField(
                Number(selectedCase.__row),
                header,
                e.target.value
              )
            }
          />
        ) : (
          <input
            type={type}
            value={
              type === "date"
                ? toInputDate(value)
                : value
            }
            onChange={(e) =>
              setSelectedCase({
                ...selectedCase,
                [header]: e.target.value,
              })
            }
            onBlur={(e) =>
              saveField(
                Number(selectedCase.__row),
                header,
                e.target.value
              )
            }
          />
        )}

        {savingField === header && (
          <span className="savingText">
            Guardando…
          </span>
        )}
      </div>
    );
  }

  if (loadingUser) {
    return (
      <div className="centerScreen">
        Cargando Alpha Hub…
      </div>
    );
  }

  if (!user?.authenticated) {
    return (
      <div className="loginScreen">
        <div className="loginCard">
          <div className="logoMark">A</div>

          <h1>Alpha Hub</h1>

          <p>
            Case operations workspace
          </p>

          <button
            className="primaryButton"
            onClick={() =>
              (window.location.href =
                "/api/auth/login")
            }
          >
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="appLayout">
      {/* SIDEBAR */}

      <aside className="sidebar">
        <div className="sidebarBrand">
          <div className="logoMark small">
            A
          </div>

          <div>
            <strong>ALPHA</strong>
            <span>HUB</span>
          </div>
        </div>

        <nav>
          <button className="navItem active">
            <span>⌂</span>
            Dashboard
          </button>

          <button className="navItem">
            <span>▦</span>
            Cases
          </button>

          <button className="navItem">
            <span>◎</span>
            Team
          </button>
        </nav>

        <div className="sidebarBottom">
          <div className="userAvatar">
            {(user.email || "A")
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="sidebarUser">
            <strong>
              {roleLabels[user.role as Role]}
            </strong>

            <span>{user.email}</span>
          </div>

          <button
            className="logoutButton"
            onClick={() =>
              (window.location.href =
                "/api/auth/logout")
            }
          >
            ↗
          </button>
        </div>
      </aside>

      {/* MAIN */}

      <main className="mainContent">
        <header className="pageHeader">
          <div>
            <p className="eyebrow">
              CASE OPERATIONS
            </p>

            <h1>Dashboard</h1>

            <p>
              Overview of current workflow and case
              activity.
            </p>
          </div>

          <button
            className="refreshButton"
            onClick={loadCases}
          >
            ↻ Refresh
          </button>
        </header>

        {error && (
          <div className="alert errorAlert">
            {error}
          </div>
        )}

        {message && (
          <div className="alert successAlert">
            {message}
          </div>
        )}

        {loadingCases ? (
          <div className="loadingCard">
            Loading cases…
          </div>
        ) : (
          <>
            <KpiRow
              title="Entregas MGM"
              section="mgm"
              stats={mgm}
            />

            <KpiRow
              title="Psych"
              section="psych"
              stats={psych}
            />

            <KpiRow
              title="Paralegal · Llenado de Carátula"
              section="caratula"
              stats={caratula}
            />

            <KpiRow
              title="Paralegal · 1st Draft"
              section="draft"
              stats={draft}
            />

            <KpiRow
              title="Paralegal · Escalación a CVL"
              section="plcvl"
              stats={plcvl}
            />

            <KpiRow
              title="EA · Analyst"
              section="ea"
              stats={ea}
            />

            <KpiRow
              title="CVL"
              section="cvl"
              stats={cvl}
            />

            {/* CASES */}

            <section className="casesSection">
              <div className="casesHeader">
                <div>
                  <p className="eyebrow">
                    CASE MANAGEMENT
                  </p>

                  <h2>Cases</h2>

                  <p>
                    {filteredCases.length} cases
                  </p>
                </div>

                <div className="caseFilters">
                  <div className="searchBox">
                    <span>⌕</span>

                    <input
                      value={search}
                      onChange={(e) =>
                        setSearch(e.target.value)
                      }
                      placeholder="Search client, ID or receipt..."
                    />
                  </div>

                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      All statuses
                    </option>
                    <option value="WORKING">
                      Working
                    </option>
                    <option value="MGM REVIEW">
                      MGM Review
                    </option>
                    <option value="SENT TO USCIS">
                      Sent to USCIS
                    </option>
                    <option value="SPECIAL CASE">
                      Special Case
                    </option>
                    <option value="CANCELLED/CLOSED">
                      Cancelled / Closed
                    </option>
                  </select>
                </div>
              </div>

              <div className="casesTable">
                <div className="caseTableHeader">
                  <span>CLIENT</span>
                  <span>TYPE</span>
                  <span>COMMITMENT</span>
                  <span>STATUS</span>
                  <span></span>
                </div>

                {filteredCases.map((row) => (
                  <button
                    key={row.__row}
                    className="caseRow"
                    onClick={() =>
                      setSelectedCase(row)
                    }
                  >
                    <div className="clientCell">
                      <div className="clientAvatar">
                        {(row["CLIENTE"] || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <strong>
                          {row["CLIENTE"] ||
                            "Sin cliente"}
                        </strong>

                        <span>
                          ID {row["ID"] || "—"} ·{" "}
                          {row["RECEIPT NUMBER"] ||
                            "No receipt"}
                        </span>
                      </div>
                    </div>

                    <span>
                      {row[
                        "DUE DATE/NO DUE DATE"
                      ] || "—"}
                    </span>

                    <span>
                      {row["COMMITMENT"] || "—"}
                    </span>

                    <span>
                      <span
                        className={statusClass(
                          row["STATUS"] || ""
                        )}
                      >
                        {row["STATUS"] || "NO STATUS"}
                      </span>
                    </span>

                    <span className="openArrow">
                      ›
                    </span>
                  </button>
                ))}

                {!filteredCases.length && (
                  <div className="emptyCases">
                    No cases found.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* KPI DRAWER */}

      {selectedKpi && (
        <div className="drawerOverlay">
          <div className="drawer">
            <div className="drawerHeader">
              <div>
                <p className="eyebrow">
                  {sectionLabel(
                    selectedKpi.section
                  )}
                </p>

                <h2>
                  {selectedKpi.type === "backlog"
                    ? "Backlog"
                    : selectedKpi.type ===
                      "pending"
                    ? "Pendientes"
                    : "Próximas entregas"}
                </h2>

                <p>
                  {kpiCases.length} cases
                </p>
              </div>

              <button
                className="closeButton"
                onClick={() =>
                  setSelectedKpi(null)
                }
              >
                ×
              </button>
            </div>

            <div className="drawerCases">
              {kpiCases.map((row) => (
                <button
                  key={row.__row}
                  className="drawerCase"
                  onClick={() => {
                    setSelectedKpi(null);
                    setSelectedCase(row);
                  }}
                >
                  <div>
                    <strong>
                      {row["CLIENTE"] ||
                        "Sin cliente"}
                    </strong>

                    <span>
                      ID {row["ID"] || "—"}
                    </span>
                  </div>

                  <span>
                    {row["STATUS"] || "—"}
                  </span>

                  <b>›</b>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CASE DETAIL */}

      {selectedCase && (
        <div className="modalOverlay">
          <div className="caseModal">
            <div className="modalHeader">
              <div>
                <p className="eyebrow">
                  CASE DETAILS
                </p>

                <h2>
                  {selectedCase["CLIENTE"] ||
                    "Sin cliente"}
                </h2>

                <div className="caseMeta">
                  <span>
                    ID{" "}
                    {selectedCase["ID"] || "—"}
                  </span>

                  <span>
                    {selectedCase[
                      "DUE DATE/NO DUE DATE"
                    ] || "—"}
                  </span>

                  <span
                    className={statusClass(
                      selectedCase["STATUS"] || ""
                    )}
                  >
                    {selectedCase["STATUS"] ||
                      "NO STATUS"}
                  </span>
                </div>
              </div>

              <button
                className="closeButton"
                onClick={() =>
                  setSelectedCase(null)
                }
              >
                ×
              </button>
            </div>

            <div className="modalBody">
              {/* GENERAL */}

              <section className="detailSection">
                <div className="detailSectionHeader">
                  <div className="stageIcon">
                    01
                  </div>

                  <div>
                    <h3>General</h3>
                    <p>
                      Main case information
                    </p>
                  </div>
                </div>

                <div className="fieldGrid">
                  <Field
                    label="Receipt Number"
                    header="RECEIPT NUMBER"
                    readOnly
                  />

                  <Field
                    label="Receipt Date"
                    header="RECEIPT DATE"
                    type="date"
                  />

                  <Field
                    label="Deadline"
                    header="DEADLINE"
                    type="date"
                  />

                  <Field
                    label="Commitment"
                    header="COMMITMENT"
                    type="date"
                  />

                  <Field
                    label="General Status"
                    header="STATUS"
                  />
                </div>

                <Field
                  label="Nota"
                  header="NOTA"
                  type="textarea"
                />
              </section>

              {/* PSYCH */}

              <section className="detailSection">
                <div className="detailSectionHeader">
                  <div className="stageIcon">
                    02
                  </div>

                  <div>
                    <h3>Psych</h3>
                    <p>
                      Psychological documentation
                    </p>
                  </div>
                </div>

                <div className="fieldGrid">
                  <Field
                    label="Psych"
                    header="PSYCH"
                    readOnly
                  />

                  <Field
                    label="DOE Status"
                    header="DOE STATUS"
                  />

                  <Field
                    label="Expected Done"
                    header="EXPECTED DONE (doe)"
                    type="date"
                  />

                  <Field
                    label="Done"
                    header="DONE (doe)"
                    type="date"
                  />
                </div>
              </section>

              {/* PARALEGAL */}

              <section className="detailSection">
                <div className="detailSectionHeader">
                  <div className="stageIcon">
                    03
                  </div>

                  <div>
                    <h3>Paralegal</h3>
                    <p>
                      Carátula and first draft
                    </p>
                  </div>
                </div>

                <div className="subStage">
                  <h4>Llenado de Carátula</h4>

                  <div className="fieldGrid">
                    <Field
                      label="PL Assigned"
                      header="PL ASSIGNED"
                      type="date"
                    />

                    <Field
                      label="Expected Done"
                      header="CARÁTULA EXPECTED DONE"
                      type="date"
                    />

                    <Field
                      label="Done"
                      header="CARATULA DONE"
                      type="date"
                    />

                    <Field
                      label="Link"
                      header="LINK CARÁTULA"
                    />
                  </div>
                </div>

                <div className="subStage">
                  <h4>1st Draft</h4>

                  <div className="fieldGrid">
                    <Field
                      label="Status"
                      header="STATUS 1ST DRAFT"
                    />

                    <Field
                      label="Expected Done"
                      header="1ST DRAFT EXP DONE"
                      type="date"
                    />

                    <Field
                      label="Done"
                      header="1ST DRAFT DONE"
                      type="date"
                    />

                    <Field
                      label="Affidavit"
                      header="LINK INF AFFIDAVIT"
                    />
                  </div>
                </div>

                <div className="subStage">
                  <h4>Escalación a CVL</h4>

                  <div className="fieldGrid">
                    <Field
                      label="Expected Done"
                      header="PL CVL EXPECTED DONE"
                      type="date"
                    />

                    <Field
                      label="Done"
                      header="PL CVL DONE"
                      type="date"
                    />
                  </div>
                </div>
              </section>

              {/* EA */}

              <section className="detailSection">
                <div className="detailSectionHeader">
                  <div className="stageIcon">
                    04
                  </div>

                  <div>
                    <h3>EA · Analyst</h3>
                    <p>
                      Evidence analysis
                    </p>
                  </div>
                </div>

                <div className="fieldGrid">
                  <Field
                    label="EA Member"
                    header="EA MEMBER"
                    readOnly
                  />

                  <Field
                    label="Assigned"
                    header="EA ASSIGNED"
                    type="date"
                  />

                  <Field
                    label="Status"
                    header="EA STATUS"
                  />

                  <Field
                    label="Expected Done"
                    header="EA EXPECTED DONE"
                    type="date"
                  />

                  <Field
                    label="Done"
                    header="EA DONE"
                    type="date"
                  />

                  <Field
                    label="EA P.E."
                    header="EA P.E."
                  />

                  <Field
                    label="P.E. Approved"
                    header="FECHA P.E. APROBADA"
                    type="date"
                  />

                  <Field
                    label="Stoppers"
                    header="EA STOPPERS"
                  />
                </div>
              </section>

              {/* CVL */}

              <section className="detailSection">
                <div className="detailSectionHeader">
                  <div className="stageIcon">
                    05
                  </div>

                  <div>
                    <h3>CVL</h3>
                    <p>
                      CVL workflow
                    </p>
                  </div>
                </div>

                <div className="fieldGrid">
                  <Field
                    label="CVL Member"
                    header="CVL MEMBER"
                    readOnly
                  />

                  <Field
                    label="Status"
                    header="CVL STATUS"
                  />

                  <Field
                    label="Expected Done"
                    header="CVL EXPECTED DONE"
                    type="date"
                  />

                  <Field
                    label="Done"
                    header="DONE CVL"
                    type="date"
                  />

                  <Field
                    label="Link CVL"
                    header="LINK CVL"
                  />
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
