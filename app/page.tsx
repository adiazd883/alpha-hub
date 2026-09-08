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

type MainView = "dashboard" | "cases" | "team" | "history" | "accountability";

type TeamGroup = "paralegal" | "psych" | "ea";

type TeamCalendar =
  | "mgm"
  | "caratula"
  | "draft"
  | "plcvl"
  | "psych"
  | "ea"
  | "cvl";

type TeamViewMode = "calendar" | "table";

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

type OpenCaseSource = "cases" | "calendar";

type Stats = {
  backlog: number;
  pending: number;
  future: number;
};

type DeliveryDetailItem = {
  client: string;
  date?: string;
};

type DeliveryDetail = {
  title: string;
  subtitle: string;
  items: DeliveryDetailItem[];
} | null;

type AccountabilityStageResult = {
  stage: TeamCalendar;
  label: string;
  expectedLabel: string;
  meta: number;
  delivered: number;
  backlog: number;
  scheduled: number;
  advanced: number;
  productivity: number | null;
  rows: {
    client: string;
    expected: string;
    done: string;
    delivered: boolean;
    backlog: boolean;
  }[];
  advancedRows: {
    client: string;
    expected: string;
    done: string;
  }[];
};

type AccountabilityCollaborator = {
  name: string;
  stages: AccountabilityStageResult[];
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

const weekDays = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

const norm = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, " ");

const parseDateOnly = (value: string): Date | null => {
  const raw = value?.trim();

  if (!raw) {
    return null;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

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

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

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

  if (!parsed) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const formatDate = (value: string) => {
  const parsed = parseDateOnly(value);

  if (!parsed) {
    return value || "—";
  }

  return parsed.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

const getIsoWeekNumber = (date: Date) => {
  const tempDate = new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    )
  );

  const dayNumber = tempDate.getUTCDay() || 7;

  tempDate.setUTCDate(
    tempDate.getUTCDate() + 4 - dayNumber
  );

  const yearStart = new Date(
    Date.UTC(tempDate.getUTCFullYear(), 0, 1)
  );

  return Math.ceil(
    ((tempDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
};

const getDeliveryWeekLabel = (date: Date) =>
  `Semana ${getIsoWeekNumber(date)}`;

const classifyDate = (date: Date): KpiType => {
  const currentWeekStart = startOfWeek(new Date());

  const nextWeekStart = addDays(
    currentWeekStart,
    7
  );

  if (
    date.getTime() <
    currentWeekStart.getTime()
  ) {
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

/* =========================
   KPI
   ========================= */

const getMgmKpi = (row: CaseRow): KpiType => {
  const type = norm(
    row["DUE DATE/NO DUE DATE"] || ""
  );

  if (
    ![
      "DUE DATE",
      "NO DUE DATE",
      "NOID",
    ].includes(type)
  ) {
    return "none";
  }

  const status = norm(
    row["STATUS"] || ""
  );

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

  if (!date) {
    return "none";
  }

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

  if (
    (row["DONE (doe)"] || "").trim()
  ) {
    return "none";
  }

  const date = parseDateOnly(
    row["EXPECTED DONE (doe)"] || ""
  );

  if (!date) {
    return "none";
  }

  return classifyDate(date);
};

const getCaratulaKpi = (
  row: CaseRow
): KpiType => {
  if (
    (row["CARATULA DONE"] || "").trim()
  ) {
    return "none";
  }

  const date = parseDateOnly(
    row["CARÁTULA EXPECTED DONE"] || ""
  );

  if (!date) {
    return "none";
  }

  return classifyDate(date);
};

const getDraftKpi = (
  row: CaseRow
): KpiType => {
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

  if (
    (row["1ST DRAFT DONE"] || "").trim()
  ) {
    return "none";
  }

  const date = parseDateOnly(
    row["1ST DRAFT EXP DONE"] || ""
  );

  if (!date) {
    return "none";
  }

  return classifyDate(date);
};

const getPlCvlKpi = (
  row: CaseRow
): KpiType => {
  if (
    (row["PL CVL DONE"] || "").trim()
  ) {
    return "none";
  }

  const date = parseDateOnly(
    row["PL CVL EXPECTED DONE"] || ""
  );

  if (!date) {
    return "none";
  }

  return classifyDate(date);
};

const getEaKpi = (
  row: CaseRow
): KpiType => {
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

  if (
    (row["EA DONE"] || "").trim()
  ) {
    return "none";
  }

  const date = parseDateOnly(
    row["EA EXPECTED DONE"] || ""
  );

  if (!date) {
    return "none";
  }

  return classifyDate(date);
};

const getCvlKpi = (
  row: CaseRow
): KpiType => {
  const status = norm(
    row["CVL STATUS"] || ""
  );

  if (
    [
      "NA",
      "N/A",
      "CANCELLED",
      "CANCELED",
    ].includes(status)
  ) {
    return "none";
  }

  if (
    (row["DONE CVL"] || "").trim()
  ) {
    return "none";
  }

  const date = parseDateOnly(
    row["CVL EXPECTED DONE"] || ""
  );

  if (!date) {
    return "none";
  }

  return classifyDate(date);
};

const getKpiGetter = (
  section: KpiSection
) => {
  if (section === "mgm") return getMgmKpi;
  if (section === "psych") return getPsychKpi;
  if (section === "caratula") return getCaratulaKpi;
  if (section === "draft") return getDraftKpi;
  if (section === "plcvl") return getPlCvlKpi;
  if (section === "ea") return getEaKpi;

  return getCvlKpi;
};

/* =========================
   TEAM
   ========================= */

const collaboratorHeader = (
  stage: TeamCalendar
) => {
  if (stage === "mgm") {
    return "__PARALEGAL_DRAFT";
  }

  if (stage === "caratula") {
    return "__PARALEGAL_CARATULA";
  }

  if (stage === "draft") {
    return "__PARALEGAL_DRAFT";
  }

  if (stage === "plcvl") {
    return "__PARALEGAL_PLCVL";
  }

  if (stage === "psych") {
    return "PSYCH";
  }

  if (stage === "ea") {
    return "EA MEMBER";
  }

  return "CVL MEMBER";
};

const calendarDateHeader = (
  stage: TeamCalendar
) => {
  if (stage === "mgm") {
    return "COMMITMENT";
  }

  if (stage === "caratula") {
    return "CARÁTULA EXPECTED DONE";
  }

  if (stage === "draft") {
    return "1ST DRAFT EXP DONE";
  }

  if (stage === "plcvl") {
    return "PL CVL EXPECTED DONE";
  }

  if (stage === "psych") {
    return "EXPECTED DONE (doe)";
  }

  if (stage === "ea") {
    return "EA EXPECTED DONE";
  }

  return "CVL EXPECTED DONE";
};

const doneDateHeader = (
  stage: TeamCalendar
) => {
  if (stage === "mgm") {
    return "SENT TO MGM";
  }

  if (stage === "caratula") {
    return "CARATULA DONE";
  }

  if (stage === "draft") {
    return "1ST DRAFT DONE";
  }

  if (stage === "plcvl") {
    return "PL CVL DONE";
  }

  if (stage === "psych") {
    return "DONE (doe)";
  }

  if (stage === "ea") {
    return "EA DONE";
  }

  return "DONE CVL";
};

const calendarStatusHeader = (
  stage: TeamCalendar
) => {
  if (stage === "mgm") {
    return "STATUS";
  }

  if (stage === "draft") {
    return "STATUS 1ST DRAFT";
  }

  if (stage === "psych") {
    return "DOE STATUS";
  }

  if (stage === "ea") {
    return "EA STATUS";
  }

  if (stage === "cvl") {
    return "CVL STATUS";
  }

  return "";
};

const calendarActive = (
  row: CaseRow,
  stage: TeamCalendar
) => {
  if (stage === "mgm") {
    return (
      getMgmKpi(row) !== "none" &&
      !(row["SENT TO MGM"] || "").trim()
    );
  }

  if (stage === "caratula") {
    return getCaratulaKpi(row) !== "none";
  }

  if (stage === "draft") {
    return getDraftKpi(row) !== "none";
  }

  if (stage === "plcvl") {
    return getPlCvlKpi(row) !== "none";
  }

  if (stage === "psych") {
    return getPsychKpi(row) !== "none";
  }

  if (stage === "ea") {
    return getEaKpi(row) !== "none";
  }

  return getCvlKpi(row) !== "none";
};

/*
  IMPORTANTE:
  carga programada ignora DONE.
  Así una entrega completada NO desaparece
  del total que originalmente debía hacerse.
*/

const scheduledEligible = (
  row: CaseRow,
  stage: TeamCalendar
) => {
  const expectedDate = parseDateOnly(
    row[calendarDateHeader(stage)] || ""
  );

  if (!expectedDate) {
    return false;
  }

  if (stage === "mgm") {
    const type = norm(
      row["DUE DATE/NO DUE DATE"] || ""
    );

    if (
      ![
        "DUE DATE",
        "NO DUE DATE",
        "NOID",
      ].includes(type)
    ) {
      return false;
    }

    const status = norm(
      row["STATUS"] || ""
    );

    return ![
      "SPECIAL CASE",
      "CANCELLED/CLOSED",
    ].includes(status);
  }

  if (stage === "draft") {
    const status = norm(
      row["STATUS 1ST DRAFT"] || ""
    );

    return ![
      "NA",
      "N/A",
      "UNRESPONSIVE",
      "CANCELLED/CLOSED",
      "CANCELLED",
      "CANCELED",
      "SPECIAL CASE",
    ].includes(status);
  }

  if (stage === "psych") {
    const status = norm(
      row["DOE STATUS"] || ""
    );

    return ![
      "SPECIAL CASE",
      "NA",
      "N/A",
      "UNRESPONSIVE",
      "ON HOLD",
      "CANCELLED",
      "CANCELED",
      "CANCELLED/CLOSED",
    ].includes(status);
  }

  if (stage === "ea") {
    const status = norm(
      row["EA STATUS"] || ""
    );

    return ![
      "NA",
      "N/A",
      "SPECIAL CASE",
      "WAITING GMC",
    ].includes(status);
  }

  if (stage === "cvl") {
    const status = norm(
      row["CVL STATUS"] || ""
    );

    return ![
      "NA",
      "N/A",
      "CANCELLED",
      "CANCELED",
    ].includes(status);
  }

  return true;
};

const stageLabel = (
  stage: TeamCalendar
) => {
  if (stage === "mgm") {
    return "Escalación MGM";
  }

  if (stage === "caratula") {
    return "Carátula";
  }

  if (stage === "draft") {
    return "1st Draft";
  }

  if (stage === "plcvl") {
    return "Escalación CVL";
  }

  if (stage === "psych") {
    return "Psych · DOE";
  }

  if (stage === "ea") {
    return "EA · Analyst";
  }

  return "CVL";
};

const historyStageOptions: {
  value: TeamCalendar;
  label: string;
}[] = [
  {
    value: "mgm",
    label: "Paralegal · Escalación MGM",
  },
  {
    value: "caratula",
    label: "Paralegal · Carátula",
  },
  {
    value: "draft",
    label: "Paralegal · 1st Draft",
  },
  {
    value: "plcvl",
    label: "Paralegal · Escalación CVL",
  },
  {
    value: "psych",
    label: "Psych · DOE",
  },
  {
    value: "ea",
    label: "EA · Analyst",
  },
  {
    value: "cvl",
    label: "CVL",
  },
];

const monthInputValue = (
  date: Date
) =>
  `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;

const monthFromInput = (
  value: string
) => {
  const [year, month] = value
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    1
  );
};

const weeksIntersectingMonth = (
  monthDate: Date
) => {
  const first = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth(),
    1
  );

  const last = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0
  );

  const firstWeek = startOfWeek(first);

  const lastWeek = startOfWeek(last);

  const weeks: {
    week: number;
    start: Date;
    label: string;
  }[] = [];

  let cursor = new Date(firstWeek);

  while (
    cursor.getTime() <=
    lastWeek.getTime()
  ) {
    weeks.push({
      week: getIsoWeekNumber(cursor),
      start: new Date(cursor),
      label: `Semana ${getIsoWeekNumber(cursor)}`,
    });

    cursor = addDays(cursor, 7);
  }

  return weeks;
};

const accountabilityStages: TeamCalendar[] = [
  "mgm",
  "draft",
  "plcvl",
  "psych",
  "ea",
  "cvl",
];

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const accountabilityExpectedLabel = (stage: TeamCalendar) =>
  stage === "mgm" ? "COMMITMENT" : "EXPECTED DONE";

export default function Home() {
  const [user, setUser] =
    useState<User | null>(null);

  const [data, setData] =
    useState<{
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

  const [teamViewMode, setTeamViewMode] =
    useState<TeamViewMode>("calendar");

  const [
    collaboratorFilter,
    setCollaboratorFilter,
  ] = useState("");

  const [
    calendarMonth,
    setCalendarMonth,
  ] = useState(() => {
    const now = new Date();

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );
  });

  const [
    historyMonth,
    setHistoryMonth,
  ] = useState(() =>
    monthInputValue(new Date())
  );

  const [
    historyStage,
    setHistoryStage,
  ] = useState<TeamCalendar>("draft");

  const [
    accountabilityWeekStart,
    setAccountabilityWeekStart,
  ] = useState(() =>
    addDays(
      startOfWeek(new Date()),
      -7
    )
  );

  const [search, setSearch] =
    useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("");

  const [
    selectedCase,
    setSelectedCase,
  ] =
    useState<CaseRow | null>(null);

  const [
    openCaseSource,
    setOpenCaseSource,
  ] =
    useState<OpenCaseSource>("cases");

  const [
    selectedStage,
    setSelectedStage,
  ] =
    useState<TeamCalendar | null>(null);

  const [
    selectedKpi,
    setSelectedKpi,
  ] =
    useState<KpiSelection>(null);

  const [
    savingField,
    setSavingField,
  ] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const [deliveryDetail, setDeliveryDetail] =
    useState<DeliveryDetail>(null);

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

  const canReassign =
    role === "ADMIN" ||
    role === "TL";

  const canEditStage =
    role === "ADMIN" ||
    role === "TL" ||
    (
      role === "PARALEGAL" &&
      [
        "mgm",
        "caratula",
        "draft",
        "plcvl",
      ].includes(selectedStage || "")
    ) ||
    (
      role === "PSYCH" &&
      selectedStage === "psych"
    ) ||
    (
      role === "ANALYST" &&
      ["ea", "cvl"].includes(
        selectedStage || ""
      )
    );

  async function loadUser() {
    try {
      const response = await fetch(
        "/api/auth/me",
        {
          cache: "no-store",
        }
      );

      setUser(
        await response.json()
      );
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

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "No se pudieron cargar los casos"
        );
      }

      setData(json);
    } catch (e) {
      setError(
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

  useEffect(() => {
    setCollaboratorFilter("");
  }, [teamCalendar]);

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

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "No se pudo guardar"
        );
      }

      setData((prev) => ({
        ...prev,

        rows: prev.rows.map(
          (row) =>
            row.__row ===
            String(rowNumber)
              ? {
                  ...row,
                  [header]: value,
                }
              : row
        ),
      }));

      setSelectedCase((prev) =>
        prev?.__row ===
        String(rowNumber)
          ? {
              ...prev,
              [header]: value,
            }
          : prev
      );

      setMessage(
        "Cambio guardado en Google Sheets"
      );

      window.setTimeout(
        () => setMessage(""),
        2200
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Error"
      );
    } finally {
      setSavingField(null);
    }
  }

  async function saveExactColumn(
    rowNumber: number,
    column: string,
    localHeader: string,
    value: string
  ) {
    setSavingField(localHeader);
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

            columnChanges: {
              [column]: value,
            },
          }),
        }
      );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "No se pudo reasignar"
        );
      }

      setData((prev) => ({
        ...prev,

        rows: prev.rows.map(
          (row) =>
            row.__row ===
            String(rowNumber)
              ? {
                  ...row,
                  [localHeader]:
                    value,
                }
              : row
        ),
      }));

      setSelectedCase((prev) =>
        prev?.__row ===
        String(rowNumber)
          ? {
              ...prev,
              [localHeader]:
                value,
            }
          : prev
      );

      setMessage(
        "Colaborador reasignado"
      );

      window.setTimeout(
        () => setMessage(""),
        2200
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Error"
      );
    } finally {
      setSavingField(null);
    }
  }

  function openGeneralCase(
    row: CaseRow
  ) {
    setOpenCaseSource("cases");
    setSelectedStage(null);
    setSelectedCase(row);
  }

  function openTeamCase(
    row: CaseRow,
    stage: TeamCalendar
  ) {
    setOpenCaseSource("calendar");
    setSelectedStage(stage);
    setSelectedCase(row);
  }

  const calculateStats = (
    section: KpiSection
  ): Stats => {
    const getter =
      getKpiGetter(section);

    let backlog = 0;
    let pending = 0;
    let future = 0;

    data.rows.forEach(
      (row) => {
        const result =
          getter(row);

        if (
          result === "backlog"
        ) {
          backlog++;
        }

        if (
          result === "pending"
        ) {
          pending++;
        }

        if (
          result === "future"
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
  };

  const mgmStats =
    useMemo(
      () => calculateStats("mgm"),
      [data.rows]
    );

  const psychStats =
    useMemo(
      () => calculateStats("psych"),
      [data.rows]
    );

  const caratulaStats =
    useMemo(
      () =>
        calculateStats("caratula"),
      [data.rows]
    );

  const draftStats =
    useMemo(
      () => calculateStats("draft"),
      [data.rows]
    );

  const plcvlStats =
    useMemo(
      () => calculateStats("plcvl"),
      [data.rows]
    );

  const eaStats =
    useMemo(
      () => calculateStats("ea"),
      [data.rows]
    );

  const cvlStats =
    useMemo(
      () => calculateStats("cvl"),
      [data.rows]
    );

  const filteredCases =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      return data.rows.filter(
        (row) => {
          const matchesSearch =
            !q ||
            (
              row["CLIENTE"] ||
              ""
            )
              .toLowerCase()
              .includes(q) ||
            (
              row["ID"] ||
              ""
            )
              .toLowerCase()
              .includes(q) ||
            (
              row[
                "RECEIPT NUMBER"
              ] ||
              ""
            )
              .toLowerCase()
              .includes(q);

          const matchesStatus =
            !statusFilter ||
            norm(
              row["STATUS"] ||
                ""
            ) ===
              norm(
                statusFilter
              );

          return (
            matchesSearch &&
            matchesStatus
          );
        }
      );
    }, [
      data.rows,
      search,
      statusFilter,
    ]);

  const kpiCases =
    useMemo(() => {
      if (!selectedKpi) {
        return [];
      }

      const getter =
        getKpiGetter(
          selectedKpi.section
        );

      return data.rows.filter(
        (row) =>
          getter(row) ===
          selectedKpi.type
      );
    }, [
      data.rows,
      selectedKpi,
    ]);

  const sectionLabel = (
    section: KpiSection
  ) => {
    if (section === "mgm") {
      return "Entregas MGM";
    }

    if (section === "psych") {
      return "Psych";
    }

    if (
      section === "caratula"
    ) {
      return "Llenado de Carátula";
    }

    if (section === "draft") {
      return "1st Draft";
    }

    if (section === "plcvl") {
      return "Escalación CVL";
    }

    if (section === "ea") {
      return "EA · Analyst";
    }

    return "CVL";
  };

  const currentCollaboratorHeader =
    collaboratorHeader(
      teamCalendar
    );

  const currentDateHeader =
    calendarDateHeader(
      teamCalendar
    );

  const currentStatusHeader =
    calendarStatusHeader(
      teamCalendar
    );

  const teamActiveRows =
    useMemo(
      () =>
        data.rows.filter(
          (row) =>
            calendarActive(
              row,
              teamCalendar
            )
        ),
      [
        data.rows,
        teamCalendar,
      ]
    );

  const paralegalOptions =
    useMemo(() => {
      const values =
        data.rows.flatMap(
          (row) => [
            row[
              "__PARALEGAL_CARATULA"
            ] || "",

            row[
              "__PARALEGAL_DRAFT"
            ] || "",

            row[
              "__PARALEGAL_PLCVL"
            ] || "",
          ]
        );

      return Array.from(
        new Set(
          values
            .map((v) =>
              v.trim()
            )
            .filter(Boolean)
        )
      ).sort((a, b) =>
        a.localeCompare(b)
      );
    }, [data.rows]);

  const psychOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            data.rows
              .map(
                (row) =>
                  (
                    row["PSYCH"] ||
                    ""
                  ).trim()
              )
              .filter(Boolean)
          )
        ).sort((a, b) =>
          a.localeCompare(b)
        ),
      [data.rows]
    );

  const eaOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            data.rows
              .map(
                (row) =>
                  (
                    row[
                      "EA MEMBER"
                    ] || ""
                  ).trim()
              )
              .filter(Boolean)
          )
        ).sort((a, b) =>
          a.localeCompare(b)
        ),
      [data.rows]
    );

  const cvlOptions =
    useMemo(
      () =>
        Array.from(
          new Set(
            data.rows
              .map(
                (row) =>
                  (
                    row[
                      "CVL MEMBER"
                    ] || ""
                  ).trim()
              )
              .filter(Boolean)
          )
        ).sort((a, b) =>
          a.localeCompare(b)
        ),
      [data.rows]
    );

  const collaborators =
    useMemo(() => {
      const names =
        teamActiveRows
          .map(
            (row) =>
              (
                row[
                  currentCollaboratorHeader
                ] || ""
              ).trim()
          )
          .filter(Boolean);

      const uniqueNames =
        Array.from(
          new Set(names)
        ).sort((a, b) =>
          a.localeCompare(b)
        );

      const hasUnassigned =
        teamActiveRows.some(
          (row) =>
            !(
              row[
                currentCollaboratorHeader
              ] || ""
            ).trim()
        );

      return {
        names:
          uniqueNames,
        hasUnassigned,
      };
    }, [
      teamActiveRows,
      currentCollaboratorHeader,
    ]);

  const filteredTeamRows =
    useMemo(() => {
      if (
        !collaboratorFilter
      ) {
        return teamActiveRows;
      }

      if (
        collaboratorFilter ===
        "__UNASSIGNED__"
      ) {
        return teamActiveRows.filter(
          (row) =>
            !(
              row[
                currentCollaboratorHeader
              ] || ""
            ).trim()
        );
      }

      return teamActiveRows.filter(
        (row) =>
          norm(
            row[
              currentCollaboratorHeader
            ] || ""
          ) ===
          norm(
            collaboratorFilter
          )
      );
    }, [
      teamActiveRows,
      collaboratorFilter,
      currentCollaboratorHeader,
    ]);

  /* =========================
     CARGA PROGRAMADA
     ========================= */

  const workloadWeeks =
    useMemo(
      () =>
        weeksIntersectingMonth(
          calendarMonth
        ),
      [calendarMonth]
    );

  const scheduledWorkload =
    useMemo(() => {
      const collaboratorKey =
        collaboratorHeader(
          teamCalendar
        );

      const expectedKey =
        calendarDateHeader(
          teamCalendar
        );

      const rows =
        data.rows.filter(
          (row) =>
            scheduledEligible(
              row,
              teamCalendar
            )
        );

      const monthStart =
        new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth(),
          1
        );

      const monthEnd =
        new Date(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth() +
            1,
          0
        );

      const names =
        new Set<string>();

      rows.forEach(
        (row) => {
          const date =
            parseDateOnly(
              row[expectedKey] ||
                ""
            );

          if (!date) {
            return;
          }

          if (
            date.getTime() <
              monthStart.getTime() ||
            date.getTime() >
              monthEnd.getTime()
          ) {
            return;
          }

          const name =
            (
              row[
                collaboratorKey
              ] || ""
            ).trim() ||
            "Sin asignar";

          names.add(name);
        }
      );

      const sortedNames =
        Array.from(
          names
        ).sort((a, b) => {
          if (
            a === "Sin asignar"
          ) {
            return 1;
          }

          if (
            b === "Sin asignar"
          ) {
            return -1;
          }

          return a.localeCompare(
            b
          );
        });

      return sortedNames.map(
        (name) => {
          const counts: Record<
            number,
            number
          > = {};

          const items: Record<
            number,
            DeliveryDetailItem[]
          > = {};

          workloadWeeks.forEach(
            (week) => {
              counts[
                week.week
              ] = 0;

              items[
                week.week
              ] = [];
            }
          );

          rows.forEach(
            (row) => {
              const date =
                parseDateOnly(
                  row[
                    expectedKey
                  ] || ""
                );

              if (!date) {
                return;
              }

              if (
                date.getTime() <
                  monthStart.getTime() ||
                date.getTime() >
                  monthEnd.getTime()
              ) {
                return;
              }

              const rowName =
                (
                  row[
                    collaboratorKey
                  ] || ""
                ).trim() ||
                "Sin asignar";

              if (
                rowName !== name
              ) {
                return;
              }

              const week =
                getIsoWeekNumber(
                  date
                );

              counts[week] =
                (
                  counts[week] ||
                  0
                ) + 1;

              if (!items[week]) {
                items[week] = [];
              }

              items[week].push({
                client:
                  row["CLIENTE"] ||
                  "Sin cliente",
              });
            }
          );

          return {
            name,
            counts,
            items,

            total:
              Object.values(
                counts
              ).reduce(
                (
                  sum,
                  value
                ) =>
                  sum +
                  value,
                0
              ),
          };
        }
      );
    }, [
      data.rows,
      teamCalendar,
      calendarMonth,
      workloadWeeks,
    ]);

  const scheduledMonthTotal =
    useMemo(
      () =>
        scheduledWorkload.reduce(
          (sum, item) =>
            sum +
            item.total,
          0
        ),
      [scheduledWorkload]
    );

  /* =========================
     HISTÓRICO
     ========================= */

  const historyMonthDate =
    useMemo(
      () =>
        monthFromInput(
          historyMonth
        ),
      [historyMonth]
    );

  const historyWeeks =
    useMemo(
      () =>
        weeksIntersectingMonth(
          historyMonthDate
        ),
      [historyMonthDate]
    );

  const historyData =
    useMemo(() => {
      const collaboratorKey =
        collaboratorHeader(
          historyStage
        );

      const doneKey =
        doneDateHeader(
          historyStage
        );

      const monthStart =
        new Date(
          historyMonthDate.getFullYear(),
          historyMonthDate.getMonth(),
          1
        );

      const monthEnd =
        new Date(
          historyMonthDate.getFullYear(),
          historyMonthDate.getMonth() +
            1,
          0
        );

      const completedRows =
        data.rows
          .map(
            (row) => ({
              row,

              done:
                parseDateOnly(
                  row[doneKey] ||
                    ""
                ),
            })
          )
          .filter(
            (
              item
            ): item is {
              row: CaseRow;
              done: Date;
            } => !!item.done
          )
          .filter(
            ({ done }) =>
              done.getTime() >=
                monthStart.getTime() &&
              done.getTime() <=
                monthEnd.getTime()
          );

      const collaboratorsSet =
        new Set<string>();

      completedRows.forEach(
        ({ row }) => {
          const collaborator =
            (
              row[
                collaboratorKey
              ] || ""
            ).trim() ||
            "Sin asignar";

          collaboratorsSet.add(
            collaborator
          );
        }
      );

      const names =
        Array.from(
          collaboratorsSet
        ).sort((a, b) => {
          if (
            a === "Sin asignar"
          ) {
            return 1;
          }

          if (
            b === "Sin asignar"
          ) {
            return -1;
          }

          return a.localeCompare(
            b
          );
        });

      const points =
        historyWeeks.map(
          (week) => {
            const values: Record<
              string,
              number
            > = {};

            const items: Record<
              string,
              DeliveryDetailItem[]
            > = {};

            names.forEach(
              (name) => {
                values[name] = 0;
                items[name] = [];
              }
            );

            completedRows.forEach(
              ({
                row,
                done,
              }) => {
                const weekNumber =
                  getIsoWeekNumber(
                    done
                  );

                if (
                  weekNumber !==
                  week.week
                ) {
                  return;
                }

                const collaborator =
                  (
                    row[
                      collaboratorKey
                    ] || ""
                  ).trim() ||
                  "Sin asignar";

                values[
                  collaborator
                ] =
                  (
                    values[
                      collaborator
                    ] || 0
                  ) + 1;

                if (!items[collaborator]) {
                  items[collaborator] = [];
                }

                items[collaborator].push({
                  client:
                    row["CLIENTE"] ||
                    "Sin cliente",
                  date: formatDate(
                    row[doneKey] || ""
                  ),
                });
              }
            );

            return {
              week:
                week.week,
              label:
                week.label,
              values,
              items,
            };
          }
        );

      const totals =
        names.map(
          (name) => ({
            name,

            total:
              points.reduce(
                (
                  sum,
                  point
                ) =>
                  sum +
                  (
                    point
                      .values[
                      name
                    ] || 0
                  ),
                0
              ),

            items:
              points.flatMap(
                (point) =>
                  point.items[name] || []
              ),
          })
        );

      return {
        names,
        points,
        totals,
        totalCompleted:
          completedRows.length,
      };
    }, [
      data.rows,
      historyStage,
      historyMonthDate,
      historyWeeks,
    ]);

  const historyChart =
    useMemo(() => {
      const width = 920;
      const height = 330;

      const left = 48;
      const right = 24;
      const top = 28;
      const bottom = 48;

      const plotWidth =
        width -
        left -
        right;

      const plotHeight =
        height -
        top -
        bottom;

      const maxValue =
        Math.max(
          1,

          ...historyData.points.flatMap(
            (point) =>
              Object.values(
                point.values
              )
          )
        );

      const yMax =
        Math.max(
          4,
          Math.ceil(
            maxValue / 2
          ) * 2
        );

      const xForIndex = (
        index: number
      ) => {
        if (
          historyData.points
            .length <= 1
        ) {
          return (
            left +
            plotWidth / 2
          );
        }

        return (
          left +
          (
            index /
            (
              historyData
                .points.length -
              1
            )
          ) *
            plotWidth
        );
      };

      const yForValue = (
        value: number
      ) =>
        top +
        plotHeight -
        (
          value /
          yMax
        ) *
          plotHeight;

      const yTicks =
        Array.from(
          {
            length: 5,
          },
          (_, index) =>
            Math.round(
              (
                yMax *
                index
              ) / 4
            )
        );

      return {
        width,
        height,
        left,
        right,
        top,
        bottom,
        plotWidth,
        plotHeight,
        yMax,
        yTicks,
        xForIndex,
        yForValue,
      };
    }, [historyData]);

  /* =========================
     RENDICIÓN DE CUENTAS
     ========================= */

  const accountabilityWeekEnd =
    useMemo(
      () =>
        addDays(
          accountabilityWeekStart,
          6
        ),
      [accountabilityWeekStart]
    );

  const latestCompletedWeekStart =
    useMemo(
      () =>
        addDays(
          startOfWeek(new Date()),
          -7
        ),
      []
    );

  const accountabilityVisibleStages =
    useMemo(() => {
      if (canSeeAllTeam) {
        return accountabilityStages;
      }

      if (role === "PARALEGAL") {
        return [
          "mgm",
          "draft",
          "plcvl",
        ] as TeamCalendar[];
      }

      if (role === "PSYCH") {
        return ["psych"] as TeamCalendar[];
      }

      if (role === "ANALYST") {
        return [
          "ea",
          "cvl",
        ] as TeamCalendar[];
      }

      return [] as TeamCalendar[];
    }, [
      canSeeAllTeam,
      role,
    ]);

  const accountabilityData =
    useMemo(() => {
      const collaboratorMap =
        new Map<
          string,
          Map<
            TeamCalendar,
            AccountabilityStageResult
          >
        >();

      accountabilityVisibleStages.forEach(
        (stage) => {
          const collaboratorKey =
            collaboratorHeader(stage);
          const expectedKey =
            calendarDateHeader(stage);
          const doneKey =
            doneDateHeader(stage);

          const byCollaborator =
            new Map<
              string,
              {
                metaRows: {
                  row: CaseRow;
                  expected: Date;
                  done: Date | null;
                }[];
                advancedRows: {
                  row: CaseRow;
                  expected: Date;
                  done: Date;
                }[];
              }
            >();

          data.rows.forEach((row) => {
            if (
              !scheduledEligible(
                row,
                stage
              )
            ) {
              return;
            }

            const expected =
              parseDateOnly(
                row[expectedKey] || ""
              );

            if (!expected) {
              return;
            }

            const done =
              parseDateOnly(
                row[doneKey] || ""
              );

            const collaborator =
              (
                row[
                  collaboratorKey
                ] || ""
              ).trim() ||
              "Sin asignar";

            if (
              !byCollaborator.has(
                collaborator
              )
            ) {
              byCollaborator.set(
                collaborator,
                {
                  metaRows: [],
                  advancedRows: [],
                }
              );
            }

            const bucket =
              byCollaborator.get(
                collaborator
              )!;

            const belongsToMeta =
              expected.getTime() <=
                accountabilityWeekEnd.getTime() &&
              (
                !done ||
                done.getTime() >=
                  accountabilityWeekStart.getTime()
              );

            if (belongsToMeta) {
              bucket.metaRows.push({
                row,
                expected,
                done,
              });
              return;
            }

            const isAdvanced =
              expected.getTime() >
                accountabilityWeekEnd.getTime() &&
              !!done &&
              done.getTime() >=
                accountabilityWeekStart.getTime() &&
              done.getTime() <=
                accountabilityWeekEnd.getTime();

            if (isAdvanced && done) {
              bucket.advancedRows.push({
                row,
                expected,
                done,
              });
            }
          });

          byCollaborator.forEach(
            (bucket, collaborator) => {
              const deliveredRows =
                bucket.metaRows.filter(
                  (item) =>
                    !!item.done &&
                    item.done.getTime() >=
                      accountabilityWeekStart.getTime() &&
                    item.done.getTime() <=
                      accountabilityWeekEnd.getTime()
                );

              const backlog =
                bucket.metaRows.filter(
                  (item) =>
                    item.expected.getTime() <
                    accountabilityWeekStart.getTime()
                ).length;

              const scheduled =
                bucket.metaRows.filter(
                  (item) =>
                    item.expected.getTime() >=
                      accountabilityWeekStart.getTime() &&
                    item.expected.getTime() <=
                      accountabilityWeekEnd.getTime()
                ).length;

              const meta =
                bucket.metaRows.length;
              const delivered =
                deliveredRows.length;

              if (
                meta === 0 &&
                bucket.advancedRows.length === 0
              ) {
                return;
              }

              const stageResult: AccountabilityStageResult = {
                stage,
                label: stageLabel(stage),
                expectedLabel:
                  accountabilityExpectedLabel(
                    stage
                  ),
                meta,
                delivered,
                backlog,
                scheduled,
                advanced:
                  bucket.advancedRows.length,
                productivity:
                  meta > 0
                    ? (delivered / meta) * 100
                    : null,
                rows:
                  bucket.metaRows
                    .sort(
                      (a, b) =>
                        a.expected.getTime() -
                        b.expected.getTime()
                    )
                    .map((item) => ({
                      client:
                        item.row[
                          "CLIENTE"
                        ] ||
                        "Sin cliente",
                      expected:
                        formatDate(
                          item.row[
                            expectedKey
                          ] || ""
                        ),
                      done:
                        item.done
                          ? formatDate(
                              item.row[
                                doneKey
                              ] || ""
                            )
                          : "—",
                      delivered:
                        !!item.done &&
                        item.done.getTime() >=
                          accountabilityWeekStart.getTime() &&
                        item.done.getTime() <=
                          accountabilityWeekEnd.getTime(),
                      backlog:
                        item.expected.getTime() <
                        accountabilityWeekStart.getTime(),
                    })),
                advancedRows:
                  bucket.advancedRows
                    .sort(
                      (a, b) =>
                        a.done.getTime() -
                        b.done.getTime()
                    )
                    .map((item) => ({
                      client:
                        item.row[
                          "CLIENTE"
                        ] ||
                        "Sin cliente",
                      expected:
                        formatDate(
                          item.row[
                            expectedKey
                          ] || ""
                        ),
                      done:
                        formatDate(
                          item.row[
                            doneKey
                          ] || ""
                        ),
                    })),
              };

              if (
                !collaboratorMap.has(
                  collaborator
                )
              ) {
                collaboratorMap.set(
                  collaborator,
                  new Map()
                );
              }

              collaboratorMap
                .get(collaborator)!
                .set(
                  stage,
                  stageResult
                );
            }
          );
        }
      );

      const collaborators: AccountabilityCollaborator[] =
        Array.from(
          collaboratorMap.entries()
        )
          .map(
            ([name, stageMap]) => ({
              name,
              stages:
                accountabilityVisibleStages
                  .map(
                    (stage) =>
                      stageMap.get(
                        stage
                      )
                  )
                  .filter(
                    (
                      item
                    ): item is AccountabilityStageResult =>
                      !!item
                  ),
            })
          )
          .sort((a, b) => {
            if (
              a.name ===
              "Sin asignar"
            ) {
              return 1;
            }

            if (
              b.name ===
              "Sin asignar"
            ) {
              return -1;
            }

            return a.name.localeCompare(
              b.name
            );
          });

      const meta =
        collaborators.reduce(
          (total, collaborator) =>
            total +
            collaborator.stages.reduce(
              (sum, stage) =>
                sum + stage.meta,
              0
            ),
          0
        );

      const delivered =
        collaborators.reduce(
          (total, collaborator) =>
            total +
            collaborator.stages.reduce(
              (sum, stage) =>
                sum + stage.delivered,
              0
            ),
          0
        );

      const advanced =
        collaborators.reduce(
          (total, collaborator) =>
            total +
            collaborator.stages.reduce(
              (sum, stage) =>
                sum + stage.advanced,
              0
            ),
          0
        );

      return {
        collaborators,
        meta,
        delivered,
        advanced,
        productivity:
          meta > 0
            ? (delivered / meta) * 100
            : null,
      };
    }, [
      data.rows,
      accountabilityVisibleStages,
      accountabilityWeekStart,
      accountabilityWeekEnd,
    ]);

  function previousAccountabilityWeek() {
    setAccountabilityWeekStart(
      addDays(
        accountabilityWeekStart,
        -7
      )
    );
  }

  function nextAccountabilityWeek() {
    const next = addDays(
      accountabilityWeekStart,
      7
    );

    if (
      next.getTime() <=
      latestCompletedWeekStart.getTime()
    ) {
      setAccountabilityWeekStart(
        next
      );
    }
  }

  const calendarDays =
    useMemo(() => {
      const year =
        calendarMonth.getFullYear();

      const month =
        calendarMonth.getMonth();

      const firstDay =
        new Date(
          year,
          month,
          1
        );

      const lastDay =
        new Date(
          year,
          month + 1,
          0
        );

      const mondayIndex =
        firstDay.getDay() ===
        0
          ? 6
          : firstDay.getDay() -
            1;

      const startDate =
        addDays(
          firstDay,
          -mondayIndex
        );

      const lastDayMondayIndex =
        lastDay.getDay() ===
        0
          ? 6
          : lastDay.getDay() -
            1;

      const remaining =
        6 -
        lastDayMondayIndex;

      const endDate =
        addDays(
          lastDay,
          remaining
        );

      const days: Date[] =
        [];

      let cursor =
        new Date(startDate);

      while (
        cursor.getTime() <=
        endDate.getTime()
      ) {
        days.push(
          new Date(cursor)
        );

        cursor =
          addDays(
            cursor,
            1
          );
      }

      return days;
    }, [calendarMonth]);

  const calendarEvents =
    useMemo(() => {
      return filteredTeamRows
        .map(
          (row) => ({
            row,

            date:
              parseDateOnly(
                row[
                  currentDateHeader
                ] || ""
              ),
          })
        )
        .filter(
          (
            item
          ): item is {
            row: CaseRow;
            date: Date;
          } => !!item.date
        );
    }, [
      filteredTeamRows,
      currentDateHeader,
    ]);

  const teamTableRows =
    useMemo(() => {
      return filteredTeamRows
        .map(
          (row) => ({
            row,

            date:
              parseDateOnly(
                row[
                  currentDateHeader
                ] || ""
              ),
          })
        )
        .filter(
          (
            item
          ): item is {
            row: CaseRow;
            date: Date;
          } => !!item.date
        )
        .sort(
          (a, b) =>
            a.date.getTime() -
            b.date.getTime()
        );
    }, [
      filteredTeamRows,
      currentDateHeader,
    ]);

  function previousMonth() {
    setCalendarMonth(
      new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() -
          1,
        1
      )
    );
  }

  function nextMonth() {
    setCalendarMonth(
      new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() +
          1,
        1
      )
    );
  }

  function goToday() {
    const today =
      new Date();

    setCalendarMonth(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )
    );
  }

  const statusClass = (
    status: string
  ) => {
    const value =
      norm(status);

    if (
      value === "DONE" ||
      value ===
        "SENT TO USCIS"
    ) {
      return "statusPill statusGreen";
    }

    if (
      value.includes(
        "REVIEW"
      ) ||
      value.includes(
        "CORRECTION"
      )
    ) {
      return "statusPill statusPurple";
    }

    if (
      value.includes(
        "CANCEL"
      ) ||
      value ===
        "SPECIAL CASE"
    ) {
      return "statusPill statusRed";
    }

    if (!value) {
      return "statusPill statusGray";
    }

    return "statusPill statusBlue";
  };

  function openDashboard() {
    setMainView("dashboard");
    setTeamOpen(false);
  }

  function openCases() {
    setMainView("cases");
    setTeamOpen(false);
  }

  function openHistory() {
    setMainView("history");
    setTeamOpen(false);
  }

  function openAccountability() {
    setMainView("accountability");
    setTeamOpen(false);
  }

  function toggleTeam() {
    setMainView("team");
    setTeamOpen(true);

    if (
      role === "PARALEGAL"
    ) {
      setTeamGroup(
        "paralegal"
      );

      setTeamCalendar(
        "caratula"
      );
    } else if (
      role === "PSYCH"
    ) {
      setTeamGroup(
        "psych"
      );

      setTeamCalendar(
        "psych"
      );
    } else if (
      role === "ANALYST"
    ) {
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
    setCollaboratorFilter("");

    if (
      group === "paralegal"
    ) {
      setTeamCalendar(
        "caratula"
      );
    }

    if (
      group === "psych"
    ) {
      setTeamCalendar(
        "psych"
      );
    }

    if (
      group === "ea"
    ) {
      setTeamCalendar("ea");
    }
  }

  function DashboardWorkflowRow({
    title,
    section,
    stats,
  }: {
    title: string;
    section: KpiSection;
    stats: Stats;
  }) {
    return (
      <div className="workflowLine">
        <div className="workflowLineName">
          <strong>
            {title}
          </strong>
        </div>

        <button
          className={`workflowMetric ${
            stats.backlog > 0
              ? "hasBacklog"
              : ""
          }`}
          onDoubleClick={() =>
            setSelectedKpi({
              section,
              type: "backlog",
            })
          }
        >
          <span>
            Backlog
          </span>

          <strong>
            {stats.backlog}
          </strong>
        </button>

        <button
          className="workflowMetric"
          onDoubleClick={() =>
            setSelectedKpi({
              section,
              type: "pending",
            })
          }
        >
          <span>
            Esta semana
          </span>

          <strong>
            {stats.pending}
          </strong>
        </button>

        <button
          className="workflowMetric"
          onDoubleClick={() =>
            setSelectedKpi({
              section,
              type: "future",
            })
          }
        >
          <span>
            Próximas
          </span>

          <strong>
            {stats.future}
          </strong>
        </button>
      </div>
    );
  }

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
    if (!selectedCase) {
      return null;
    }

    const value =
      selectedCase[
        header
      ] || "";

    const updateLocal = (
      newValue: string
    ) => {
      setSelectedCase({
        ...selectedCase,
        [header]:
          newValue,
      });
    };

    const locked =
      readOnly ||
      (
        openCaseSource ===
          "calendar" &&
        !canEditStage
      ) ||
      role === "MANAGER" ||
      role ===
        "COORDINATOR";

    return (
      <div className="detailField">
        <label>
          {label}
        </label>

        {locked ? (
          <div className="readValue">
            {value || "—"}
          </div>
        ) : type ===
          "textarea" ? (
          <textarea
            value={value}
            onChange={(e) =>
              updateLocal(
                e.target.value
              )
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
        ) : type ===
            "select" ? (
          <select
            value={value}
            onChange={(e) => {
              const newValue =
                e.target.value;

              updateLocal(
                newValue
              );

              saveField(
                Number(
                  selectedCase.__row
                ),
                header,
                newValue
              );
            }}
          >
            <option value="">
              —
            </option>

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
                ? toInputDate(
                    value
                  )
                : value
            }
            onChange={(e) =>
              updateLocal(
                e.target.value
              )
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

        {savingField ===
          header && (
          <span className="savingText">
            Guardando…
          </span>
        )}
      </div>
    );
  }

  function CollaboratorField({
    label,
    header,
    options,
    exactColumn,
  }: {
    label: string;
    header: string;
    options: string[];
    exactColumn?: string;
  }) {
    if (!selectedCase) {
      return null;
    }

    const value =
      selectedCase[
        header
      ] || "";

    if (!canReassign) {
      return (
        <div className="detailField">
          <label>
            {label}
          </label>

          <div className="readValue">
            {value ||
              "Sin asignar"}
          </div>
        </div>
      );
    }

    const allOptions =
      Array.from(
        new Set([
          ...options,

          ...(value
            ? [value]
            : []),
        ])
      ).sort((a, b) =>
        a.localeCompare(b)
      );

    return (
      <div className="detailField">
        <label>
          {label}
        </label>

        <select
          value={value}
          onChange={async (
            e
          ) => {
            const newValue =
              e.target.value;

            setSelectedCase({
              ...selectedCase,
              [header]:
                newValue,
            });

            if (
              exactColumn
            ) {
              await saveExactColumn(
                Number(
                  selectedCase.__row
                ),
                exactColumn,
                header,
                newValue
              );
            } else {
              await saveField(
                Number(
                  selectedCase.__row
                ),
                header,
                newValue
              );
            }
          }}
        >
          <option value="">
            Sin asignar
          </option>

          {allOptions.map(
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

        {savingField ===
          header && (
          <span className="savingText">
            Guardando…
          </span>
        )}
      </div>
    );
  }

  function StageContent({
    stage,
  }: {
    stage: TeamCalendar;
  }) {
    if (!selectedCase) {
      return null;
    }

    if (
      stage === "mgm"
    ) {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">
              MGM
            </div>

            <div>
              <h3>
                Paralegal · Escalación MGM
              </h3>

              <p>
                Entrega de escalación a MGM
              </p>
            </div>
          </div>

          <div className="fieldGrid">
            <CollaboratorField
              label="Paralegal"
              header="__PARALEGAL_DRAFT"
              exactColumn="S"
              options={
                paralegalOptions
              }
            />

            <Field
              label="Commitment"
              header="COMMITMENT"
              type="date"
              readOnly
            />

            <Field
              label="Sent to MGM"
              header="SENT TO MGM"
              type="date"
            />

            <Field
              label="Tipo"
              header="DUE DATE/NO DUE DATE"
              readOnly
            />
          </div>
        </section>
      );
    }

    if (
      stage === "caratula"
    ) {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">
              PL
            </div>

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
            <CollaboratorField
              label="Paralegal"
              header="__PARALEGAL_CARATULA"
              exactColumn="J"
              options={
                paralegalOptions
              }
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

    if (
      stage === "draft"
    ) {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">
              PL
            </div>

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
            <CollaboratorField
              label="Paralegal"
              header="__PARALEGAL_DRAFT"
              exactColumn="S"
              options={
                paralegalOptions
              }
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

    if (
      stage === "plcvl"
    ) {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">
              PL
            </div>

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
            <CollaboratorField
              label="Paralegal"
              header="__PARALEGAL_PLCVL"
              exactColumn="BN"
              options={
                paralegalOptions
              }
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

    if (
      stage === "psych"
    ) {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">
              PS
            </div>

            <div>
              <h3>
                Psych · DOE
              </h3>

              <p>
                Entrega de Psych
              </p>
            </div>
          </div>

          <div className="fieldGrid">
            <CollaboratorField
              label="Psych"
              header="PSYCH"
              options={
                psychOptions
              }
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

    if (
      stage === "ea"
    ) {
      return (
        <section className="detailSection">
          <div className="detailSectionHeader">
            <div className="stageIcon">
              EA
            </div>

            <div>
              <h3>
                EA · Analyst
              </h3>

              <p>
                Evidence Analysis
              </p>
            </div>
          </div>

          <div className="fieldGrid">
            <CollaboratorField
              label="EA Member"
              header="EA MEMBER"
              options={
                eaOptions
              }
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
          <div className="stageIcon">
            CV
          </div>

          <div>
            <h3>
              CVL
            </h3>

            <p>
              Entrega CVL
            </p>
          </div>
        </div>

        <div className="fieldGrid">
          <CollaboratorField
            label="CVL Member"
            header="CVL MEMBER"
            options={
              cvlOptions
            }
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

          <h1>
            Alpha Hub
          </h1>

          <p>
            Case operations workspace
          </p>

          <button
            className="primaryButton"
            onClick={() =>
              (
                window.location.href =
                  "/api/auth/login"
              )
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
      <aside className="sidebar">
        <div className="sidebarBrand">
          <div className="logoMark small">
            A
          </div>

          <div className="brandWords">
            <strong>
              ALPHA
            </strong>

            <span>
              HUB
            </span>
          </div>
        </div>

        <div className="navLabel">
          WORKSPACE
        </div>

        <nav className="sidebarNav">
          <button
            className={`navItem ${
              mainView ===
              "dashboard"
                ? "active"
                : ""
            }`}
            onClick={
              openDashboard
            }
          >
            <span className="navIcon">
              ⌂
            </span>

            <span>
              Dashboard
            </span>
          </button>

          <button
            className={`navItem ${
              mainView ===
              "cases"
                ? "active"
                : ""
            }`}
            onClick={
              openCases
            }
          >
            <span className="navIcon">
              ▦
            </span>

            <span>
              Cases
            </span>
          </button>

          <button
            className={`navItem ${
              mainView ===
              "team"
                ? "active"
                : ""
            }`}
            onClick={
              toggleTeam
            }
          >
            <span className="navIcon">
              ◉
            </span>

            <span className="teamNavText">
              Team
            </span>

            <span className="teamChevron">
              {teamOpen
                ? "⌃"
                : "⌄"}
            </span>
          </button>

          {teamOpen && (
            <div className="teamSubMenu">
              {canSeeParalegal && (
                <button
                  className={
                    teamGroup ===
                    "paralegal"
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
                    teamGroup ===
                    "psych"
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
                    teamGroup ===
                    "ea"
                      ? "teamSub active"
                      : "teamSub"
                  }
                  onClick={() =>
                    chooseTeamGroup(
                      "ea"
                    )
                  }
                >
                  EA
                </button>
              )}
            </div>
          )}

          <button
            className={`navItem ${
              mainView ===
              "history"
                ? "active"
                : ""
            }`}
            onClick={
              openHistory
            }
          >
            <span className="navIcon">
              ⌁
            </span>

            <span>
              Histórico KPI
            </span>
          </button>

          <button
            className={`navItem ${
              mainView ===
              "accountability"
                ? "active"
                : ""
            }`}
            onClick={
              openAccountability
            }
          >
            <span className="navIcon">
              ✓
            </span>

            <span>
              Rendición de cuentas
            </span>
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
              {
                roleLabels[
                  user.role as Role
                ]
              }
            </strong>

            <span>
              {user.email}
            </span>
          </div>

          <button
            className="logoutButton"
            onClick={() =>
              (
                window.location.href =
                  "/api/auth/logout"
              )
            }
          >
            ↗
          </button>
        </div>
      </aside>

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

        {mainView ===
          "dashboard" && (
          <>
            <header className="pageHeader">
              <div>
                <p className="eyebrow">
                  CASE OPERATIONS
                </p>

                <h1>
                  Dashboard
                </h1>

                <p>
                  Estado de las entregas activas por workflow.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={
                  loadCases
                }
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
                <section className="workflowGroup">
                  <div className="workflowGroupHeader">
                    <p className="dashboardSectionEyebrow">
                      PARALEGAL WORKFLOW
                    </p>

                    <h2>
                      Paralegal
                    </h2>

                    <p>
                      Preparación y avance del caso
                    </p>
                  </div>

                  <div className="workflowGroupBody">
                    <DashboardWorkflowRow
                      title="Escalación MGM"
                      section="mgm"
                      stats={
                        mgmStats
                      }
                    />

                    <DashboardWorkflowRow
                      title="Llenado de Carátula"
                      section="caratula"
                      stats={
                        caratulaStats
                      }
                    />

                    <DashboardWorkflowRow
                      title="1st Draft"
                      section="draft"
                      stats={
                        draftStats
                      }
                    />

                    <DashboardWorkflowRow
                      title="Escalación a CVL"
                      section="plcvl"
                      stats={
                        plcvlStats
                      }
                    />
                  </div>
                </section>

                <section className="workflowGroup">
                  <div className="workflowGroupHeader">
                    <p className="dashboardSectionEyebrow">
                      PSYCH WORKFLOW
                    </p>

                    <h2>
                      Psych
                    </h2>

                    <p>
                      DOE
                    </p>
                  </div>

                  <div className="workflowGroupBody">
                    <DashboardWorkflowRow
                      title="Psych · DOE"
                      section="psych"
                      stats={
                        psychStats
                      }
                    />
                  </div>
                </section>

                <section className="workflowGroup">
                  <div className="workflowGroupHeader">
                    <p className="dashboardSectionEyebrow">
                      ANALYST WORKFLOW
                    </p>

                    <h2>
                      EA
                    </h2>

                    <p>
                      Evidence Analysis y CVL
                    </p>
                  </div>

                  <div className="workflowGroupBody">
                    <DashboardWorkflowRow
                      title="EA / Analyst"
                      section="ea"
                      stats={
                        eaStats
                      }
                    />

                    <DashboardWorkflowRow
                      title="CVL"
                      section="cvl"
                      stats={
                        cvlStats
                      }
                    />
                  </div>
                </section>
              </div>
            )}
          </>
        )}

        {mainView ===
          "cases" && (
          <>
            <header className="pageHeader">
              <div>
                <p className="eyebrow">
                  CASE MANAGEMENT
                </p>

                <h1>
                  Cases
                </h1>

                <p>
                  Search, review and manage all cases.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={
                  loadCases
                }
              >
                ↻ Refresh
              </button>
            </header>

            <section className="casesPanel">
              <div className="casesToolbar">
                <div className="searchBox">
                  <span>
                    ⌕
                  </span>

                  <input
                    value={
                      search
                    }
                    onChange={(
                      e
                    ) =>
                      setSearch(
                        e
                          .target
                          .value
                      )
                    }
                    placeholder="Buscar cliente, ID o receipt..."
                  />
                </div>

                <select
                  className="filterSelect"
                  value={
                    statusFilter
                  }
                  onChange={(
                    e
                  ) =>
                    setStatusFilter(
                      e
                        .target
                        .value
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
                  {
                    filteredCases.length
                  }{" "}
                  casos
                </div>
              </div>

              <div className="casesTable">
                <div className="casesTableHeader">
                  <div>
                    CLIENTE
                  </div>

                  <div>
                    TIPO
                  </div>

                  <div>
                    COMMITMENT
                  </div>

                  <div>
                    PARALEGAL
                  </div>

                  <div>
                    STATUS
                  </div>

                  <div />
                </div>

                {filteredCases.map(
                  (row) => (
                    <button
                      key={
                        row.__row
                      }
                      className="caseTableRow"
                      onClick={() =>
                        openGeneralCase(
                          row
                        )
                      }
                    >
                      <div className="caseClient">
                        <div className="clientAvatar">
                          {(row[
                            "CLIENTE"
                          ] || "?")
                            .charAt(
                              0
                            )
                            .toUpperCase()}
                        </div>

                        <div>
                          <strong>
                            {row[
                              "CLIENTE"
                            ] ||
                              "Sin cliente"}
                          </strong>

                          <span>
                            ID{" "}
                            {row[
                              "ID"
                            ] ||
                              "—"}
                            {" · "}
                            {row[
                              "RECEIPT NUMBER"
                            ] ||
                              "No receipt"}
                          </span>
                        </div>
                      </div>

                      <div className="tableValue">
                        {row[
                          "DUE DATE/NO DUE DATE"
                        ] || "—"}
                      </div>

                      <div className="tableValue">
                        {row[
                          "COMMITMENT"
                        ] || "—"}
                      </div>

                      <div className="tableValue">
                        {row[
                          "__PARALEGAL_CARATULA"
                        ] || "—"}
                      </div>

                      <div>
                        <span
                          className={statusClass(
                            row[
                              "STATUS"
                            ] ||
                              ""
                          )}
                        >
                          {row[
                            "STATUS"
                          ] ||
                            "NO STATUS"}
                        </span>
                      </div>

                      <div className="rowArrow">
                        ›
                      </div>
                    </button>
                  )
                )}
              </div>
            </section>
          </>
        )}

        {mainView ===
          "team" && (
          <>
            <header className="pageHeader teamPageHeader">
              <div>
                <p className="eyebrow">
                  TEAM WORKLOAD
                </p>

                <h1>
                  Team
                </h1>

                <p>
                  Entregas activas del equipo.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={
                  loadCases
                }
              >
                ↻ Refresh
              </button>
            </header>

            {canSeeAllTeam && (
              <div className="teamGroupTabs">
                {canSeeParalegal && (
                  <button
                    className={
                      teamGroup ===
                      "paralegal"
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
                      teamGroup ===
                      "psych"
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
                      teamGroup ===
                      "ea"
                        ? "teamGroupTab active"
                        : "teamGroupTab"
                    }
                    onClick={() =>
                      chooseTeamGroup(
                        "ea"
                      )
                    }
                  >
                    EA
                  </button>
                )}
              </div>
            )}

            <div className="teamStageTabs">
              {teamGroup ===
                "paralegal" &&
                canSeeParalegal && (
                  <>
                    <button
                      className={
                        teamCalendar ===
                        "mgm"
                          ? "stageTab active"
                          : "stageTab"
                      }
                      onClick={() =>
                        setTeamCalendar(
                          "mgm"
                        )
                      }
                    >
                      Escalación MGM
                    </button>

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

              {teamGroup ===
                "psych" &&
                canSeePsych && (
                  <button className="stageTab active">
                    DOE
                  </button>
                )}

              {teamGroup ===
                "ea" &&
                canSeeEa && (
                  <>
                    <button
                      className={
                        teamCalendar ===
                        "ea"
                          ? "stageTab active"
                          : "stageTab"
                      }
                      onClick={() =>
                        setTeamCalendar(
                          "ea"
                        )
                      }
                    >
                      EA / Analyst
                    </button>

                    <button
                      className={
                        teamCalendar ===
                        "cvl"
                          ? "stageTab active"
                          : "stageTab"
                      }
                      onClick={() =>
                        setTeamCalendar(
                          "cvl"
                        )
                      }
                    >
                      CVL
                    </button>
                  </>
                )}
            </div>

            <div className="teamViewToolbar">
              <div className="teamViewSwitch">
                <button
                  className={
                    teamViewMode ===
                    "calendar"
                      ? "teamViewButton active"
                      : "teamViewButton"
                  }
                  onClick={() =>
                    setTeamViewMode(
                      "calendar"
                    )
                  }
                >
                  <span>
                    ▦
                  </span>

                  Calendario
                </button>

                <button
                  className={
                    teamViewMode ===
                    "table"
                      ? "teamViewButton active"
                      : "teamViewButton"
                  }
                  onClick={() =>
                    setTeamViewMode(
                      "table"
                    )
                  }
                >
                  <span>
                    ≡
                  </span>

                  Tabla
                </button>
              </div>

              <div className="collaboratorFilterBox">
                <span className="filterIcon">
                  ◎
                </span>

                <div className="collaboratorFilterText">
                  <span>
                    COLABORADOR
                  </span>

                  <select
                    value={
                      collaboratorFilter
                    }
                    onChange={(
                      e
                    ) =>
                      setCollaboratorFilter(
                        e
                          .target
                          .value
                      )
                    }
                  >
                    <option value="">
                      Todos
                    </option>

                    {collaborators.hasUnassigned && (
                      <option value="__UNASSIGNED__">
                        Sin asignar
                      </option>
                    )}

                    {collaborators.names.map(
                      (
                        collaborator
                      ) => (
                        <option
                          key={
                            collaborator
                          }
                          value={
                            collaborator
                          }
                        >
                          {collaborator}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
            </div>

            {teamViewMode ===
              "calendar" && (
              <section className="calendarCard">
                <div className="calendarToolbar">
                  <div className="calendarTitle">
                    <h2>
                      {
                        monthNames[
                          calendarMonth.getMonth()
                        ]
                      }{" "}
                      {
                        calendarMonth.getFullYear()
                      }
                    </h2>

                    <span>
                      {
                        calendarEvents.length
                      }{" "}
                      entregas activas
                    </span>
                  </div>

                  <div className="calendarControls">
                    <button
                      onClick={
                        previousMonth
                      }
                    >
                      ‹
                    </button>

                    <button
                      className="todayButton"
                      onClick={
                        goToday
                      }
                    >
                      Hoy
                    </button>

                    <button
                      onClick={
                        nextMonth
                      }
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div className="calendarWeekHeader">
                  {weekDays.map(
                    (day) => (
                      <div
                        key={
                          day
                        }
                      >
                        {day}
                      </div>
                    )
                  )}
                </div>

                <div className="calendarGrid">
                  {calendarDays.map(
                    (day) => {
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
                          (
                            event
                          ) =>
                            sameDay(
                              event.date,
                              day
                            )
                        );

                      return (
                        <div
                          key={
                            day.toISOString()
                          }
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
                              {
                                day.getDate()
                              }
                            </span>
                          </div>

                          <div className="calendarEvents">
                            {dayEvents.map(
                              ({
                                row,
                              }) => {
                                const status =
                                  currentStatusHeader
                                    ? row[
                                        currentStatusHeader
                                      ] ||
                                      ""
                                    : "";

                                const collaborator =
                                  (
                                    row[
                                      currentCollaboratorHeader
                                    ] ||
                                    ""
                                  ).trim();

                                const deliveryType =
                                  classifyDate(
                                    day
                                  );

                                return (
                                  <button
                                    key={
                                      row.__row
                                    }
                                    className={`calendarEvent ${
                                      deliveryType ===
                                      "backlog"
                                        ? "calendarEventBacklog"
                                        : deliveryType ===
                                          "pending"
                                        ? "calendarEventPending"
                                        : "calendarEventFuture"
                                    } ${
                                      !collaborator
                                        ? "calendarEventUnassigned"
                                        : ""
                                    }`}
                                    onClick={() =>
                                      openTeamCase(
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

                                    {!collaborator ? (
                                      <span className="unassignedEventLabel">
                                        Sin asignar
                                      </span>
                                    ) : status ? (
                                      <span>
                                        {status}
                                      </span>
                                    ) : (
                                      <span>
                                        {
                                          collaborator
                                        }
                                      </span>
                                    )}
                                  </button>
                                );
                              }
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              </section>
            )}

            {teamViewMode ===
              "table" && (
              <>
                <section className="workloadCard">
                  <div className="workloadHeader">
                    <div>
                      <p className="eyebrow">
                        CARGA PROGRAMADA
                      </p>

                      <h2>
                        Entregas que se deben realizar
                      </h2>

                      <p>
                        Se calcula por Expected Done. Si una entrega ya se completó, sigue contando en la carga original de esa semana.
                      </p>
                    </div>

                    <div className="workloadHeaderRight">
                      <div className="workloadTotal">
                        <span>
                          TOTAL DEL MES
                        </span>

                        <strong>
                          {
                            scheduledMonthTotal
                          }
                        </strong>
                      </div>

                      <div className="calendarControls">
                        <button
                          onClick={
                            previousMonth
                          }
                        >
                          ‹
                        </button>

                        <button
                          className="todayButton workloadMonthButton"
                          onClick={
                            goToday
                          }
                        >
                          {
                            monthNames[
                              calendarMonth.getMonth()
                            ]
                          }{" "}
                          {
                            calendarMonth.getFullYear()
                          }
                        </button>

                        <button
                          onClick={
                            nextMonth
                          }
                        >
                          ›
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="workloadTableWrap">
                    <div
                      className="workloadGrid workloadGridHeader"
                      style={{
                        gridTemplateColumns: `minmax(180px, 1.5fr) repeat(${workloadWeeks.length}, minmax(90px, .8fr)) minmax(80px, .7fr)`,
                      }}
                    >
                      <div>
                        COLABORADOR
                      </div>

                      {workloadWeeks.map(
                        (week) => (
                          <div
                            key={
                              week.week
                            }
                          >
                            {
                              week.label
                            }
                          </div>
                        )
                      )}

                      <div>
                        TOTAL
                      </div>
                    </div>

                    {scheduledWorkload.map(
                      (item) => (
                        <div
                          key={
                            item.name
                          }
                          className="workloadGrid workloadGridRow"
                          style={{
                            gridTemplateColumns: `minmax(180px, 1.5fr) repeat(${workloadWeeks.length}, minmax(90px, .8fr)) minmax(80px, .7fr)`,
                          }}
                        >
                          <div className="workloadPerson">
                            {item.name ===
                            "Sin asignar" ? (
                              <span className="unassignedPill">
                                Sin asignar
                              </span>
                            ) : (
                              <strong>
                                {
                                  item.name
                                }
                              </strong>
                            )}
                          </div>

                          {workloadWeeks.map(
                            (
                              week
                            ) => (
                              <div
                                key={
                                  week.week
                                }
                                className="workloadNumber"
                              >
                                {(item
                                  .counts[
                                  week
                                    .week
                                ] ||
                                  0) > 0 ? (
                                  <button
                                    className="workloadNumberButton"
                                    title="Doble clic para ver clientes"
                                    onDoubleClick={() =>
                                      setDeliveryDetail({
                                        title: item.name,
                                        subtitle: `${week.label} · ${item.counts[week.week]} entregas programadas`,
                                        items:
                                          item.items[
                                            week.week
                                          ] || [],
                                      })
                                    }
                                  >
                                    {item
                                      .counts[
                                      week
                                        .week
                                    ] || 0}
                                  </button>
                                ) : (
                                  <span>0</span>
                                )}
                              </div>
                            )
                          )}

                          <div className="workloadTotalCell">
                            {
                              item.total
                            }
                          </div>
                        </div>
                      )
                    )}

                    {!scheduledWorkload.length && (
                      <div className="emptyState">
                        No hay entregas programadas para este mes.
                      </div>
                    )}
                  </div>
                </section>

                <section className="teamTableCard">
                  <div className="teamTableTop">
                    <div>
                      <p className="eyebrow">
                        {stageLabel(
                          teamCalendar
                        )}
                      </p>

                      <h2>
                        Entregas activas
                      </h2>

                      <span>
                        {
                          teamTableRows.length
                        }{" "}
                        resultados
                      </span>
                    </div>
                  </div>

                  <div className="teamTableHeader">
                    <div>
                      CLIENTE
                    </div>

                    <div>
                      COLABORADOR
                    </div>

                    <div>
                      EXPECTED DONE
                    </div>

                    <div>
                      SEMANA DE ENTREGA
                    </div>

                    <div>
                      STATUS
                    </div>

                    <div>
                      ESTADO
                    </div>

                    <div />
                  </div>

                  <div className="teamTableBody">
                    {teamTableRows.map(
                      ({
                        row,
                        date,
                      }) => {
                        const status =
                          currentStatusHeader
                            ? row[
                                currentStatusHeader
                              ] ||
                              ""
                            : "";

                        const collaborator =
                          (
                            row[
                              currentCollaboratorHeader
                            ] || ""
                          ).trim();

                        const deliveryState =
                          classifyDate(
                            date
                          );

                        return (
                          <button
                            key={
                              row.__row
                            }
                            className="teamTableRow"
                            onClick={() =>
                              openTeamCase(
                                row,
                                teamCalendar
                              )
                            }
                          >
                            <div className="teamTableClient">
                              <div className="clientAvatar">
                                {(row[
                                  "CLIENTE"
                                ] || "?")
                                  .charAt(
                                    0
                                  )
                                  .toUpperCase()}
                              </div>

                              <div>
                                <strong>
                                  {row[
                                    "CLIENTE"
                                  ] ||
                                    "Sin cliente"}
                                </strong>

                                <span>
                                  ID{" "}
                                  {row[
                                    "ID"
                                  ] ||
                                    "—"}
                                </span>
                              </div>
                            </div>

                            <div className="teamTableValue">
                              {collaborator ? (
                                collaborator
                              ) : (
                                <span className="unassignedPill">
                                  Sin asignar
                                </span>
                              )}
                            </div>

                            <div className="teamTableValue teamDateValue">
                              {formatDate(
                                row[
                                  currentDateHeader
                                ] ||
                                  ""
                              )}
                            </div>

                            <div className="teamTableValue teamWeekValue">
                              {getDeliveryWeekLabel(
                                date
                              )}
                            </div>

                            <div>
                              {status ? (
                                <span
                                  className={statusClass(
                                    status
                                  )}
                                >
                                  {
                                    status
                                  }
                                </span>
                              ) : (
                                <span className="tableDash">
                                  —
                                </span>
                              )}
                            </div>

                            <div>
                              <span
                                className={`deliveryState ${
                                  deliveryState ===
                                  "backlog"
                                    ? "deliveryBacklog"
                                    : deliveryState ===
                                      "pending"
                                    ? "deliveryPending"
                                    : "deliveryFuture"
                                }`}
                              >
                                {deliveryState ===
                                "backlog"
                                  ? "Backlog"
                                  : deliveryState ===
                                    "pending"
                                  ? "Esta semana"
                                  : "Próxima"}
                              </span>
                            </div>

                            <div className="rowArrow">
                              ›
                            </div>
                          </button>
                        );
                      }
                    )}

                    {!teamTableRows.length && (
                      <div className="emptyState">
                        No hay entregas activas con este filtro.
                      </div>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        {mainView ===
          "accountability" && (
          <>
            <header className="pageHeader accountabilityPageHeader">
              <div>
                <p className="eyebrow">
                  WEEKLY ACCOUNTABILITY
                </p>

                <h1>
                  Rendición de cuentas
                </h1>

                <p>
                  Meta real de la semana vs entregas completadas. Carátulas no se consideran.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={
                  loadCases
                }
              >
                ↻ Refresh
              </button>
            </header>

            <section className="accountabilityWeekCard">
              <div className="accountabilityWeekInfo">
                <p className="eyebrow">
                  SEMANA AUDITADA
                </p>

                <h2>
                  Semana {getIsoWeekNumber(accountabilityWeekStart)}
                </h2>

                <span>
                  {formatDate(dateInputValue(accountabilityWeekStart))} – {formatDate(dateInputValue(accountabilityWeekEnd))}
                </span>
              </div>

              <div className="accountabilityWeekControls">
                <button
                  type="button"
                  className="accountabilityArrowButton"
                  onClick={
                    previousAccountabilityWeek
                  }
                  title="Semana anterior"
                >
                  ‹
                </button>

                <label className="accountabilityDateFilter">
                  <span>
                    IR A SEMANA
                  </span>

                  <input
                    type="date"
                    value={
                      dateInputValue(
                        accountabilityWeekStart
                      )
                    }
                    max={
                      dateInputValue(
                        addDays(
                          latestCompletedWeekStart,
                          6
                        )
                      )
                    }
                    onChange={(e) => {
                      const selected =
                        parseDateOnly(
                          e.target.value
                        );

                      if (!selected) {
                        return;
                      }

                      const selectedWeek =
                        startOfWeek(
                          selected
                        );

                      setAccountabilityWeekStart(
                        selectedWeek.getTime() >
                          latestCompletedWeekStart.getTime()
                          ? latestCompletedWeekStart
                          : selectedWeek
                      );
                    }}
                  />
                </label>

                <button
                  type="button"
                  className="accountabilityArrowButton"
                  onClick={
                    nextAccountabilityWeek
                  }
                  disabled={
                    accountabilityWeekStart.getTime() >=
                    latestCompletedWeekStart.getTime()
                  }
                  title="Semana siguiente"
                >
                  ›
                </button>
              </div>

              <div className="accountabilityGlobalSummary">
                <div>
                  <span>META</span>
                  <strong>{accountabilityData.meta}</strong>
                </div>

                <div>
                  <span>ENTREGAS</span>
                  <strong>{accountabilityData.delivered}</strong>
                </div>

                <div>
                  <span>ADELANTADAS</span>
                  <strong>{accountabilityData.advanced}</strong>
                </div>

                <div className="accountabilityProductivitySummary">
                  <span>PRODUCTIVIDAD</span>
                  <strong>
                    {accountabilityData.productivity === null
                      ? "—"
                      : `${accountabilityData.productivity.toFixed(1)}%`}
                  </strong>
                </div>
              </div>
            </section>

            <div className="accountabilityCollaborators">
              {accountabilityData.collaborators.map(
                (collaborator) => (
                  <section
                    className="accountabilityPersonCard"
                    key={collaborator.name}
                  >
                    <div className="accountabilityPersonHeader">
                      <div className="accountabilityPersonAvatar">
                        {collaborator.name
                          .charAt(0)
                          .toUpperCase()}
                      </div>

                      <div>
                        <p className="eyebrow">
                          COLABORADOR
                        </p>

                        <h2>
                          {collaborator.name}
                        </h2>
                      </div>
                    </div>

                    <div className="accountabilityStages">
                      {collaborator.stages.map(
                        (stage) => (
                          <article
                            className="accountabilityStageCard"
                            key={`${collaborator.name}-${stage.stage}`}
                          >
                            <div className="accountabilityStageTop">
                              <div>
                                <p className="eyebrow">
                                  KPI
                                </p>

                                <h3>
                                  {stage.label}
                                </h3>
                              </div>

                              <div className="accountabilityMetrics">
                                <div>
                                  <span>META</span>
                                  <strong>{stage.meta}</strong>
                                  <small>
                                    {stage.backlog} backlog + {stage.scheduled} semana
                                  </small>
                                </div>

                                <div>
                                  <span>ENTREGAS</span>
                                  <strong>{stage.delivered}</strong>
                                  <small>de la meta</small>
                                </div>

                                <div className="accountabilityProductivityMetric">
                                  <span>% PRODUCTIVIDAD</span>
                                  <strong>
                                    {stage.productivity === null
                                      ? "—"
                                      : `${stage.productivity.toFixed(1)}%`}
                                  </strong>
                                  <small>entregas ÷ meta</small>
                                </div>

                                {stage.advanced > 0 && (
                                  <button
                                    type="button"
                                    className="accountabilityAdvancedMetric"
                                    onDoubleClick={() =>
                                      setDeliveryDetail({
                                        title: `${collaborator.name} · ${stage.label}`,
                                        subtitle: `${stage.advanced} entregas adelantadas`,
                                        items: stage.advancedRows.map(
                                          (item) => ({
                                            client: item.client,
                                            date: item.done,
                                          })
                                        ),
                                      })
                                    }
                                    title="Doble clic para ver adelantadas"
                                  >
                                    <span>ADELANTADAS</span>
                                    <strong>{stage.advanced}</strong>
                                    <small>fuera de la meta</small>
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="accountabilityTableWrap">
                              <div className="accountabilityTableHeader">
                                <div>CLIENTE</div>
                                <div>{stage.expectedLabel}</div>
                                <div>FECHA DE ENTREGA</div>
                              </div>

                              {stage.rows.map(
                                (item, index) => (
                                  <div
                                    className={`accountabilityTableRow ${
                                      item.delivered
                                        ? "accountabilityDeliveredRow"
                                        : "accountabilityPendingRow"
                                    }`}
                                    key={`${stage.stage}-${item.client}-${index}`}
                                  >
                                    <div className="accountabilityClientCell">
                                      <strong>{item.client}</strong>

                                      {item.backlog && (
                                        <span className="accountabilityBacklogTag">
                                          BACKLOG
                                        </span>
                                      )}
                                    </div>

                                    <div>
                                      {item.expected}
                                    </div>

                                    <div className={
                                      item.delivered
                                        ? "accountabilityDoneDate"
                                        : "accountabilityMissingDate"
                                    }>
                                      {item.done}
                                    </div>
                                  </div>
                                )
                              )}

                              {!stage.rows.length && (
                                <div className="accountabilityNoRows">
                                  No hubo casos dentro de la meta de esta semana.
                                </div>
                              )}
                            </div>
                          </article>
                        )
                      )}
                    </div>
                  </section>
                )
              )}

              {!accountabilityData.collaborators.length && (
                <div className="emptyState accountabilityEmptyState">
                  No hay metas ni entregas para la semana seleccionada.
                </div>
              )}
            </div>
          </>
        )}

        {mainView ===
          "history" && (
          <>
            <header className="pageHeader">
              <div>
                <p className="eyebrow">
                  PERFORMANCE HISTORY
                </p>

                <h1>
                  Histórico KPI
                </h1>

                <p>
                  Entregas realmente completadas por colaborador y semana.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={
                  loadCases
                }
              >
                ↻ Refresh
              </button>
            </header>

            <section className="historyFilterCard">
              <div className="historyFilter">
                <span>
                  KPI / ETAPA
                </span>

                <select
                  value={
                    historyStage
                  }
                  onChange={(
                    e
                  ) =>
                    setHistoryStage(
                      e.target
                        .value as TeamCalendar
                    )
                  }
                >
                  {historyStageOptions.map(
                    (
                      option
                    ) => (
                      <option
                        key={
                          option.value
                        }
                        value={
                          option.value
                        }
                      >
                        {
                          option.label
                        }
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="historyFilter">
                <span>
                  MES
                </span>

                <input
                  type="month"
                  value={
                    historyMonth
                  }
                  onChange={(
                    e
                  ) =>
                    setHistoryMonth(
                      e
                        .target
                        .value
                    )
                  }
                />
              </div>

              <div className="historySummary">
                <span>
                  ENTREGAS COMPLETADAS
                </span>

                <strong>
                  {
                    historyData.totalCompleted
                  }
                </strong>
              </div>
            </section>

            <section className="historyChartCard">
              <div className="historyChartHeader">
                <div>
                  <p className="eyebrow">
                    {stageLabel(
                      historyStage
                    )}
                  </p>

                  <h2>
                    Entregas completadas por semana
                  </h2>

                  <p>
                    Se contabiliza usando la fecha DONE real.
                  </p>
                </div>
              </div>

              {historyData.names.length ? (
                <>
                  <div className="historyLegend">
                    {historyData.names.map(
                      (
                        name,
                        index
                      ) => (
                        <div
                          className="historyLegendItem"
                          key={
                            name
                          }
                        >
                          <span
                            className={`historyLegendDot historyColor${
                              index %
                              8
                            }`}
                          />

                          <span>
                            {name}
                          </span>
                        </div>
                      )
                    )}
                  </div>

                  <div className="historyChartScroll">
                    <svg
                      className="historyChart"
                      viewBox={`0 0 ${historyChart.width} ${historyChart.height}`}
                    >
                      {historyChart.yTicks.map(
                        (
                          tick
                        ) => {
                          const y =
                            historyChart.yForValue(
                              tick
                            );

                          return (
                            <g
                              key={
                                tick
                              }
                            >
                              <line
                                x1={
                                  historyChart.left
                                }
                                x2={
                                  historyChart.width -
                                  historyChart.right
                                }
                                y1={
                                  y
                                }
                                y2={
                                  y
                                }
                                className="historyGridLine"
                              />

                              <text
                                x={
                                  historyChart.left -
                                  12
                                }
                                y={
                                  y +
                                  4
                                }
                                className="historyAxisText"
                                textAnchor="end"
                              >
                                {
                                  tick
                                }
                              </text>
                            </g>
                          );
                        }
                      )}

                      {historyData.points.map(
                        (
                          point,
                          index
                        ) => (
                          <text
                            key={
                              point.week
                            }
                            x={
                              historyChart.xForIndex(
                                index
                              )
                            }
                            y={
                              historyChart.height -
                              18
                            }
                            className="historyAxisText"
                            textAnchor="middle"
                          >
                            S
                            {
                              point.week
                            }
                          </text>
                        )
                      )}

                      {historyData.names.map(
                        (
                          name,
                          collaboratorIndex
                        ) => {
                          const points =
                            historyData.points.map(
                              (
                                point,
                                index
                              ) => ({
                                x:
                                  historyChart.xForIndex(
                                    index
                                  ),

                                y:
                                  historyChart.yForValue(
                                    point
                                      .values[
                                      name
                                    ] ||
                                      0
                                  ),

                                value:
                                  point
                                    .values[
                                    name
                                  ] ||
                                  0,

                                week:
                                  point.week,

                                label:
                                  point.label,

                                items:
                                  point.items[
                                    name
                                  ] || [],
                              })
                            );

                          const polyline =
                            points
                              .map(
                                (
                                  point
                                ) =>
                                  `${point.x},${point.y}`
                              )
                              .join(
                                " "
                              );

                          return (
                            <g
                              key={
                                name
                              }
                            >
                              <polyline
                                points={
                                  polyline
                                }
                                className={`historyLine historyStroke${
                                  collaboratorIndex %
                                  8
                                }`}
                                fill="none"
                              />

                              {points.map(
                                (
                                  point,
                                  index
                                ) => (
                                  <g
                                    key={`${name}-${index}`}
                                  >
                                    <circle
                                      cx={
                                        point.x
                                      }
                                      cy={
                                        point.y
                                      }
                                      r="5.5"
                                      className={`historyPoint historyFill${
                                        collaboratorIndex %
                                        8
                                      } ${
                                        point.value > 0
                                          ? "historyPointInteractive"
                                          : ""
                                      }`}
                                      onDoubleClick={() => {
                                        if (point.value <= 0) {
                                          return;
                                        }

                                        setDeliveryDetail({
                                          title: name,
                                          subtitle: `${point.label} · ${point.value} entregas completadas`,
                                          items:
                                            point.items,
                                        });
                                      }}
                                    >
                                      <title>
                                        {`${name} · ${point.label} · ${point.value} entregas`}
                                      </title>
                                    </circle>

                                    {point.value >
                                      0 && (
                                      <text
                                        x={
                                          point.x
                                        }
                                        y={
                                          point.y -
                                          11
                                        }
                                        className="historyValueText"
                                        textAnchor="middle"
                                      >
                                        {
                                          point.value
                                        }
                                      </text>
                                    )}
                                  </g>
                                )
                              )}
                            </g>
                          );
                        }
                      )}
                    </svg>
                  </div>
                </>
              ) : (
                <div className="emptyState historyEmpty">
                  No hay entregas DONE registradas para este KPI durante el mes seleccionado.
                </div>
              )}
            </section>

            <section className="historyTotalsCard">
              <div className="historyTotalsHeader">
                <div>
                  <p className="eyebrow">
                    RESUMEN DEL MES
                  </p>

                  <h2>
                    Producción por colaborador
                  </h2>
                </div>
              </div>

              <div className="historyTotalsGrid">
                {historyData.totals.map(
                  (item) => (
                    <button
                      type="button"
                      className="historyPersonCard historyPersonCardInteractive"
                      key={
                        item.name
                      }
                      title="Doble clic para ver clientes y fechas DONE"
                      onDoubleClick={() =>
                        setDeliveryDetail({
                          title: item.name,
                          subtitle: `${item.total} entregas completadas · ${monthNames[historyMonthDate.getMonth()]} ${historyMonthDate.getFullYear()}`,
                          items: item.items,
                        })
                      }
                    >
                      <span>
                        {
                          item.name
                        }
                      </span>

                      <strong>
                        {
                          item.total
                        }
                      </strong>

                      <small>
                        entregas
                      </small>
                    </button>
                  )
                )}
              </div>
            </section>

            <section className="historyDetailCard">
              <div className="historyDetailHeader">
                <div>
                  <p className="eyebrow">
                    DETALLE SEMANAL
                  </p>

                  <h2>
                    Entregas por semana
                  </h2>
                </div>
              </div>

              <div className="historyDetailWrap">
                <div
                  className="historyDetailGrid historyDetailGridHeader"
                  style={{
                    gridTemplateColumns: `minmax(180px, 1.5fr) repeat(${historyWeeks.length}, minmax(90px, .8fr)) minmax(80px, .7fr)`,
                  }}
                >
                  <div>
                    COLABORADOR
                  </div>

                  {historyWeeks.map(
                    (week) => (
                      <div
                        key={
                          week.week
                        }
                      >
                        {
                          week.label
                        }
                      </div>
                    )
                  )}

                  <div>
                    TOTAL
                  </div>
                </div>

                {historyData.totals.map(
                  (item) => (
                    <div
                      key={
                        item.name
                      }
                      className="historyDetailGrid historyDetailGridRow"
                      style={{
                        gridTemplateColumns: `minmax(180px, 1.5fr) repeat(${historyWeeks.length}, minmax(90px, .8fr)) minmax(80px, .7fr)`,
                      }}
                    >
                      <div className="historyDetailPerson">
                        {
                          item.name
                        }
                      </div>

                      {historyData.points.map(
                        (
                          point
                        ) => (
                          <div
                            key={
                              point.week
                            }
                            className="historyDetailNumber"
                          >
                            {point
                              .values[
                              item.name
                            ] ||
                              0}
                          </div>
                        )
                      )}

                      <div className="historyDetailTotal">
                        {
                          item.total
                        }
                      </div>
                    </div>
                  )
                )}

                {!historyData.totals.length && (
                  <div className="emptyState">
                    No hay entregas para mostrar.
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {deliveryDetail && (
        <div
          className="miniDetailOverlay"
          onMouseDown={() =>
            setDeliveryDetail(null)
          }
        >
          <div
            className="miniDetailCard"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >
            <div className="miniDetailHeader">
              <div>
                <p className="eyebrow">
                  DETALLE DE ENTREGAS
                </p>

                <h3>
                  {deliveryDetail.title}
                </h3>

                <span>
                  {deliveryDetail.subtitle}
                </span>
              </div>

              <button
                className="miniDetailClose"
                onClick={() =>
                  setDeliveryDetail(null)
                }
              >
                ×
              </button>
            </div>

            <div className="miniDetailList">
              {deliveryDetail.items.map(
                (item, index) => (
                  <div
                    key={`${item.client}-${item.date || "scheduled"}-${index}`}
                    className="miniDetailRow"
                  >
                    <strong>
                      {item.client}
                    </strong>

                    {item.date && (
                      <span>
                        {item.date}
                      </span>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

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
                  {
                    kpiCases.length
                  }{" "}
                  casos
                </p>
              </div>

              <button
                className="closeButton"
                onClick={() =>
                  setSelectedKpi(
                    null
                  )
                }
              >
                ×
              </button>
            </div>

            <div className="drawerCases">
              {kpiCases.map(
                (row) => (
                  <button
                    key={
                      row.__row
                    }
                    className="drawerCase"
                    onClick={() => {
                      setSelectedKpi(
                        null
                      );

                      openGeneralCase(
                        row
                      );
                    }}
                  >
                    <div>
                      <strong>
                        {row[
                          "CLIENTE"
                        ] ||
                          "Sin cliente"}
                      </strong>

                      <span>
                        ID{" "}
                        {row[
                          "ID"
                        ] ||
                          "—"}
                      </span>
                    </div>

                    <span
                      className={statusClass(
                        row[
                          "STATUS"
                        ] ||
                          ""
                      )}
                    >
                      {row[
                        "STATUS"
                      ] ||
                        "NO STATUS"}
                    </span>

                    <b>
                      ›
                    </b>
                  </button>
                )
              )}
            </div>
          </aside>
        </div>
      )}

      {selectedCase &&
        openCaseSource ===
          "calendar" &&
        selectedStage && (
          <div
            className="modalOverlay"
            onMouseDown={() =>
              setSelectedCase(
                null
              )
            }
          >
            <div
              className="caseModal stageOnlyModal"
              onMouseDown={(e) =>
                e.stopPropagation()
              }
            >
              <div className="modalHeader">
                <div>
                  <p className="eyebrow">
                    TEAM DELIVERY
                  </p>

                  <h2>
                    {selectedCase[
                      "CLIENTE"
                    ] ||
                      "Sin cliente"}
                  </h2>

                  <div className="caseMeta">
                    <span>
                      ID{" "}
                      {selectedCase[
                        "ID"
                      ] ||
                        "—"}
                    </span>

                    <span>
                      {stageLabel(
                        selectedStage
                      )}
                    </span>
                  </div>
                </div>

                <button
                  className="closeButton"
                  onClick={() =>
                    setSelectedCase(
                      null
                    )
                  }
                >
                  ×
                </button>
              </div>

              <div className="modalBody">
                <StageContent
                  stage={
                    selectedStage
                  }
                />
              </div>
            </div>
          </div>
        )}

      {selectedCase &&
        openCaseSource ===
          "cases" && (
          <div
            className="modalOverlay"
            onMouseDown={() =>
              setSelectedCase(
                null
              )
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
                    ] ||
                      "Sin cliente"}
                  </h2>

                  <div className="caseMeta">
                    <span>
                      ID{" "}
                      {selectedCase[
                        "ID"
                      ] ||
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
                      ] ||
                        "NO STATUS"}
                    </span>
                  </div>
                </div>

                <button
                  className="closeButton"
                  onClick={() =>
                    setSelectedCase(
                      null
                    )
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
                      <h3>
                        General
                      </h3>

                      <p>
                        Información principal del caso
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

                <StageContent
                  stage="psych"
                />

                <StageContent
                  stage="caratula"
                />

                <StageContent
                  stage="draft"
                />

                <StageContent
                  stage="plcvl"
                />

                <StageContent
                  stage="ea"
                />

                <StageContent
                  stage="cvl"
                />
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
