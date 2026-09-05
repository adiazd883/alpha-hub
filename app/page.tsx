"use client";

import { useEffect, useMemo, useState } from "react";

/* =========================================================
   TYPES
========================================================= */

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

type MainView = "dashboard" | "cases" | "team";

type TeamGroup = "paralegal" | "psych" | "ea";

type TeamCalendar =
  | "caratula"
  | "draft"
  | "plcvl"
  | "psych"
  | "ea"
  | "cvl";

type KpiType =
  | "backlog"
  | "pending"
  | "future"
  | "none";

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

type OpenCaseSource =
  | "cases"
  | "calendar";

/* =========================================================
   LABELS
========================================================= */

const roleLabels: Record<Role, string> = {
  ADMIN: "Admin",
  TL: "Team Leader",
  PARALEGAL: "Paralegal",
  PSYCH: "Psych",
  ANALYST: "Analyst",
  MANAGER: "Manager",
  COORDINATOR: "Coordinator",
};

const monthNames = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const weekDays = [
  "LUN",
  "MAR",
  "MIÉ",
  "JUE",
  "VIE",
  "SÁB",
  "DOM",
];

/* =========================================================
   HELPERS
========================================================= */

const norm = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, " ");

const parseDateOnly = (value: string): Date | null => {
  const raw = value?.trim();

  if (!raw) return null;

  const iso = raw.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})/
  );

  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);

    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }

    return null;
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

    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }

    return null;
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

const toInputDate = (value: string) => {
  const parsed = parseDateOnly(value);

  if (!parsed) return "";

  const year = parsed.getFullYear();
  const month = String(
    parsed.getMonth() + 1
  ).padStart(2, "0");

  const day = String(
    parsed.getDate()
  ).padStart(2, "0");

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

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const classifyDate = (date: Date): KpiType => {
  const currentWeekStart = startOfWeek(new Date());

  const nextWeekStart = addDays(
    currentWeekStart,
    7
  );

  if (date.getTime() < currentWeekStart.getTime()) {
    return "backlog";
  }

  if (
    date.getTime() >= currentWeekStart.getTime() &&
    date.getTime() < nextWeekStart.getTime()
  ) {
    return "pending";
  }

  return "future";
};

/* =========================================================
   KPI LOGIC
========================================================= */

const getMgmKpi = (row: CaseRow): KpiType => {
  const type = norm(
    row["DUE DATE/NO DUE DATE"] || ""
  );

  if (
    !["DUE DATE", "NO DUE DATE", "NOID"].includes(type)
  ) {
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

  const date = parseDateOnly(
    row["COMMITMENT"] || ""
  );

  if (!date) return "none";

  return classifyDate(date);
};

const getPsychKpi = (row: CaseRow): KpiType => {
  const status = norm(
    row["DOE STATUS"] || ""
  );

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
  const status = norm(
    row["STATUS 1ST DRAFT"] || ""
  );

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
  const status = norm(
    row["EA STATUS"] || ""
  );

  if (
    [
      "NA",
      "N/A",
      "SPECIAL CASE",
      "WAITING GMC",
    ].includes(status)
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
  const status = norm(
    row["CVL STATUS"] || ""
  );

  if (
    ["NA", "N/A", "CANCELLED", "CANCELED"].includes(
      status
    )
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

const getKpiGetter = (section: KpiSection) => {
  if (section === "mgm") return getMgmKpi;
  if (section === "psych") return getPsychKpi;
  if (section === "caratula") return getCaratulaKpi;
  if (section === "draft") return getDraftKpi;
  if (section === "plcvl") return getPlCvlKpi;
  if (section === "ea") return getEaKpi;

  return getCvlKpi;
};

/* =========================================================
   CALENDAR CONFIG
========================================================= */

const calendarDateHeader = (
  type: TeamCalendar
) => {
  if (type === "caratula") {
    return "CARÁTULA EXPECTED DONE";
  }

  if (type === "draft") {
    return "1ST DRAFT EXP DONE";
  }

  if (type === "plcvl") {
    return "PL CVL EXPECTED DONE";
  }

  if (type === "psych") {
    return "EXPECTED DONE (doe)";
  }

  if (type === "ea") {
    return "EA EXPECTED DONE";
  }

  return "CVL EXPECTED DONE";
};

const calendarStatusHeader = (
  type: TeamCalendar
) => {
  if (type === "draft") {
    return "STATUS 1ST DRAFT";
  }

  if (type === "psych") {
    return "DOE STATUS";
  }

  if (type === "ea") {
    return "EA STATUS";
  }

  if (type === "cvl") {
    return "CVL STATUS";
  }

  return "";
};

const calendarActive = (
  row: CaseRow,
  type: TeamCalendar
) => {
  if (type === "caratula") {
    return getCaratulaKpi(row) !== "none";
  }

  if (type === "draft") {
    return getDraftKpi(row) !== "none";
  }

  if (type === "plcvl") {
    return getPlCvlKpi(row) !== "none";
  }

  if (type === "psych") {
    return getPsychKpi(row) !== "none";
  }

  if (type === "ea") {
    return getEaKpi(row) !== "none";
  }

  return getCvlKpi(row) !== "none";
};

/* =========================================================
   MAIN
========================================================= */

export default function Home() {
  const [user, setUser] =
    useState<User | null>(null);

  const [data, setData] = useState<{
    title: string;
    headers: string[];
    rows: CaseRow[];
  }>({
    title: "",
    headers: [],
    rows: [],
  });

  const [loadingUser, setLoadingUser] =
    useState(true);

  const [loadingCases, setLoadingCases] =
    useState(false);

  const [mainView, setMainView] =
    useState<MainView>("dashboard");

  const [teamOpen, setTeamOpen] =
    useState(false);

  const [teamGroup, setTeamGroup] =
    useState<TeamGroup>("paralegal");

  const [teamCalendar, setTeamCalendar] =
    useState<TeamCalendar>("caratula");

  const [calendarMonth, setCalendarMonth] =
    useState(() => {
      const now = new Date();

      return new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      );
    });

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("");

  const [selectedCase, setSelectedCase] =
    useState<CaseRow | null>(null);

  const [openCaseSource, setOpenCaseSource] =
    useState<OpenCaseSource>("cases");

  const [selectedStage, setSelectedStage] =
    useState<TeamCalendar | null>(null);

  const [selectedKpi, setSelectedKpi] =
    useState<KpiSelection>(null);

  const [savingField, setSavingField] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  /* =====================================================
     ROLE PERMISSIONS
  ===================================================== */

  const role = user?.role;

  const canSeeAllTeam =
    role === "ADMIN" ||
    role === "TL" ||
    role === "MANAGER" ||
    role === "COORDINATOR";

  const canSeeParalegal =
    canSeeAllTeam ||
    role === "PARALEGAL";

  const canSeePsych =
    canSeeAllTeam ||
    role === "PSYCH";

  const canSeeEa =
    canSeeAllTeam ||
    role === "ANALYST";

  const canEditStage =
    role === "ADMIN" ||
    role === "TL" ||
    (role === "PARALEGAL" &&
      ["caratula", "draft", "plcvl"].includes(
        selectedStage || ""
      )) ||
    (role === "PSYCH" &&
      selectedStage === "psych") ||
    (role === "ANALYST" &&
      ["ea", "cvl"].includes(
        selectedStage || ""
      ));

  /* =====================================================
     LOAD
  ===================================================== */

  async function loadUser() {
    try {
      const response = await fetch(
        "/api/auth/me",
        {
          cache: "no-store",
        }
      );

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
      const response = await fetch(
        "/api/cases",
        {
          cache: "no-store",
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "No se pudieron cargar los casos"
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

  /* =====================================================
     SAVE
  ===================================================== */

  async function saveField(
    rowNumber: number,
    header: string,
    value: string
  ) {
    setSavingField(header);
    setMessage("");
    setError("");

    try {
      const response = await fetch(
        "/api/cases/update",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            row: rowNumber,

            changes: {
              [header]: value,
            },
          }),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || "No se pudo guardar"
        );
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

      setMessage(
        "Cambio guardado en Google Sheets"
      );

      window.setTimeout(() => {
        setMessage("");
      }, 2200);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Error"
      );
    } finally {
      setSavingField(null);
    }
  }

  /* =====================================================
     OPEN CASE
  ===================================================== */

  function openGeneralCase(row: CaseRow) {
    setOpenCaseSource("cases");
    setSelectedStage(null);
    setSelectedCase(row);
  }

  function openCalendarCase(
    row: CaseRow,
    stage: TeamCalendar
  ) {
    setOpenCaseSource("calendar");
    setSelectedStage(stage);
    setSelectedCase(row);
  }

  /* =====================================================
     STATS
  ===================================================== */

  const calculateStats = (
    section: KpiSection
  ) => {
    const getter = getKpiGetter(section);

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

  const mgmStats = useMemo(
    () => calculateStats("mgm"),
    [data.rows]
  );

  const psychStats = useMemo(
    () => calculateStats("psych"),
    [data.rows]
  );

  const caratulaStats = useMemo(
    () => calculateStats("caratula"),
    [data.rows]
  );

  const draftStats = useMemo(
    () => calculateStats("draft"),
    [data.rows]
  );

  const plcvlStats = useMemo(
    () => calculateStats("plcvl"),
    [data.rows]
  );

  const eaStats = useMemo(
    () => calculateStats("ea"),
    [data.rows]
  );

  const cvlStats = useMemo(
    () => calculateStats("cvl"),
    [data.rows]
  );

  /* =====================================================
     CASE FILTER
  ===================================================== */

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();

    return data.rows.filter((row) => {
      const matchesSearch =
        !q ||
        (row["CLIENTE"] || "")
          .toLowerCase()
          .includes(q) ||
        (row["ID"] || "")
          .toLowerCase()
          .includes(q) ||
        (row["RECEIPT NUMBER"] || "")
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        !statusFilter ||
        norm(row["STATUS"] || "") ===
          norm(statusFilter);

      return matchesSearch && matchesStatus;
    });
  }, [data.rows, search, statusFilter]);

  /* =====================================================
     KPI DETAILS
  ===================================================== */

  const kpiCases = useMemo(() => {
    if (!selectedKpi) return [];

    const getter = getKpiGetter(
      selectedKpi.section
    );

    return data.rows.filter(
      (row) =>
        getter(row) === selectedKpi.type
    );
  }, [data.rows, selectedKpi]);

  const sectionLabel = (
    section: KpiSection
  ) => {
    if (section === "mgm") return "Entregas MGM";
    if (section === "psych") return "Psych";
    if (section === "caratula")
      return "Llenado de Carátula";
    if (section === "draft") return "1st Draft";
    if (section === "plcvl")
      return "Escalación CVL";
    if (section === "ea") return "EA · Analyst";

    return "CVL";
  };

  /* =====================================================
     CALENDAR
  ===================================================== */

  const calendarDays = useMemo(() => {
    const year =
      calendarMonth.getFullYear();

    const month =
      calendarMonth.getMonth();

    const firstDay = new Date(
      year,
      month,
      1
    );

    const lastDay = new Date(
      year,
      month + 1,
      0
    );

    const mondayIndex =
      firstDay.getDay() === 0
        ? 6
        : firstDay.getDay() - 1;

    const startDate = addDays(
      firstDay,
      -mondayIndex
    );

    const lastDayMondayIndex =
      lastDay.getDay() === 0
        ? 6
        : lastDay.getDay() - 1;

    const remaining =
      6 - lastDayMondayIndex;

    const endDate = addDays(
      lastDay,
      remaining
    );

    const days: Date[] = [];

    let cursor = new Date(startDate);

    while (
      cursor.getTime() <= endDate.getTime()
    ) {
      days.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }

    return days;
  }, [calendarMonth]);

  const calendarEvents = useMemo(() => {
    const header =
      calendarDateHeader(teamCalendar);

    return data.rows
      .filter((row) =>
        calendarActive(
          row,
          teamCalendar
        )
      )
      .map((row) => ({
        row,

        date: parseDateOnly(
          row[header] || ""
        ),
      }))
      .filter(
        (
          item
        ): item is {
          row: CaseRow;
          date: Date;
        } => !!item.date
      );
  }, [data.rows, teamCalendar]);

  function previousMonth() {
    setCalendarMonth(
      new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() - 1,
        1
      )
    );
  }

  function nextMonth() {
    setCalendarMonth(
      new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() + 1,
        1
      )
    );
  }

  function goToday() {
    const today = new Date();

    setCalendarMonth(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )
    );
  }

  /* =====================================================
     STYLE
  ===================================================== */

  const statusClass = (status: string) => {
    const value = norm(status);

    if (
      value === "DONE" ||
      value === "SENT TO USCIS"
    ) {
      return "statusPill statusGreen";
    }

    if (
      value.includes("REVIEW") ||
      value.includes("CORRECTION")
    ) {
      return "statusPill statusPurple";
    }

    if (
      value.includes("CANCEL") ||
      value === "SPECIAL CASE"
    ) {
      return "statusPill statusRed";
    }

    if (!value) {
      return "statusPill statusGray";
    }

    return "statusPill statusBlue";
  };

  /* =====================================================
     NAVIGATION
  ===================================================== */

  function openDashboard() {
    setMainView("dashboard");
    setTeamOpen(false);
  }

  function openCases() {
    setMainView("cases");
    setTeamOpen(false);
  }

  function toggleTeam() {
    setMainView("team");
    setTeamOpen(true);

    if (role === "PARALEGAL") {
      setTeamGroup("paralegal");
      setTeamCalendar("caratula");
    } else if (role === "PSYCH") {
      setTeamGroup("psych");
      setTeamCalendar("psych");
    } else if (role === "ANALYST") {
      setTeamGroup("ea");
      setTeamCalendar("ea");
    }
  }

  function chooseTeamGroup(
    group: TeamGroup
  ) {
    setMainView("team");
    setTeamOpen(true);
    setTeamGroup(group);

    if (group === "paralegal") {
      setTeamCalendar("caratula");
    }

    if (group === "psych") {
      setTeamCalendar("psych");
    }

    if (group === "ea") {
      setTeamCalendar("ea");
    }
  }

  /* =====================================================
     KPI COMPONENTS
  ===================================================== */

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
        <div className="metricTop">
          <span>{title}</span>
          <span className="metricDot">•</span>
        </div>

        <strong>{value}</strong>

        <small>
          Doble clic para ver casos
        </small>
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
        <div className="workflowTitle">
          <h2>{title}</h2>
        </div>

        <div className="metricGrid">
          <KpiCard
            title="Backlog"
            value={stats.backlog}
            type="backlog"
            section={section}
          />

          <KpiCard
            title="Pendientes"
            value={stats.pending}
            type="pending"
            section={section}
          />

          <KpiCard
            title="Próximas entregas"
            value={stats.future}
            type="future"
            section={section}
          />
        </div>
      </section>
    );
  }

  /* =====================================================
     FIELD
  ===================================================== */

  function Field({
    label,
    header,
    type = "text",
    readOnly = false,
    options,
  }: {
    label: string;
    header: string;
    type?:
      | "text"
      | "date"
      | "textarea"
      | "select";
    readOnly?: boolean;
    options?: string[];
  }) {
    if (!selectedCase) return null;

    const value =
      selectedCase[header] || "";

    const updateLocal = (
      newValue: string
    ) => {
      setSelectedCase({
        ...selectedCase,
        [header]: newValue,
      });
    };

    const locked =
      readOnly ||
      (openCaseSource === "calendar" &&
        !canEditStage) ||
      role === "MANAGER" ||
      role === "COORDINATOR";

    return (
      <div className="detailField">
        <label>{label}</label>

        {locked ? (
          <div className="readValue">
            {value || "—"}
          </div>
        ) : type === "textarea" ? (
          <textarea
            value={value}
            onChange={(e) =>
              updateLocal(e.target.value)
            }
            onBlur={(e) =>
              saveField(
                Number(
                  selectedCase.__row
                ),
                header,
                e.target.value
              )
            }
          />
        ) : type === "select" ? (
          <select
            value={value}
            onChange={(e) => {
              const newValue =
                e.target.value;

              updateLocal(newValue);

              saveField(
                Number(
                  selectedCase.__row
                ),
                header,
                newValue
              );
            }}
          >
            <option value="">—</option>

            {(options || []).map(
              (option) => (
                <option
                  key={option}
                  value={option}
                >
                  {option}
                </option>
              )
            )}
          </select>
        ) : (
          <input
            type={type}
            value={
              type === "date"
                ? toInputDate(value)
                : value
            }
            onChange={(e) =>
              updateLocal(e.target.value)
            }
            onBlur={(e) =>
              saveField(
                Number(
                  selectedCase.__row
                ),
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

  /* =====================================================
     STAGE CONTENT
  ===================================================== */

  function StageContent({
    stage,
  }: {
    stage: TeamCalendar;
  }) {
    if (!selectedCase) return null;

    if (stage === "caratula") {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">PL</div>

            <div>
              <h3>
                Paralegal · Llenado de Carátula
              </h3>

              <p>
                Entrega de Carátula
              </p>
            </div>
          </div>

          <div className="fieldGrid">
            <Field
              label="Paralegal"
              header="PARALEGAL"
              readOnly
            />

            <Field
              label="PL Assigned"
              header="PL ASSIGNED"
              type="date"
              readOnly
            />

            <Field
              label="Expected Done"
              header="CARÁTULA EXPECTED DONE"
              type="date"
              readOnly
            />

            <Field
              label="Done"
              header="CARATULA DONE"
              type="date"
            />

            <Field
              label="Link Carátula"
              header="LINK CARÁTULA"
            />
          </div>
        </section>
      );
    }

    if (stage === "draft") {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">PL</div>

            <div>
              <h3>
                Paralegal · 1st Draft
              </h3>

              <p>
                Primera entrega del Draft
              </p>
            </div>
          </div>

          <div className="fieldGrid">
            <Field
              label="Paralegal"
              header="PARALEGAL"
              readOnly
            />

            <Field
              label="Status 1st Draft"
              header="STATUS 1ST DRAFT"
              type="select"
              options={[
                "DONE",
                "WORKING",
                "NA",
                "UNRESPONSIVE",
                "CANCELLED/CLOSED",
                "SPECIAL CASE",
              ]}
            />

            <Field
              label="Expected Done"
              header="1ST DRAFT EXP DONE"
              type="date"
              readOnly
            />

            <Field
              label="1st Draft Done"
              header="1ST DRAFT DONE"
              type="date"
            />

            <Field
              label="Link Inf Affidavit"
              header="LINK INF AFFIDAVIT"
            />
          </div>
        </section>
      );
    }

    if (stage === "plcvl") {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">PL</div>

            <div>
              <h3>
                Paralegal · Escalación a CVL
              </h3>

              <p>
                Entrega de escalación
              </p>
            </div>
          </div>

          <div className="fieldGrid">
            <Field
              label="Paralegal"
              header="PARALEGAL"
              readOnly
            />

            <Field
              label="Expected Done"
              header="PL CVL EXPECTED DONE"
              type="date"
              readOnly
            />

            <Field
              label="Done"
              header="PL CVL DONE"
              type="date"
            />
          </div>
        </section>
      );
    }

    if (stage === "psych") {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">PS</div>

            <div>
              <h3>Psych · DOE</h3>

              <p>
                Entrega de Psych
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
              type="select"
              options={[
                "DONE",
                "CORRECTIONS",
                "REVIEW",
                "SPECIAL CASE",
                "UNRESPONSIVE",
                "ON HOLD",
                "CANCELLED",
                "NA",
              ]}
            />

            <Field
              label="Expected Done"
              header="EXPECTED DONE (doe)"
              type="date"
              readOnly
            />

            <Field
              label="Done"
              header="DONE (doe)"
              type="date"
            />

            <Field
              label="Link DOE"
              header="LINK DOE"
            />

            <Field
              label="Class"
              header="CLASS"
              readOnly
            />
          </div>
        </section>
      );
    }

    if (stage === "ea") {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">EA</div>

            <div>
              <h3>EA · Analyst</h3>

              <p>
                Evidence Analysis
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
              label="EA Assigned"
              header="EA ASSIGNED"
              type="date"
              readOnly
            />

            <Field
              label="EA Status"
              header="EA STATUS"
            />

            <Field
              label="Expected Done"
              header="EA EXPECTED DONE"
              type="date"
              readOnly
            />

            <Field
              label="EA Done"
              header="EA DONE"
              type="date"
            />

            <Field
              label="EA P.E."
              header="EA P.E."
              type="select"
              options={[
                "APPROVED",
                "CORRECTIONS",
                "PENDING",
                "NA",
              ]}
            />

            <Field
              label="Fecha P.E. Aprobada"
              header="FECHA P.E. APROBADA"
              type="date"
            />

            <Field
              label="EA Stoppers"
              header="EA STOPPERS"
            />

            <Field
              label="EA Hojas"
              header="EA HOJAS"
            />

            <Field
              label="EA WS"
              header="EA WS"
            />

            <Field
              label="Link Drive"
              header="EA LINK DRIVE"
            />
          </div>
        </section>
      );
    }

    return (
      <section className="detailSection">
        <div className="detailSectionHeader">
          <div className="stageIcon">CV</div>

          <div>
            <h3>CVL</h3>

            <p>
              Entrega CVL
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
            label="CVL Status"
            header="CVL STATUS"
          />

          <Field
            label="Expected Done"
            header="CVL EXPECTED DONE"
            type="date"
            readOnly
          />

          <Field
            label="Done CVL"
            header="DONE CVL"
            type="date"
          />

          <Field
            label="Link CVL"
            header="LINK CVL"
          />
        </div>
      </section>
    );
  }

  /* =====================================================
     LOGIN
  ===================================================== */

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
          <div className="logoMark">
            A
          </div>

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

  /* =====================================================
     MAIN
  ===================================================== */

  return (
    <div className="appLayout">
      {/* SIDEBAR */}

      <aside className="sidebar">
        <div className="sidebarBrand">
          <div className="logoMark small">
            A
          </div>

          <div className="brandWords">
            <strong>ALPHA</strong>
            <span>HUB</span>
          </div>
        </div>

        <div className="navLabel">
          WORKSPACE
        </div>

        <nav className="sidebarNav">
          <button
            className={`navItem ${
              mainView === "dashboard"
                ? "active"
                : ""
            }`}
            onClick={openDashboard}
          >
            <span className="navIcon">
              ⌂
            </span>

            <span>Dashboard</span>
          </button>

          <button
            className={`navItem ${
              mainView === "cases"
                ? "active"
                : ""
            }`}
            onClick={openCases}
          >
            <span className="navIcon">
              ▦
            </span>

            <span>Cases</span>
          </button>

          <button
            className={`navItem ${
              mainView === "team"
                ? "active"
                : ""
            }`}
            onClick={toggleTeam}
          >
            <span className="navIcon">
              ◉
            </span>

            <span className="teamNavText">
              Team
            </span>

            <span className="teamChevron">
              {teamOpen ? "⌃" : "⌄"}
            </span>
          </button>

          {teamOpen && (
            <div className="teamSubMenu">
              {canSeeParalegal && (
                <button
                  className={
                    teamGroup === "paralegal"
                      ? "teamSub active"
                      : "teamSub"
                  }
                  onClick={() =>
                    chooseTeamGroup(
                      "paralegal"
                    )
                  }
                >
                  Paralegales
                </button>
              )}

              {canSeePsych && (
                <button
                  className={
                    teamGroup === "psych"
                      ? "teamSub active"
                      : "teamSub"
                  }
                  onClick={() =>
                    chooseTeamGroup(
                      "psych"
                    )
                  }
                >
                  Psych
                </button>
              )}

              {canSeeEa && (
                <button
                  className={
                    teamGroup === "ea"
                      ? "teamSub active"
                      : "teamSub"
                  }
                  onClick={() =>
                    chooseTeamGroup("ea")
                  }
                >
                  EA
                </button>
              )}
            </div>
          )}
        </nav>

        <div className="sidebarBottom">
          <div className="userAvatar">
            {(user.email || "A")
              .charAt(0)
              .toUpperCase()}
          </div>

          <div className="sidebarUser">
            <strong>
              {roleLabels[
                user.role as Role
              ]}
            </strong>

            <span>{user.email}</span>
          </div>

          <button
            className="logoutButton"
            title="Log out"
            onClick={() =>
              (window.location.href =
                "/api/auth/logout")
            }
          >
            ↗
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="mainContent">
        {message && (
          <div className="floatingMessage">
            ✓ {message}
          </div>
        )}

        {error && (
          <div className="errorBanner">
            {error}
          </div>
        )}

        {/* DASHBOARD */}

        {mainView === "dashboard" && (
          <>
            <header className="pageHeader">
              <div>
                <p className="eyebrow">
                  CASE OPERATIONS
                </p>

                <h1>Dashboard</h1>

                <p>
                  Overview of current workflow
                  and case activity.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={loadCases}
              >
                ↻ Refresh
              </button>
            </header>

            {loadingCases ? (
              <div className="loadingCard">
                Loading cases…
              </div>
            ) : (
              <div className="dashboardContent">
                <KpiRow
                  title="Entregas MGM"
                  section="mgm"
                  stats={mgmStats}
                />

                <KpiRow
                  title="Psych"
                  section="psych"
                  stats={psychStats}
                />

                <KpiRow
                  title="Paralegal · Llenado de Carátula"
                  section="caratula"
                  stats={caratulaStats}
                />

                <KpiRow
                  title="Paralegal · 1st Draft"
                  section="draft"
                  stats={draftStats}
                />

                <KpiRow
                  title="Paralegal · Escalación a CVL"
                  section="plcvl"
                  stats={plcvlStats}
                />

                <KpiRow
                  title="EA · Analyst"
                  section="ea"
                  stats={eaStats}
                />

                <KpiRow
                  title="CVL"
                  section="cvl"
                  stats={cvlStats}
                />
              </div>
            )}
          </>
        )}

        {/* CASES */}

        {mainView === "cases" && (
          <>
            <header className="pageHeader">
              <div>
                <p className="eyebrow">
                  CASE MANAGEMENT
                </p>

                <h1>Cases</h1>

                <p>
                  Search, review and manage
                  all cases.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={loadCases}
              >
                ↻ Refresh
              </button>
            </header>

            <section className="casesPanel">
              <div className="casesToolbar">
                <div className="searchBox">
                  <span>⌕</span>

                  <input
                    value={search}
                    onChange={(e) =>
                      setSearch(
                        e.target.value
                      )
                    }
                    placeholder="Buscar cliente, ID o receipt..."
                  />
                </div>

                <select
                  className="filterSelect"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(
                      e.target.value
                    )
                  }
                >
                  <option value="">
                    Todos los status
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

                <div className="caseCount">
                  {filteredCases.length} casos
                </div>
              </div>

              <div className="casesTable">
                <div className="casesTableHeader">
                  <div>CLIENTE</div>
                  <div>TIPO</div>
                  <div>COMMITMENT</div>
                  <div>PARALEGAL</div>
                  <div>STATUS</div>
                  <div />
                </div>

                {filteredCases.map((row) => (
                  <button
                    key={row.__row}
                    className="caseTableRow"
                    onClick={() =>
                      openGeneralCase(row)
                    }
                  >
                    <div className="caseClient">
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
                          ID {row["ID"] || "—"}
                          {" · "}
                          {row[
                            "RECEIPT NUMBER"
                          ] || "No receipt"}
                        </span>
                      </div>
                    </div>

                    <div className="tableValue">
                      {row[
                        "DUE DATE/NO DUE DATE"
                      ] || "—"}
                    </div>

                    <div className="tableValue">
                      {row["COMMITMENT"] ||
                        "—"}
                    </div>

                    <div className="tableValue">
                      {row["PARALEGAL"] ||
                        "—"}
                    </div>

                    <div>
                      <span
                        className={statusClass(
                          row["STATUS"] || ""
                        )}
                      >
                        {row["STATUS"] ||
                          "NO STATUS"}
                      </span>
                    </div>

                    <div className="rowArrow">
                      ›
                    </div>
                  </button>
                ))}

                {!filteredCases.length && (
                  <div className="emptyState">
                    No encontramos casos con
                    esos filtros.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* TEAM */}

        {mainView === "team" && (
          <>
            <header className="pageHeader teamPageHeader">
              <div>
                <p className="eyebrow">
                  TEAM WORKLOAD
                </p>

                <h1>Team</h1>

                <p>
                  Calendario de entregas del
                  equipo.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={loadCases}
              >
                ↻ Refresh
              </button>
            </header>

            {canSeeAllTeam && (
              <div className="teamGroupTabs">
                {canSeeParalegal && (
                  <button
                    className={
                      teamGroup === "paralegal"
                        ? "teamGroupTab active"
                        : "teamGroupTab"
                    }
                    onClick={() =>
                      chooseTeamGroup(
                        "paralegal"
                      )
                    }
                  >
                    Paralegales
                  </button>
                )}

                {canSeePsych && (
                  <button
                    className={
                      teamGroup === "psych"
                        ? "teamGroupTab active"
                        : "teamGroupTab"
                    }
                    onClick={() =>
                      chooseTeamGroup(
                        "psych"
                      )
                    }
                  >
                    Psych
                  </button>
                )}

                {canSeeEa && (
                  <button
                    className={
                      teamGroup === "ea"
                        ? "teamGroupTab active"
                        : "teamGroupTab"
                    }
                    onClick={() =>
                      chooseTeamGroup("ea")
                    }
                  >
                    EA
                  </button>
                )}
              </div>
            )}

            <div className="teamStageTabs">
              {teamGroup === "paralegal" &&
                canSeeParalegal && (
                  <>
                    <button
                      className={
                        teamCalendar ===
                        "caratula"
                          ? "stageTab active"
                          : "stageTab"
                      }
                      onClick={() =>
                        setTeamCalendar(
                          "caratula"
                        )
                      }
                    >
                      Carátula
                    </button>

                    <button
                      className={
                        teamCalendar ===
                        "draft"
                          ? "stageTab active"
                          : "stageTab"
                      }
                      onClick={() =>
                        setTeamCalendar(
                          "draft"
                        )
                      }
                    >
                      1st Draft
                    </button>

                    <button
                      className={
                        teamCalendar ===
                        "plcvl"
                          ? "stageTab active"
                          : "stageTab"
                      }
                      onClick={() =>
                        setTeamCalendar(
                          "plcvl"
                        )
                      }
                    >
                      Escalación CVL
                    </button>
                  </>
                )}

              {teamGroup === "psych" &&
                canSeePsych && (
                  <button className="stageTab active">
                    DOE
                  </button>
                )}

              {teamGroup === "ea" &&
                canSeeEa && (
                  <>
                    <button
                      className={
                        teamCalendar === "ea"
                          ? "stageTab active"
                          : "stageTab"
                      }
                      onClick={() =>
                        setTeamCalendar("ea")
                      }
                    >
                      EA / Analyst
                    </button>

                    <button
                      className={
                        teamCalendar === "cvl"
                          ? "stageTab active"
                          : "stageTab"
                      }
                      onClick={() =>
                        setTeamCalendar("cvl")
                      }
                    >
                      CVL
                    </button>
                  </>
                )}
            </div>

            <section className="calendarCard">
              <div className="calendarToolbar">
                <div className="calendarTitle">
                  <h2>
                    {
                      monthNames[
                        calendarMonth.getMonth()
                      ]
                    }{" "}
                    {calendarMonth.getFullYear()}
                  </h2>

                  <span>
                    {calendarEvents.length}{" "}
                    entregas activas
                  </span>
                </div>

                <div className="calendarControls">
                  <button
                    onClick={previousMonth}
                  >
                    ‹
                  </button>

                  <button
                    className="todayButton"
                    onClick={goToday}
                  >
                    Hoy
                  </button>

                  <button
                    onClick={nextMonth}
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="calendarWeekHeader">
                {weekDays.map((day) => (
                  <div key={day}>
                    {day}
                  </div>
                ))}
              </div>

              <div className="calendarGrid">
                {calendarDays.map((day) => {
                  const isCurrentMonth =
                    day.getMonth() ===
                    calendarMonth.getMonth();

                  const isToday =
                    sameDay(
                      day,
                      new Date()
                    );

                  const dayEvents =
                    calendarEvents.filter(
                      (event) =>
                        sameDay(
                          event.date,
                          day
                        )
                    );

                  return (
                    <div
                      key={day.toISOString()}
                      className={`calendarDay ${
                        !isCurrentMonth
                          ? "outsideMonth"
                          : ""
                      }`}
                    >
                      <div className="calendarDayNumber">
                        <span
                          className={
                            isToday
                              ? "todayNumber"
                              : ""
                          }
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      <div className="calendarEvents">
                        {dayEvents.map(
                          ({ row }) => {
                            const statusHeader =
                              calendarStatusHeader(
                                teamCalendar
                              );

                            const status =
                              statusHeader
                                ? row[
                                    statusHeader
                                  ] || ""
                                : "";

                            return (
                              <button
                                key={row.__row}
                                className={`calendarEvent ${
                                  classifyDate(
                                    day
                                  ) === "backlog"
                                    ? "calendarEventBacklog"
                                    : classifyDate(
                                        day
                                      ) ===
                                      "pending"
                                    ? "calendarEventPending"
                                    : "calendarEventFuture"
                                }`}
                                onClick={() =>
                                  openCalendarCase(
                                    row,
                                    teamCalendar
                                  )
                                }
                              >
                                <strong>
                                  {row[
                                    "CLIENTE"
                                  ] ||
                                    "Sin cliente"}
                                </strong>

                                {status && (
                                  <span>
                                    {status}
                                  </span>
                                )}
                              </button>
                            );
                          }
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>

      {/* KPI DRAWER */}

      {selectedKpi && (
        <div
          className="drawerOverlay"
          onMouseDown={() =>
            setSelectedKpi(null)
          }
        >
          <aside
            className="drawer"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >
            <div className="drawerHeader">
              <div>
                <p className="eyebrow">
                  {sectionLabel(
                    selectedKpi.section
                  )}
                </p>

                <h2>
                  {selectedKpi.type ===
                  "backlog"
                    ? "Backlog"
                    : selectedKpi.type ===
                      "pending"
                    ? "Pendientes"
                    : "Próximas entregas"}
                </h2>

                <p>
                  {kpiCases.length} casos
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
                    openGeneralCase(row);
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

                  <span
                    className={statusClass(
                      row["STATUS"] || ""
                    )}
                  >
                    {row["STATUS"] ||
                      "NO STATUS"}
                  </span>

                  <b>›</b>
                </button>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* =================================================
          MODAL FROM TEAM
          SOLO MUESTRA LA ETAPA
      ================================================= */}

      {selectedCase &&
        openCaseSource === "calendar" &&
        selectedStage && (
          <div
            className="modalOverlay"
            onMouseDown={() =>
              setSelectedCase(null)
            }
          >
            <div
              className="caseModal"
              onMouseDown={(e) =>
                e.stopPropagation()
              }
              style={{
                height: "auto",
                maxHeight: "90vh",
                maxWidth: "760px",
              }}
            >
              <div className="modalHeader">
                <div>
                  <p className="eyebrow">
                    TEAM DELIVERY
                  </p>

                  <h2>
                    {selectedCase[
                      "CLIENTE"
                    ] || "Sin cliente"}
                  </h2>

                  <div className="caseMeta">
                    <span>
                      ID{" "}
                      {selectedCase["ID"] ||
                        "—"}
                    </span>

                    <span>
                      {sectionLabel(
                        selectedStage ===
                          "caratula"
                          ? "caratula"
                          : selectedStage ===
                            "draft"
                          ? "draft"
                          : selectedStage ===
                            "plcvl"
                          ? "plcvl"
                          : selectedStage ===
                            "psych"
                          ? "psych"
                          : selectedStage ===
                            "ea"
                          ? "ea"
                          : "cvl"
                      )}
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

              <div
                className="modalBody"
                style={{
                  height: "auto",
                  maxHeight:
                    "calc(90vh - 105px)",
                }}
              >
                <StageContent
                  stage={selectedStage}
                />
              </div>
            </div>
          </div>
        )}

      {/* =================================================
          GENERAL CASE MODAL
          SOLO CUANDO VIENE DE CASES/KPI
      ================================================= */}

      {selectedCase &&
        openCaseSource === "cases" && (
          <div
            className="modalOverlay"
            onMouseDown={() =>
              setSelectedCase(null)
            }
          >
            <div
              className="caseModal"
              onMouseDown={(e) =>
                e.stopPropagation()
              }
            >
              <div className="modalHeader">
                <div>
                  <p className="eyebrow">
                    CASE DETAILS
                  </p>

                  <h2>
                    {selectedCase[
                      "CLIENTE"
                    ] || "Sin cliente"}
                  </h2>

                  <div className="caseMeta">
                    <span>
                      ID{" "}
                      {selectedCase["ID"] ||
                        "—"}
                    </span>

                    <span>
                      {selectedCase[
                        "DUE DATE/NO DUE DATE"
                      ] || "—"}
                    </span>

                    <span
                      className={statusClass(
                        selectedCase[
                          "STATUS"
                        ] || ""
                      )}
                    >
                      {selectedCase[
                        "STATUS"
                      ] || "NO STATUS"}
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
                <section className="detailSection">
                  <div className="detailSectionHeader">
                    <div className="stageIcon">
                      01
                    </div>

                    <div>
                      <h3>General</h3>
                      <p>
                        Información principal
                        del caso
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
                      label="Status"
                      header="STATUS"
                      type="select"
                      options={[
                        "WORKING",
                        "MGM REVIEW",
                        "SENT TO USCIS",
                        "SPECIAL CASE",
                        "CANCELLED/CLOSED",
                      ]}
                    />

                    <Field
                      label="Sent to MGM"
                      header="SENT TO MGM"
                      type="date"
                    />
                  </div>

                  <Field
                    label="Nota"
                    header="NOTA"
                    type="textarea"
                  />
                </section>

                <StageContent stage="psych" />
                <StageContent stage="caratula" />
                <StageContent stage="draft" />
                <StageContent stage="plcvl" />
                <StageContent stage="ea" />
                <StageContent stage="cvl" />
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
