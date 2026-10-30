"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CELULAS, type Celula } from "@/lib/celulas";
import RfeDashboard from "./rfe-dashboard";
import Regresos from "./regresos";
import Gmc from "./gmc";
import RapSheet from "./rs";
import Comunicaciones from "./comms";
import EstudioTiempos from "./tiempos";

type Role =
  | "ADMIN"
  | "TL"
  | "PARALEGAL"
  | "PSYCH"
  | "ANALYST"
  | "MANAGER"
  | "COORDINATOR"
  | "CS";

type CaseRow = Record<string, string> & {
  __row: string;
};

/*
 * "general" junta todas las células del usuario (Manager,
 * Coordinator y Admin). Cada fila guarda su célula en
 * __celula para saber a qué Sheet escribir.
 */
type Vista = Celula | "general" | "gmc";

const vistaLabel = (vista: Vista) =>
  vista === "general"
    ? "General"
    : vista === "gmc"
      ? "GMC"
      : CELULAS[vista].label;

// El número de fila se repite entre células.
const rowKey = (row: CaseRow) =>
  `${row.__celula || ""}-${row.__row}`;

// Con más de una célula, General va primero. GMC (Gov Branch)
// tiene su propia Sheet; por ahora la ve quien ve todas.
const vistasFor = (user: User): Vista[] => [
  ...(user.celulas.length > 1
    ? (["general", ...user.celulas] as Vista[])
    : user.celulas),
  ...(user.gmc ? (["gmc"] as Vista[]) : []),
];

type User = {
  authenticated: boolean;
  email: string | null;
  role: Role | null;
  celulas: Celula[];
  gmc?: boolean;
};

type MainView = "dashboard" | "cases" | "team" | "history" | "accountability" | "nwgeneral" | "cs" | "mgmreview" | "rfe" | "regresos" | "gmc" | "rs" | "comms" | "tiempos";

type NwCalendarKind = "due" | "interno" | "revisioncs";

type TeamCalendar =
  | "mgm"
  | "caratula"
  | "draft"
  | "plcvl"
  | "psych"
  | "ea"
  | "cvl"
  // Solo en NW ADMINs (NON VAWA de Alpha).
  | "dclplg"
  | "dclpsych";

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
  type: Exclude<KpiType, "none"> | "delivered" | "special";
} | null;

type OpenCaseSource = "cases" | "calendar";

type Stats = {
  backlog: number;
  pending: number;
  future: number;
  delivered: number;
  special: number;
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
  CS: "Case Strategy",
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

const NW_DATE_FIELDS: Record<
  NwCalendarKind,
  { header: string; label: string }
> = {
  due: { header: "Due Date", label: "Deadline del Recibo" },
  interno: { header: "DEADLINE INTERNO", label: "Deadline Interno" },
  revisioncs: { header: "REVISIÓN CS", label: "Revisión CS" },
};

const NW_STATUS_HEADER = "GENERAL STATUS";
const NW_CLIENT_HEADER = "CL";

const NW_STATUS_OPTIONS = [
  "Cancelled",
  "Special Case",
  "Assigned",
  "Working",
  "Correction",
  "Ready to Print",
  "Sent to USCIS",
  "Waiting Conf.",
  "Waiting Medical Exam",
  "Waiting Passport Photos",
  "Waiting Signatures",
];

const NW_EDITABLE_FIELDS = [
  "GENERAL STATUS",
  "DATE ATTY REVIEW",
  "FECHA RTP",
  "EVIDENCE NEEDED",
  "REQUERIMIENTOS",
  "PL ASSIGNED",
];

/*
 * Reasignar PL ASSIGNED está restringido a ADMIN/TL, igual que la
 * reasignación de paralegal en ADMINs.
 */
const NW_REASSIGNMENT_FIELDS = ["PL ASSIGNED"];

const NW_PL_ASSIGNED_HEADER = "PL ASSIGNED";

const NW_PL_ASSIGNED_OPTIONS = [
  "PAOLA",
  "GMC",
  "DAN U",
  "CARLOS ARTURO",
  "MAYLA",
  "LIZ",
];

const NW_TEXTAREA_FIELDS = ["EVIDENCE NEEDED"];

const NW_DATE_INPUT_FIELDS = [
  "DATE ATTY REVIEW",
  "FECHA RTP",
  "REVISIÓN CS COMPLETADA",
];

const NW_LINK_HEADER = "LINK";

/*
 * Calendario "Revisión CS": solo muestra este subconjunto de
 * campos en el modal, no todos los headers de la sheet.
 */
const NW_REVISIONCS_DISPLAY_FIELDS = [
  "CL",
  "FORM",
  "Evidence needed",
  "REVISIÓN CS COMPLETADA",
  "REQUERIMIENTOS",
  "LINK",
];

const NW_REVISIONCS_EDITABLE_FIELDS = [
  "FORM",
  "EVIDENCE NEEDED",
  "REVISIÓN CS COMPLETADA",
  "REQUERIMIENTOS",
];

const NW_REQUIREMENT_HEADER = "REQUERIMIENTOS";

const NW_REQUIREMENT_OPTIONS = [
  "DCL PLG",
  "DCL PSYCH",
  "DOE",
  "DRAFT",
  "DCL EDITADA",
  "CVL",
  "CR",
  "NA",
];

/*
 * Calendario unificado "CS": combina la revisión de Case Strategy
 * de VAWA (ADMINs) con la de NON-VAWA (NW GENERAL) en un solo
 * calendario.
 */
// Las tres revisiones de CS en ADMINs (Alpha y Gamma).
type CsKind = "caratula" | "dcl" | "final" | "nonvawa";

const CS_REVIEWS: { kind: CsKind; expected: string; done: string; label: string }[] = [
  { kind: "caratula", expected: "CS EXP DONE ESTRATEGIA", done: "CS DONE ESTRATEGIA", label: "Llenado de carátula" },
  { kind: "dcl", expected: "CS EXP DONE REV", done: "CS REV DONE", label: "Revisión post DCL" },
  { kind: "final", expected: "CS FINAL REVIEW EXPECTED DONE", done: "CS FINAL REVIEW DONE", label: "Final review" },
];

const CS_KIND_LABEL: Record<CsKind, string> = {
  caratula: "Carátula",
  dcl: "Post DCL",
  final: "Final review",
  nonvawa: "NON-VAWA",
};

// Columna nueva en ADMINs: CS la registra cuando la hace (sin fecha compromiso).
const INITIAL_REVIEW_HEADER = "INITIAL REVIEW (FIRST APPROACH)";
const NONVAWA_CS_DATE_HEADER = "REVISIÓN CS";
const NONVAWA_CS_DONE_HEADER = "REVISIÓN CS COMPLETADA";

/*
 * Calendario unificado "MGM Review": combina la meta de MGM
 * Review de VAWA (ADMINs) con las entregas NON-VAWA por
 * Deadline Interno (NW GENERAL).
 */
const VAWA_MGM_DATE_HEADER = "COMMITMENT";
const NONVAWA_DEADLINE_INTERNO_DATE_HEADER = "DEADLINE INTERNO";
const NONVAWA_DELIVERED_STATUSES = new Set([
  "READY TO PRINT",
  "SENT TO USCIS",
]);

type MergedReviewEvent = {
  origin: "vawa" | "nonvawa";
  row: CaseRow;
  date: Date;
  completed: boolean;
  client: string;
  // Solo en el calendario de CS.
  kind?: CsKind;
  member?: string;
};

const norm = (value: string) =>
  value.trim().toUpperCase().replace(/\s+/g, " ");

// Mes por sus tres primeras letras, en inglés o español.
const MONTH_INDEX: Record<string, number> = {
  jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, ago: 7, sep: 8, oct: 9, nov: 10, dec: 11, dic: 11,
};

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

  /*
   * Fechas escritas a mano sin año ("Thursday, 6 August",
   * "Monday, 1 de June", "6 agosto"): se toma el año que deja la
   * fecha más cerca de hoy. Antes el navegador las leía como 2001.
   */
  if (!/\d{4}/.test(raw)) {
    const noYear = raw
      .toLowerCase()
      .replace(/^[a-záéíóúñ]+,\s*/, "")
      .match(/^(\d{1,2})\s+(?:de\s+)?([a-záéíóúñ]+)$/);
    const month = noYear ? MONTH_INDEX[noYear[2].slice(0, 3)] : undefined;

    if (!noYear || month === undefined) {
      return null;
    }

    const today = new Date();
    let year = today.getFullYear();
    const guess = (y: number) => new Date(y, month, Number(noYear[1]));
    const sixMonths = 183 * 86400000;

    if (guess(year).getTime() - today.getTime() > sixMonths) year -= 1;
    else if (today.getTime() - guess(year).getTime() > sixMonths) year += 1;

    return guess(year);
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

// Tipos de caso que entran al calendario y a los KPIs de MGM.
const CALENDAR_CASE_TYPES = [
  "DUE DATE",
  "NO DUE DATE",
  "NOID",
  "DD NOID",
  "RESUBMISSION",
];

const getMgmKpi = (row: CaseRow): KpiType => {
  const type = norm(
    row["DUE DATE/NO DUE DATE"] || ""
  );

  if (!CALENDAR_CASE_TYPES.includes(type)) {
    return "none";
  }

  const status = norm(
    row["STATUS"] || ""
  );

  if (
    [
      "MGM REVIEW",
      "SENT TO USCIS",
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

/*
 * Casos que ya no se trabajan y no deben contar en ningún lado:
 * - Analistas (EA y CVL): outcome o estatus CANCELLED/CLOSED.
 * - Psych: lo tiene un apoyo EXTERNO con fecha ya pasada.
 */
const CANCELLED_VALUES = ["CANCELLED/CLOSED", "CLOSED", "CANCELLED", "CANCELED"];

const isCancelledCase = (row: CaseRow) =>
  CANCELLED_VALUES.includes(norm(row["CR OUTCOME"] || "")) ||
  CANCELLED_VALUES.includes(norm(row["STATUS"] || ""));

const isExternalPastPsych = (row: CaseRow) => {
  if (!norm(row["PSYCH"] || "").includes("EXTERNO")) return false;
  const expected = parseDateOnly(row["EXPECTED DONE (doe)"] || "");
  return !!expected && expected.getTime() < startOfWeek(new Date()).getTime();
};

const outOfScope = (row: CaseRow, stage: string) =>
  ((stage === "ea" || stage === "cvl") && isCancelledCase(row)) ||
  (stage === "psych" && isExternalPastPsych(row));

const getPsychKpi = (row: CaseRow): KpiType => {
  if (outOfScope(row, "psych")) {
    return "none";
  }

  const status = norm(
    row["DOE STATUS"] || ""
  );

  if (
    [
      "NA",
      "N/A",
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
      "CANCELLED/CLOSED",
      "CANCELLED",
      "CANCELED",
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
  if (outOfScope(row, "ea")) {
    return "none";
  }

  const status = norm(
    row["EA STATUS"] || ""
  );

  if (
    [
      "NA",
      "N/A",
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
  if (outOfScope(row, "cvl")) {
    return "none";
  }

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

/* =========================
   TEAM
   ========================= */

// DCL de NW ADMINs: pendiente si no tiene DONE y su estatus no lo descarta.
const NW_DCL = {
  dclplg: { status: "STATUS DCL PLG", done: "DCL PLG DONE", expected: "DCL PLG EXP DONE" },
  dclpsych: { status: "STATUS DCL PSYCH", done: "DCL PSYCH DONE", expected: "DCL PSYCH EXP DONE" },
} as const;

const NW_DCL_SKIP = ["NA", "N/A", "CANCELLED", "CANCELED"];

const isDclStage = (stage: TeamCalendar): stage is "dclplg" | "dclpsych" =>
  stage === "dclplg" || stage === "dclpsych";

const getDclKpi = (row: CaseRow, stage: "dclplg" | "dclpsych"): KpiType => {
  const keys = NW_DCL[stage];
  if (NW_DCL_SKIP.includes(norm(row[keys.status] || ""))) {
    return "none";
  }
  if ((row[keys.done] || "").trim()) {
    return "none";
  }
  const date = parseDateOnly(row[keys.expected] || "");
  return date ? classifyDate(date) : "none";
};

const collaboratorHeader = (
  stage: TeamCalendar
) => {
  if (stage === "dclplg") {
    return "PLG ASIGNADO";
  }

  if (stage === "dclpsych") {
    return "PSYCH ASIGNADO";
  }

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
  if (isDclStage(stage)) {
    return NW_DCL[stage].expected;
  }

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
  if (isDclStage(stage)) {
    return NW_DCL[stage].done;
  }

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
  if (isDclStage(stage)) {
    return NW_DCL[stage].status;
  }

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

/*
  Una entrega completada ya NO debe desaparecer de los
  calendarios/dashboard: isStageDelivered() marca cuándo un
  caso ya se entregó en esa etapa, para seguir mostrándolo
  (con su estatus) en vez de ocultarlo por completo.
*/
const isStageDelivered = (
  row: CaseRow,
  stage: TeamCalendar
) => {
  if (stage === "mgm") {
    const sentToMgm = (
      row["SENT TO MGM"] || ""
    ).trim();

    if (
      sentToMgm !== "" &&
      sentToMgm !== "--"
    ) {
      return true;
    }

    /*
     * Algunos casos avanzan de STATUS a "MGM REVIEW" o
     * "SENT TO USCIS" sin que alguien llene la columna
     * "SENT TO MGM" — igual ya se entregó esta etapa.
     */
    const status = norm(
      row["STATUS"] || ""
    );

    return (
      status === "MGM REVIEW" ||
      status === "SENT TO USCIS"
    );
  }

  return (
    (row[doneDateHeader(stage)] || "").trim() !== ""
  );
};

const calendarActive = (
  row: CaseRow,
  stage: TeamCalendar
) => {
  if (outOfScope(row, stage)) {
    return false;
  }

  if (isDclStage(stage)) {
    return (
      getDclKpi(row, stage) !== "none" ||
      isStageDelivered(row, stage)
    );
  }

  if (stage === "mgm") {
    return (
      getMgmKpi(row) !== "none" ||
      isStageDelivered(row, "mgm")
    );
  }

  if (stage === "caratula") {
    return (
      getCaratulaKpi(row) !== "none" ||
      isStageDelivered(row, "caratula")
    );
  }

  if (stage === "draft") {
    return (
      getDraftKpi(row) !== "none" ||
      isStageDelivered(row, "draft")
    );
  }

  if (stage === "plcvl") {
    return (
      getPlCvlKpi(row) !== "none" ||
      isStageDelivered(row, "plcvl")
    );
  }

  if (stage === "psych") {
    return (
      getPsychKpi(row) !== "none" ||
      isStageDelivered(row, "psych")
    );
  }

  if (stage === "ea") {
    return (
      getEaKpi(row) !== "none" ||
      isStageDelivered(row, "ea")
    );
  }

  return (
    getCvlKpi(row) !== "none" ||
    isStageDelivered(row, "cvl")
  );
};

/*
  IMPORTANTE:
  carga programada ignora DONE.
  Así una entrega completada NO desaparece
  del total que originalmente debía hacerse.
*/

/*
 * El backlog es lo vencido que sigue pendiente: lo ya
 * entregado o enviado a USCIS no cuenta.
 */
const leavesBacklog = (
  row: CaseRow,
  stage: TeamCalendar
) =>
  isStageDelivered(row, stage) ||
  norm(row["STATUS"] || "") === "SENT TO USCIS" ||
  isSpecialStage(row, stage);

// SPECIAL CASE / UNRESPONSIVE en la etapa: van en su propio apartado, no en backlog.
const SPECIAL_STATUSES = ["SPECIAL CASE", "UNRESPONSIVE"];

function isSpecialStage(row: CaseRow, stage: TeamCalendar) {
  return (
    !isStageDelivered(row, stage) &&
    SPECIAL_STATUSES.includes(specialStatusOf(row, stage))
  );
}

/*
 * Estatus de la etapa para special case. EA y CVL: si su estatus
 * está vacío pero el DOE o el Draft del caso están en SPECIAL
 * CASE / UNRESPONSIVE, el analista no tiene con qué trabajar, así
 * que también cuenta como special case.
 */
function specialStatusOf(row: CaseRow, stage: TeamCalendar) {
  const own = norm(row[calendarStatusHeader(stage)] || "");
  if (own || (stage !== "ea" && stage !== "cvl")) return own;
  return (
    [norm(row["DOE STATUS"] || ""), norm(row["STATUS 1ST DRAFT"] || "")].find((status) =>
      SPECIAL_STATUSES.includes(status)
    ) || ""
  );
}

const scheduledEligible = (
  row: CaseRow,
  stage: TeamCalendar
) => {
  const expectedDate = parseDateOnly(
    row[calendarDateHeader(stage)] || ""
  );

  if (!expectedDate || outOfScope(row, stage)) {
    return false;
  }

  if (isDclStage(stage)) {
    return (
      !NW_DCL_SKIP.includes(norm(row[NW_DCL[stage].status] || "")) &&
      !["", "N/A", "NA"].includes(norm(row[collaboratorHeader(stage)] || ""))
    );
  }

  if (stage === "mgm") {
    const type = norm(
      row["DUE DATE/NO DUE DATE"] || ""
    );

    if (!CALENDAR_CASE_TYPES.includes(type)) {
      return false;
    }

    const status = norm(
      row["STATUS"] || ""
    );

    return ![
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
      "CANCELLED/CLOSED",
      "CANCELLED",
      "CANCELED",
    ].includes(status);
  }

  if (stage === "psych") {
    const status = norm(
      row["DOE STATUS"] || ""
    );

    return ![
      "NA",
      "N/A",
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
  if (stage === "dclplg") {
    return "DCL Paralegal (NW)";
  }

  if (stage === "dclpsych") {
    return "DCL Psych (NW)";
  }

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
    value: "dclplg",
    label: "Paralegal · DCL (NW)",
  },
  {
    value: "dclpsych",
    label: "Psych · DCL (NW)",
  },
  {
    value: "cvl",
    label: "CVL",
  },
];

/*
  Team ahora se ve por colaborador: como el equipo es
  multitask, el calendario de una persona junta todas sus
  entregas (carátula, draft, DOE, CVL, etc.) y cada una se
  etiqueta con su tipo.
*/
// En el orden del flujo del caso.
const TEAM_STAGES: TeamCalendar[] = [
  "caratula",
  "psych",
  "draft",
  "ea",
  "plcvl",
  "cvl",
  "mgm",
  "dclplg",
  "dclpsych",
];

const teamStageShortLabel: Record<TeamCalendar, string> = {
  caratula: "Carátula",
  draft: "1st Draft",
  plcvl: "Esc. CVL",
  mgm: "MGM",
  psych: "DOE",
  ea: "EA",
  cvl: "CVL",
  dclplg: "DCL PLG",
  dclpsych: "DCL Psych",
};

/*
  Fechas que se muestran en el calendario de un caso (Cases):
  el deadline general y la fecha esperada de cada etapa, con
  su columna de entregado para editarla desde ahí mismo.
*/
type CaseDateItem = {
  key: string;
  label: string;
  stage: TeamCalendar | null;
  dateHeader: string;
  doneHeader: string | null;
};

const CASE_CALENDAR_ITEMS: CaseDateItem[] = [
  // Etapas en orden del flujo; el deadline va al final como meta.
  ...TEAM_STAGES.map((stage) => ({
    key: stage,
    label: teamStageShortLabel[stage],
    stage,
    dateHeader: calendarDateHeader(stage),
    doneHeader: doneDateHeader(stage),
  })),
  {
    key: "deadline",
    label: "Deadline",
    stage: null,
    dateHeader: "DEADLINE",
    doneHeader: null,
  },
];

const dateToInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

type CaseKpiTone =
  | "ontime"
  | "early"
  | "late"
  | "delivered"
  | "backlog"
  | "pending"
  | "future"
  | "none";

const caseKpiClass: Record<CaseKpiTone, string> = {
  ontime: "deliveryDelivered",
  early: "deliveryDelivered",
  delivered: "deliveryDelivered",
  late: "deliveryLate",
  backlog: "deliveryBacklog",
  pending: "deliveryPending",
  future: "deliveryFuture",
  none: "deliveryNone",
};

const dayDiff = (a: Date, b: Date) =>
  Math.round((a.getTime() - b.getTime()) / 86400000);

/*
  KPI de una fecha del caso según su entrega: si ya se entregó,
  compara la fecha de entregado contra la esperada (a tiempo,
  adelantado, tarde); si no, cuánto falta o cuánto lleva de atraso.
*/
const caseItemKpi = (
  row: CaseRow,
  item: CaseDateItem
): { label: string; tone: CaseKpiTone } => {
  const expected = parseDateOnly(row[item.dateHeader] || "");
  const today = parseDateOnly(dateToInput(new Date())) || new Date();

  if (!item.stage) {
    if (norm(row["STATUS"] || "") === "SENT TO USCIS") {
      return { label: "Enviado a USCIS", tone: "delivered" };
    }

    if (!expected) {
      return { label: "Sin fecha", tone: "none" };
    }

    const left = dayDiff(expected, today);

    if (left < 0) {
      return { label: `Vencido hace ${-left} d`, tone: "backlog" };
    }

    return {
      label: left === 0 ? "Vence hoy" : `Faltan ${left} d`,
      tone: left <= 7 ? "pending" : "future",
    };
  }

  if (isStageDelivered(row, item.stage)) {
    const done = item.doneHeader
      ? parseDateOnly(row[item.doneHeader] || "")
      : null;

    if (!done || !expected) {
      return { label: "Entregado", tone: "delivered" };
    }

    const diff = dayDiff(done, expected);

    if (diff > 0) {
      return { label: `Tarde +${diff} d`, tone: "late" };
    }

    if (diff < 0) {
      return { label: `Adelantado ${-diff} d`, tone: "early" };
    }

    return { label: "A tiempo", tone: "ontime" };
  }

  if (!expected) {
    return { label: "Sin fecha", tone: "none" };
  }

  const type = classifyDate(expected);

  if (type === "backlog") {
    return {
      label: `Backlog ${dayDiff(today, expected)} d`,
      tone: "backlog",
    };
  }

  return type === "pending"
    ? { label: "Esta semana", tone: "pending" }
    : { label: "Próxima", tone: "future" };
};

// Días (lunes a domingo) que cubren por completo el mes dado.
const buildMonthDays = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const start = addDays(
    firstDay,
    -(firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1)
  );

  const end = addDays(
    lastDay,
    6 - (lastDay.getDay() === 0 ? 6 : lastDay.getDay() - 1)
  );

  const days: Date[] = [];

  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = addDays(cursor, 1)
  ) {
    days.push(cursor);
  }

  return days;
};

type TeamEvent = {
  row: CaseRow;
  stage: TeamCalendar;
  date: Date;
  delivered: boolean;
  member: string; // "" = sin asignar
  status: string;
};

const NON_COLLABORATOR_VALUES = new Set([
  "N/A",
  "NA",
  "TRUE",
  "FALSE",
  "-",
  "--",
]);

// Variantes con las que el mismo colaborador aparece en la sheet.
const COLLABORATOR_ALIASES: Record<string, string> = {
  JAZ: "JAZMIN",
  LESLY: "LESSLY",
};

/*
  Normaliza el nombre para que la misma persona se junte
  aunque venga de columnas distintas (PARALEGAL, PSYCH,
  EA MEMBER, CVL MEMBER) o con/sin acento (HÉCTOR/HECTOR).
*/
const collaboratorKey = (value: string) => {
  const base = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  if (!base || NON_COLLABORATOR_VALUES.has(base)) {
    return "";
  }

  return COLLABORATOR_ALIASES[base] || base;
};

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
  "dclplg",
  "psych",
  "dclpsych",
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

  const [celula, setCelula] =
    useState<Vista | null>(null);

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

  const [teamViewMode, setTeamViewMode] =
    useState<TeamViewMode>("calendar");

  // Colaboradores ocultos; vacío = todo el equipo.
  const [
    hiddenTeamMembers,
    setHiddenTeamMembers,
  ] = useState<string[]>([]);

  const [teamMenu, setTeamMenu] =
    useState<"member" | "stage" | null>(null);

  const [
    hiddenTeamStages,
    setHiddenTeamStages,
  ] = useState<TeamCalendar[]>([]);

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

  const [nwData, setNwData] = useState<{
    headers: string[];
    rows: CaseRow[];
    title: string;
  }>({ headers: [], rows: [], title: "" });

  const [nwLoaded, setNwLoaded] = useState(false);
  const [nwLoading, setNwLoading] = useState(false);
  const [nwErr, setNwErr] = useState("");
  const [nwMsg, setNwMsg] = useState("");

  const [nwCalendarKind, setNwCalendarKind] =
    useState<NwCalendarKind>("due");

  const [
    nwCalendarMonth,
    setNwCalendarMonth,
  ] = useState(() => {
    const now = new Date();

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );
  });

  const [nwSelectedRow, setNwSelectedRow] =
    useState<CaseRow | null>(null);

  const [nwPlFilter, setNwPlFilter] = useState("");

  const [
    csCalendarMonth,
    setCsCalendarMonth,
  ] = useState(() => {
    const now = new Date();

    return new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );
  });

  const [
    mgmReviewCalendarMonth,
    setMgmReviewCalendarMonth,
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

  const [caseModalView, setCaseModalView] =
    useState<"detail" | "calendar">("detail");

  const [
    caseCalendarMonth,
    setCaseCalendarMonth,
  ] = useState(() => new Date());

  // Entrega resaltada en el calendario del caso.
  const [caseFocusKey, setCaseFocusKey] =
    useState<string | null>(null);

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

  // Initial review (vista CS).
  const [irOpen, setIrOpen] = useState(false);
  const [irClient, setIrClient] = useState("");
  const [irDate, setIrDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [irSaving, setIrSaving] = useState(false);

  const [nwAdminRows, setNwAdminRows] =
    useState<Record<string, string>[]>([]);

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
    role === "COORDINATOR" ||
    role === "CS";

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

      const json: User =
        await response.json();

      /*
       * La célula viaja en la URL (?celula=gamma) para que
       * cambiar de célula recargue todo desde cero.
       */
      const requested =
        new URLSearchParams(
          window.location.search
        ).get("celula");

      const vistas = vistasFor(json);

      setCelula(
        vistas.find(
          (v) => v === requested
        ) ||
          vistas[0] ||
          null
      );

      setUser(json);
    } catch {
      setUser({
        authenticated: false,
        email: null,
        role: null,
        celulas: [],
      });
    } finally {
      setLoadingUser(false);
    }
  }

  async function loadCases() {
    setLoadingCases(true);
    setError("");

    try {
      if (!celula || !user || celula === "gmc") {
        return;
      }

      const targets: Celula[] =
        celula === "general"
          ? user.celulas
          : [celula];

      const results = await Promise.all(
        targets.map(async (target) => {
          const response = await fetch(
            `/api/cases?celula=${target}`,
            {
              cache: "no-store",
            }
          );

          const json =
            await response.json();

          if (!response.ok) {
            throw new Error(
              json.error ||
                `No se pudieron cargar los casos de ${CELULAS[target].label}`
            );
          }

          return { target, json };
        })
      );

      /*
       * Los headers de cada célula ya vienen alineados a los
       * de Alpha, así que basta con los de la primera.
       */
      // NW ADMINs (NON VAWA de Alpha) para calendarios y rendición.
      if (targets.includes("alpha")) {
        fetch("/api/nw-admins", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : { rows: [] }))
          .then((json) => setNwAdminRows(json.rows || []))
          .catch(() => setNwAdminRows([]));
      } else {
        setNwAdminRows([]);
      }

      setData({
        title: results[0].json.title,
        headers: results[0].json.headers,
        rows: results.flatMap(
          ({ target, json }) =>
            (json.rows as CaseRow[]).map(
              (row) => ({
                ...row,
                __celula: target,
              })
            )
        ),
      });
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

  async function loadNwGeneral() {
    setNwLoading(true);
    setNwErr("");

    try {
      const response = await fetch(
        "/api/nw-general",
        {
          cache: "no-store",
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error ||
            "No se pudieron cargar los casos de NW GENERAL"
        );
      }

      setNwData(json);
      setNwLoaded(true);
    } catch (e) {
      setNwErr(
        e instanceof Error ? e.message : "Error"
      );
    } finally {
      setNwLoading(false);
    }
  }

  async function saveNwField(
    rowNumber: number,
    header: string,
    value: string
  ) {
    setNwMsg("");
    setNwErr("");

    try {
      const response = await fetch(
        "/api/nw-general/update",
        {
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
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || "No se pudo guardar"
        );
      }

      setNwData((prev) => ({
        ...prev,
        rows: prev.rows.map((row) =>
          row.__row === String(rowNumber)
            ? { ...row, [header]: value }
            : row
        ),
      }));

      setNwSelectedRow((prev) =>
        prev?.__row === String(rowNumber)
          ? { ...prev, [header]: value }
          : prev
      );

      setNwMsg("Cambio guardado en Google Sheets");
      window.setTimeout(() => setNwMsg(""), 2200);
    } catch (e) {
      setNwErr(e instanceof Error ? e.message : "Error");
    }
  }

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user?.authenticated && celula) {
      loadCases();
    }
  }, [user, celula]);

  const hasNwGeneral =
    celula === "general"
      ? !!user?.celulas.some(
          (c) => CELULAS[c].hasNwGeneral
        )
      : celula !== null &&
        celula !== "gmc" &&
        CELULAS[celula].hasNwGeneral;

  const isGeneral = celula === "general";
  const isGmc = celula === "gmc";

  /*
   * Filas de NW ADMINs adaptadas a las etapas del equipo: 1st
   * Draft, EA y CVL usan los mismos títulos que ADMINs; DCL PLG y
   * DCL Psych son etapas propias. Casi nunca traen fecha
   * esperada: si falta, se toma la fecha de entrega. Solo se usan
   * en calendarios y rendición de cuentas (no se editan aquí).
   */
  const nwTeamRows = useMemo<CaseRow[]>(
    () =>
      nwAdminRows.map((raw) => {
        const row: Record<string, string> = {
          ...raw,
          CLIENTE: `${raw["CL"]} · NW`,
          "DUE DATE/NO DUE DATE": "NON VAWA",
          __PARALEGAL_DRAFT: raw["PLG ASIGNADO"] || "",
          "CVL EXPECTED DONE": raw["EXPECTED DONE"] || "",
          __celula: "alpha",
          __row: `nw-${raw.__row}`,
          __source: "NW",
        };
        [
          ["DCL PLG EXP DONE", "DCL PLG DONE"],
          ["DCL PSYCH EXP DONE", "DCL PSYCH DONE"],
          ["1ST DRAFT EXP DONE", "1ST DRAFT DONE"],
          ["EA EXPECTED DONE", "EA DONE"],
          ["CVL EXPECTED DONE", "DONE CVL"],
        ].forEach(([expected, done]) => {
          if (!(row[expected] || "").trim() && (row[done] || "").trim()) {
            row[expected] = row[done];
          }
        });
        return row as unknown as CaseRow;
      }),
    [nwAdminRows]
  );

  // ADMINs + NW ADMINs: lo que alimenta calendarios y rendición.
  const teamRows = useMemo(
    () => [...data.rows, ...nwTeamRows],
    [data.rows, nwTeamRows]
  );

  // Comunicaciones: cada célula (y GMC) tiene su propia pestaña.
  const commsVista =
    celula === "gmc"
      ? "gmc"
      : celula === "alpha" || celula === "gamma"
        ? celula
        : null;

  const commsClientes = useMemo(
    () =>
      [
        ...new Set(
          data.rows
            .map((row) => (row["CLIENTE"] || "").trim().toUpperCase())
            .filter(Boolean)
        ),
      ],
    [data.rows]
  );

  // Estudio de tiempos: analistas, paralegales y psychs de Alpha y Gamma (y el Admin).
  const tiemposCelula =
    (celula === "alpha" || celula === "gamma") &&
    (role === "ADMIN" ||
      role === "ANALYST" ||
      role === "PARALEGAL" ||
      role === "PSYCH")
      ? celula
      : null;

  // Célula con pestaña RS (Rap Sheet), p. ej. Gamma.
  const rsCelula =
    celula && celula !== "general" && celula !== "gmc" && CELULAS[celula].hasRs
      ? celula
      : null;

  // GMC solo tiene su calendario de entregas.
  useEffect(() => {
    if (isGmc) setMainView("gmc");
  }, [isGmc]);

  // Clientes de la Sheet para ligar cada regreso a su caso.
  const regresoCases = useMemo(
    () =>
      data.rows
        .filter((row) => (row["CLIENTE"] || "").trim())
        .map((row) => ({
          cliente: row["CLIENTE"].trim(),
          id: (row["ID"] || "").trim(),
          receipt: (row["RECEIPT NUMBER"] || "").trim(),
          celula: ((row.__celula ||
            (celula === "general" || celula === "gmc" ? "" : celula) ||
            "alpha") as Celula),
        })),
    [data.rows, celula]
  );

  function switchCelula(next: Vista) {
    if (next !== celula) {
      window.location.search = `?celula=${next}`;
    }
  }

  async function saveField(
    rowNumber: number,
    header: string,
    value: string
  ) {
    // En General la célula sale del caso abierto.
    const target =
      selectedCase?.__celula || celula;

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
            celula: target,

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
              String(rowNumber) &&
            row.__celula === target
              ? {
                  ...row,
                  [header]: value,
                }
              : row
        ),
      }));

      setSelectedCase((prev) =>
        prev?.__row ===
          String(rowNumber) &&
        prev?.__celula === target
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
    const target =
      selectedCase?.__celula || celula;

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
            celula: target,

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
              String(rowNumber) &&
            row.__celula === target
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
          String(rowNumber) &&
        prev?.__celula === target
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
    setCaseModalView("detail");
    setSelectedCase(row);
  }

  function openTeamCase(
    row: CaseRow,
    stage: TeamCalendar
  ) {
    // Casos de NW ADMINs: se actualizan en la Sheet, no aquí.
    if ((row as Record<string, string>).__source === "NW") {
      setMessage("Caso de NW ADMINs: se actualiza directo en la Sheet");
      return;
    }

    setOpenCaseSource("calendar");
    setSelectedStage(stage);
    setSelectedCase(row);
  }

  const calculateStats = (
    section: KpiSection
  ): Stats => {
    let backlog = 0;
    let pending = 0;
    let future = 0;
    let delivered = 0;
    let special = 0;

    data.rows.forEach(
      (row) => {
        /*
         * Igual que la carga programada: la semana a la que
         * pertenece un caso se calcula por su fecha esperada
         * y se ignora si ya fue entregado, para que el
         * número de "Esta semana"/"Backlog"/"Próximas" nunca
         * baje solo porque alguien lo entregó.
         */
        if (
          scheduledEligible(
            row,
            section
          )
        ) {
          const expectedDate =
            parseDateOnly(
              row[
                calendarDateHeader(
                  section
                )
              ] || ""
            );

          const result =
            expectedDate
              ? classifyDate(
                  expectedDate
                )
              : null;

          if (
            result === "backlog" &&
            !leavesBacklog(row, section)
          ) {
            backlog++;
          }

          if (isSpecialStage(row, section)) {
            special++;
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

        if (
          isStageDelivered(
            row,
            section
          )
        ) {
          delivered++;
        }
      }
    );

    return {
      backlog,
      pending,
      future,
      delivered,
      special,
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

      if (
        selectedKpi.type ===
        "delivered"
      ) {
        return data.rows.filter(
          (row) =>
            isStageDelivered(
              row,
              selectedKpi.section
            )
        );
      }

      if (selectedKpi.type === "special") {
        return data.rows.filter(
          (row) =>
            scheduledEligible(row, selectedKpi.section) &&
            isSpecialStage(row, selectedKpi.section)
        );
      }

      return data.rows.filter(
        (row) => {
          if (
            !scheduledEligible(
              row,
              selectedKpi.section
            )
          ) {
            return false;
          }

          const expectedDate =
            parseDateOnly(
              row[
                calendarDateHeader(
                  selectedKpi.section
                )
              ] || ""
            );

          return (
            !!expectedDate &&
            classifyDate(
              expectedDate
            ) ===
              selectedKpi.type &&
            !(
              selectedKpi.type === "backlog" &&
              leavesBacklog(row, selectedKpi.section)
            )
          );
        }
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

  /* =========================
     TEAM · POR COLABORADOR
     ========================= */

  const teamEvents = useMemo(() => {
    const events: TeamEvent[] = [];

    TEAM_STAGES.forEach((stage) => {
      const dateHeader = calendarDateHeader(stage);
      const memberHeader = collaboratorHeader(stage);
      const statusHeader = calendarStatusHeader(stage);

      teamRows.forEach((row) => {
        if (!calendarActive(row, stage)) {
          return;
        }

        const date = parseDateOnly(row[dateHeader] || "");

        if (!date) {
          return;
        }

        events.push({
          row,
          stage,
          date,
          delivered: isStageDelivered(row, stage),
          member: collaboratorKey(row[memberHeader] || ""),
          status: statusHeader ? row[statusHeader] || "" : "",
        });
      });
    });

    return events.sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [teamRows]);

  const teamMonthRange = useMemo(
    () => ({
      start: new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth(),
        1
      ).getTime(),
      end: new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() + 1,
        0
      ).getTime(),
    }),
    [calendarMonth]
  );

  const isInTeamMonth = (date: Date) =>
    date.getTime() >= teamMonthRange.start &&
    date.getTime() <= teamMonthRange.end;

  // Menú derecho: cada colaborador con sus entregas del mes y su backlog.
  /*
    Solo aparecen los colaboradores que tienen entregas en los
    tipos seleccionados (si nadie de EA hace Draft, no sale al
    filtrar por Draft).
  */
  const teamMembers = useMemo(() => {
    const summary = new Map<
      string,
      { month: number; backlog: number }
    >();

    teamEvents.forEach((event) => {
      if (hiddenTeamStages.includes(event.stage)) {
        return;
      }

      const entry = summary.get(event.member) || {
        month: 0,
        backlog: 0,
      };

      if (isInTeamMonth(event.date)) {
        entry.month++;
      }

      if (
        !event.delivered &&
        classifyDate(event.date) === "backlog"
      ) {
        entry.backlog++;
      }

      summary.set(event.member, entry);
    });

    return Array.from(summary.entries())
      .map(([member, counts]) => ({ member, ...counts }))
      .sort((a, b) => {
        if (!a.member) {
          return 1;
        }

        if (!b.member) {
          return -1;
        }

        return a.member.localeCompare(b.member);
      });
  }, [teamEvents, teamMonthRange, hiddenTeamStages]);

  const selectedTeamMembers = teamMembers.filter(
    (item) => !hiddenTeamMembers.includes(item.member)
  );

  const allTeamMembersSelected =
    selectedTeamMembers.length === teamMembers.length;

  const teamMemberLabel = allTeamMembersSelected
    ? "Todo el equipo"
    : selectedTeamMembers.length === 0
    ? "Ninguno"
    : selectedTeamMembers.length === 1
    ? selectedTeamMembers[0].member || "Sin asignar"
    : `${selectedTeamMembers.length} de ${teamMembers.length}`;

  // Con más de un colaborador, cada entrega muestra de quién es.
  const showTeamEventMember = selectedTeamMembers.length !== 1;

  const memberTeamEvents = useMemo(
    () =>
      teamEvents.filter(
        (event) => !hiddenTeamMembers.includes(event.member)
      ),
    [teamEvents, hiddenTeamMembers]
  );

  const visibleTeamEvents = useMemo(
    () =>
      memberTeamEvents.filter(
        (event) => !hiddenTeamStages.includes(event.stage)
      ),
    [memberTeamEvents, hiddenTeamStages]
  );

  const visibleMonthTeamEvents = visibleTeamEvents.filter(
    (event) => isInTeamMonth(event.date)
  );

  /*
   * Filtro por semana de la tabla de entregas (Team → Tabla).
   * La llave es el lunes de la semana, así no se mezclan años.
   */
  const [teamTableWeek, setTeamTableWeek] = useState("todas");

  const weekKeyOf = (date: Date) => {
    const monday = startOfWeek(date);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;
  };

  const teamTableWeeks = useMemo(() => {
    const weeks = new Map<string, Date>();
    visibleTeamEvents.forEach((event) => {
      weeks.set(weekKeyOf(event.date), startOfWeek(event.date));
    });
    const current = weekKeyOf(new Date());
    return Array.from(weeks.entries())
      // Las más recientes primero.
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([key, monday]) => {
        const sunday = addDays(monday, 6);
        const short = (d: Date) =>
          `${d.getDate()} ${monthNames[d.getMonth()].slice(0, 3).toLowerCase()}`;
        return {
          key,
          label: `${getDeliveryWeekLabel(monday)} · ${short(monday)} – ${short(sunday)} ${String(sunday.getFullYear()).slice(2)}${key === current ? " (esta semana)" : ""}`,
        };
      });
  }, [visibleTeamEvents]);

  const teamTableEvents =
    teamTableWeek === "todas"
      ? visibleTeamEvents
      : visibleTeamEvents.filter(
          (event) => weekKeyOf(event.date) === teamTableWeek
        );

  /*
    Resumen al lado de cada semana: total de entregas y desglose
    por colaborador (o por tipo si solo hay un colaborador).
  */
  function renderTeamWeekSummary(week: Date[]) {
    const start = week[0].getTime();
    const end = addDays(week[week.length - 1], 1).getTime();

    const events = visibleTeamEvents.filter(
      (event) =>
        event.date.getTime() >= start && event.date.getTime() < end
    );

    const delivered = events.filter((event) => event.delivered).length;

    const breakdown = new Map<string, number>();

    events.forEach((event) => {
      const key = showTeamEventMember
        ? event.member || "Sin asignar"
        : teamStageShortLabel[event.stage];

      breakdown.set(key, (breakdown.get(key) || 0) + 1);
    });

    const rows = Array.from(breakdown.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );

    const max = rows[0]?.[1] || 1;
    const shown = rows.slice(0, 6);
    const rest = rows.slice(6);

    return (
      <div className="calendarWeekSummary">
        <span className="weekSummaryLabel">
          Sem {getIsoWeekNumber(week[0])}
        </span>

        <strong className="weekSummaryTotal">{events.length}</strong>

        <span className="weekSummarySub">
          {events.length === 1 ? "entrega" : "entregas"}
          {delivered > 0 && ` · ${delivered} ✓`}
        </span>

        {shown.length > 0 && (
          <ul className="weekSummaryBreakdown">
            {shown.map(([name, count]) => (
              <li key={name} title={`${name}: ${count}`}>
                <span className="weekSummaryName">{name}</span>
                <span className="weekSummaryBar">
                  <i style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <b>{count}</b>
              </li>
            ))}
          </ul>
        )}

        {rest.length > 0 && (
          <span
            className="weekSummaryMore"
            title={rest.map(([name, count]) => `${name}: ${count}`).join("\n")}
          >
            +{rest.length} más
          </span>
        )}
      </div>
    );
  }

  function toggleTeamMember(member: string) {
    setHiddenTeamMembers((current) =>
      current.includes(member)
        ? current.filter((item) => item !== member)
        : [...current, member]
    );
  }

  // "Todos" funciona para todos y para ninguno.
  function toggleAllTeamMembers() {
    setHiddenTeamMembers(
      allTeamMembersSelected
        ? teamMembers.map((item) => item.member)
        : []
    );
  }

  function toggleAllTeamStages() {
    setHiddenTeamStages(
      hiddenTeamStages.length === 0 ? [...TEAM_STAGES] : []
    );
  }

  function toggleTeamStage(stage: TeamCalendar) {
    setHiddenTeamStages((current) =>
      current.includes(stage)
        ? current.filter((item) => item !== stage)
        : [...current, stage]
    );
  }

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

  /*
    Carga por colaborador y semana sumando todos los tipos
    de entrega visibles. Igual que antes, se calcula por
    Expected Done e ignora si ya se entregó.
  */
  const scheduledWorkload = useMemo(() => {
    const byMember = new Map<
      string,
      {
        counts: Record<number, number>;
        items: Record<number, DeliveryDetailItem[]>;
        total: number;
      }
    >();

    TEAM_STAGES.filter(
      (stage) => !hiddenTeamStages.includes(stage)
    ).forEach((stage) => {
      const dateHeader = calendarDateHeader(stage);
      const memberHeader = collaboratorHeader(stage);

      teamRows.forEach((row) => {
        if (!scheduledEligible(row, stage)) {
          return;
        }

        const date = parseDateOnly(row[dateHeader] || "");

        if (!date || !isInTeamMonth(date)) {
          return;
        }

        const name =
          collaboratorKey(row[memberHeader] || "") ||
          "Sin asignar";

        const entry = byMember.get(name) || {
          counts: {},
          items: {},
          total: 0,
        };

        const week = getIsoWeekNumber(date);

        entry.counts[week] = (entry.counts[week] || 0) + 1;
        entry.items[week] = [
          ...(entry.items[week] || []),
          {
            client: `${row["CLIENTE"] || "Sin cliente"} · ${teamStageShortLabel[stage]}`,
          },
        ];
        entry.total++;

        byMember.set(name, entry);
      });
    });

    return Array.from(byMember.entries())
      .map(([name, entry]) => ({ name, ...entry }))
      .sort((a, b) => {
        if (a.name === "Sin asignar") {
          return 1;
        }

        if (b.name === "Sin asignar") {
          return -1;
        }

        return a.name.localeCompare(b.name);
      });
  }, [teamRows, hiddenTeamStages, teamMonthRange]);

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
        teamRows
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
      teamRows,
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

  // Hasta la semana en curso, para ver cómo van los avances.
  const latestCompletedWeekStart =
    useMemo(
      () => startOfWeek(new Date()),
      []
    );

  const isCurrentAccountabilityWeek =
    accountabilityWeekStart.getTime() >=
    startOfWeek(new Date()).getTime();

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
          "dclplg",
        ] as TeamCalendar[];
      }

      if (role === "PSYCH") {
        return ["psych", "dclpsych"] as TeamCalendar[];
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
          const memberHeader =
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

          teamRows.forEach((row) => {
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

            /*
             * Entregado sin fecha (p. ej. MGM REVIEW o SENT TO
             * USCIS sin "SENT TO MGM"): se toma la fecha esperada.
             */
            const done =
              parseDateOnly(
                row[doneKey] || ""
              ) ||
              (isStageDelivered(row, stage)
                ? expected
                : null);

            /*
             * SPECIAL CASE / UNRESPONSIVE sin entregar: cuentan en la
             * meta de su propia semana, pero no se arrastran como
             * backlog a las siguientes (afectarían la proporción).
             */
            const stageStatus = specialStatusOf(row, stage);

            if (
              !done &&
              ["SPECIAL CASE", "UNRESPONSIVE"].includes(stageStatus) &&
              expected.getTime() < accountabilityWeekStart.getTime()
            ) {
              return;
            }

            // Igual que el calendario: junta HÉCTOR/HECTOR, LESLY/LESSLY…
            const collaborator =
              collaboratorKey(
                row[memberHeader] || ""
              ) || "Sin asignar";

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
                          ? parseDateOnly(item.row[doneKey] || "")
                            ? formatDate(item.row[doneKey] || "")
                            : "Entregado (sin fecha)"
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
                        parseDateOnly(item.row[doneKey] || "")
                          ? formatDate(item.row[doneKey] || "")
                          : "Entregado (sin fecha)",
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
      teamRows,
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

  const teamCalendarWeeks = useMemo(() => {
    const weeks: Date[][] = [];

    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }

    return weeks;
  }, [calendarDays]);

  const nwCalendarDays = useMemo(() => {
    const year = nwCalendarMonth.getFullYear();
    const month = nwCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const mondayIndex =
      firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const startDate = addDays(firstDay, -mondayIndex);

    const lastDayMondayIndex =
      lastDay.getDay() === 0 ? 6 : lastDay.getDay() - 1;
    const remaining = 6 - lastDayMondayIndex;
    const endDate = addDays(lastDay, remaining);

    const days: Date[] = [];
    let cursor = new Date(startDate);

    while (cursor.getTime() <= endDate.getTime()) {
      days.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }

    return days;
  }, [nwCalendarMonth]);

  const nwFilteredRows = useMemo(() => {
    if (!nwPlFilter) {
      return nwData.rows;
    }

    if (nwPlFilter === "__UNASSIGNED__") {
      return nwData.rows.filter(
        (row) => !(row[NW_PL_ASSIGNED_HEADER] || "").trim()
      );
    }

    return nwData.rows.filter(
      (row) =>
        (row[NW_PL_ASSIGNED_HEADER] || "").trim() === nwPlFilter
    );
  }, [nwData.rows, nwPlFilter]);

  const nwCalendarEvents = useMemo(() => {
    const header = NW_DATE_FIELDS[nwCalendarKind].header;

    return nwFilteredRows
      .map((row) => ({
        row,
        date: parseDateOnly(row[header] || ""),
        completed:
          nwCalendarKind === "revisioncs"
            ? !!(
                row["REVISIÓN CS COMPLETADA"] || ""
              ).trim()
            : false,
      }))
      .filter(
        (
          item
        ): item is {
          row: CaseRow;
          date: Date;
          completed: boolean;
        } => !!item.date
      );
  }, [nwFilteredRows, nwCalendarKind]);

  const csCalendarDays = useMemo(() => {
    const year = csCalendarMonth.getFullYear();
    const month = csCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const mondayIndex =
      firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const startDate = addDays(firstDay, -mondayIndex);

    const lastDayMondayIndex =
      lastDay.getDay() === 0 ? 6 : lastDay.getDay() - 1;
    const remaining = 6 - lastDayMondayIndex;
    const endDate = addDays(lastDay, remaining);

    const days: Date[] = [];
    let cursor = new Date(startDate);

    while (cursor.getTime() <= endDate.getTime()) {
      days.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }

    return days;
  }, [csCalendarMonth]);

  const csCalendarEvents = useMemo(() => {
    // Una entrada por cada revisión (carátula, post DCL, final) con fecha.
    const vawaEvents: MergedReviewEvent[] = CS_REVIEWS.flatMap((review) =>
      data.rows
        .map((row): MergedReviewEvent | null => {
          const date = parseDateOnly(row[review.expected] || "");

          return date
            ? {
                origin: "vawa" as const,
                row,
                date,
                completed: !!(row[review.done] || "").trim(),
                client: row["CLIENTE"] || "Sin cliente",
                kind: review.kind,
                member: collaboratorKey(row["CASE STRATEGIST"] || "") || "Sin asignar",
              }
            : null;
        })
        .filter(
          (item): item is MergedReviewEvent => item !== null
        )
    );

    const nonVawaEvents: MergedReviewEvent[] = nwData.rows
      .map((row): MergedReviewEvent | null => {
        const date = parseDateOnly(
          row[NONVAWA_CS_DATE_HEADER] || ""
        );

        return date
          ? {
              origin: "nonvawa" as const,
              row,
              date,
              completed: !!(
                row[NONVAWA_CS_DONE_HEADER] || ""
              ).trim(),
              client: row["CL"] || "Sin cliente",
              kind: "nonvawa" as const,
              member: "NON-VAWA",
            }
          : null;
      })
      .filter(
        (item): item is MergedReviewEvent => item !== null
      );

    return [...vawaEvents, ...nonVawaEvents];
  }, [data.rows, nwData.rows]);

  // Resumen de cada semana del calendario de CS: total, por tipo y por persona.
  function renderCsWeekSummary(week: Date[]) {
    const start = week[0].getTime();
    const end = addDays(week[week.length - 1], 1).getTime();
    const events = csCalendarEvents.filter(
      (event) => event.date.getTime() >= start && event.date.getTime() < end
    );
    const completed = events.filter((event) => event.completed).length;
    const count = (key: (e: MergedReviewEvent) => string) => {
      const map = new Map<string, number>();
      events.forEach((e) => map.set(key(e), (map.get(key(e)) || 0) + 1));
      return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    };
    const byKind = count((e) => CS_KIND_LABEL[e.kind || "nonvawa"]);
    const byMember = count((e) => e.member || "Sin asignar");
    const max = Math.max(1, ...byKind.map(([, n]) => n), ...byMember.map(([, n]) => n));
    const list = (rows: [string, number][]) =>
      rows.map(([name, n]) => (
        <li key={name} title={`${name}: ${n}`}>
          <span className="weekSummaryName">{name}</span>
          <span className="weekSummaryBar">
            <i style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <b>{n}</b>
        </li>
      ));

    return (
      <div className="calendarWeekSummary">
        <span className="weekSummaryLabel">Sem {getIsoWeekNumber(week[0])}</span>
        <strong className="weekSummaryTotal">{events.length}</strong>
        <span className="weekSummarySub">
          {events.length === 1 ? "revisión" : "revisiones"}
          {completed > 0 && ` · ${completed} ✓`}
        </span>
        {byKind.length > 0 && <ul className="weekSummaryBreakdown">{list(byKind)}</ul>}
        {byMember.length > 0 && (
          <ul className="weekSummaryBreakdown csWeekPeople">{list(byMember)}</ul>
        )}
      </div>
    );
  }

  /*
   * Initial review (first approach): no tiene fecha compromiso;
   * CS registra el cliente y la fecha en que lo hizo.
   */
  const initialReviews = useMemo(
    () =>
      data.rows
        .map((row) => ({ row, date: parseDateOnly(row[INITIAL_REVIEW_HEADER] || "") }))
        .filter((item): item is { row: CaseRow; date: Date } => !!item.date)
        .sort((a, b) => b.date.getTime() - a.date.getTime()),
    [data.rows]
  );

  const canAddInitialReview =
    role === "ADMIN" || role === "CS" || role === "TL";

  const clientOptions = useMemo(
    () =>
      data.rows
        .filter((row) => (row["CLIENTE"] || "").trim())
        .map((row) => ({
          row,
          label:
            isGeneral && row.__celula
              ? `${row["CLIENTE"].trim()} · ${vistaLabel(row.__celula as Celula)}`
              : row["CLIENTE"].trim(),
        })),
    [data.rows, isGeneral]
  );

  async function saveInitialReview() {
    const match = clientOptions.find(
      (option) => option.label.toUpperCase() === irClient.trim().toUpperCase()
    );
    if (!match) {
      setError("Elige un cliente de la lista");
      return;
    }
    if (!irDate) {
      setError("Elige la fecha");
      return;
    }
    setIrSaving(true);
    setError("");
    try {
      const target = match.row.__celula || celula;
      const response = await fetch("/api/cases/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          celula: target,
          row: Number(match.row.__row),
          changes: { [INITIAL_REVIEW_HEADER]: irDate },
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "No se pudo guardar");
      setData((prev) => ({
        ...prev,
        rows: prev.rows.map((row) =>
          row.__row === match.row.__row && row.__celula === match.row.__celula
            ? { ...row, [INITIAL_REVIEW_HEADER]: irDate }
            : row
        ),
      }));
      setMessage("Initial review registrado");
      setIrClient("");
      setIrOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setIrSaving(false);
    }
  }

  function renderInitialReview() {
    const weekStart = startOfWeek(new Date()).getTime();
    const thisWeek = initialReviews.filter((item) => item.date.getTime() >= weekStart).length;

    return (
      <section className="workloadCard csInitialReview">
        <div className="workloadHeader">
          <div>
            <p className="eyebrow">INITIAL REVIEW (FIRST APPROACH)</p>
            <h2>Initial reviews registrados</h2>
            <p>
              No tiene fecha compromiso: se registra el cliente y el día en que se hizo.
              Esta semana: <strong>{thisWeek}</strong> · total: <strong>{initialReviews.length}</strong>
            </p>
          </div>
          {canAddInitialReview && (
            <button className="refreshButton" onClick={() => setIrOpen(!irOpen)}>
              {irOpen ? "Cancelar" : "+ Agregar"}
            </button>
          )}
        </div>

        {irOpen && (
          <div className="csIrForm">
            <label>
              <span>Cliente</span>
              <input
                list="cs-ir-clients"
                value={irClient}
                placeholder="Nombre del cliente"
                onChange={(e) => setIrClient(e.target.value)}
              />
              <datalist id="cs-ir-clients">
                {clientOptions.map((option) => (
                  <option key={`${option.row.__celula}-${option.row.__row}`} value={option.label} />
                ))}
              </datalist>
            </label>
            <label>
              <span>Fecha en que se hizo</span>
              <input type="date" value={irDate} onChange={(e) => setIrDate(e.target.value)} />
            </label>
            <button className="csIrSave" disabled={irSaving} onClick={saveInitialReview}>
              {irSaving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        )}

        <div className="csIrList">
          {initialReviews.slice(0, 40).map((item) => (
            <div key={`${item.row.__celula}-${item.row.__row}`} className="csIrRow">
              <strong>{item.row["CLIENTE"]}</strong>
              {isGeneral && item.row.__celula && (
                <span className="celulaTag">{vistaLabel(item.row.__celula as Celula)}</span>
              )}
              <span>{formatDate(item.row[INITIAL_REVIEW_HEADER] || "")}</span>
            </div>
          ))}
          {!initialReviews.length && (
            <div className="emptyState">Todavía no hay initial reviews registrados.</div>
          )}
        </div>
      </section>
    );
  }

  const mgmReviewCalendarDays = useMemo(() => {
    const year = mgmReviewCalendarMonth.getFullYear();
    const month = mgmReviewCalendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const mondayIndex =
      firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const startDate = addDays(firstDay, -mondayIndex);

    const lastDayMondayIndex =
      lastDay.getDay() === 0 ? 6 : lastDay.getDay() - 1;
    const remaining = 6 - lastDayMondayIndex;
    const endDate = addDays(lastDay, remaining);

    const days: Date[] = [];
    let cursor = new Date(startDate);

    while (cursor.getTime() <= endDate.getTime()) {
      days.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }

    return days;
  }, [mgmReviewCalendarMonth]);

  const mgmReviewCalendarEvents = useMemo(() => {
    const vawaEvents: MergedReviewEvent[] = data.rows
      .map((row): MergedReviewEvent | null => {
        const date = parseDateOnly(
          row[VAWA_MGM_DATE_HEADER] || ""
        );

        return date
          ? {
              origin: "vawa" as const,
              row,
              date,
              completed: isStageDelivered(row, "mgm"),
              client: row["CLIENTE"] || "Sin cliente",
            }
          : null;
      })
      .filter(
        (item): item is MergedReviewEvent => item !== null
      );

    const nonVawaEvents: MergedReviewEvent[] = nwData.rows
      .map((row): MergedReviewEvent | null => {
        const date = parseDateOnly(
          row[NONVAWA_DEADLINE_INTERNO_DATE_HEADER] || ""
        );

        return date
          ? {
              origin: "nonvawa" as const,
              row,
              date,
              completed: NONVAWA_DELIVERED_STATUSES.has(
                norm(row["GENERAL STATUS"] || "")
              ),
              client: row["CL"] || "Sin cliente",
            }
          : null;
      })
      .filter(
        (item): item is MergedReviewEvent => item !== null
      );

    return [...vawaEvents, ...nonVawaEvents];
  }, [data.rows, nwData.rows]);

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

  function nwPreviousMonth() {
    setNwCalendarMonth(
      new Date(
        nwCalendarMonth.getFullYear(),
        nwCalendarMonth.getMonth() - 1,
        1
      )
    );
  }

  function nwNextMonth() {
    setNwCalendarMonth(
      new Date(
        nwCalendarMonth.getFullYear(),
        nwCalendarMonth.getMonth() + 1,
        1
      )
    );
  }

  function nwGoToday() {
    const today = new Date();

    setNwCalendarMonth(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )
    );
  }

  function csPreviousMonth() {
    setCsCalendarMonth(
      new Date(
        csCalendarMonth.getFullYear(),
        csCalendarMonth.getMonth() - 1,
        1
      )
    );
  }

  function csNextMonth() {
    setCsCalendarMonth(
      new Date(
        csCalendarMonth.getFullYear(),
        csCalendarMonth.getMonth() + 1,
        1
      )
    );
  }

  function csGoToday() {
    const today = new Date();

    setCsCalendarMonth(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1
      )
    );
  }

  function mgmReviewPreviousMonth() {
    setMgmReviewCalendarMonth(
      new Date(
        mgmReviewCalendarMonth.getFullYear(),
        mgmReviewCalendarMonth.getMonth() - 1,
        1
      )
    );
  }

  function mgmReviewNextMonth() {
    setMgmReviewCalendarMonth(
      new Date(
        mgmReviewCalendarMonth.getFullYear(),
        mgmReviewCalendarMonth.getMonth() + 1,
        1
      )
    );
  }

  function mgmReviewGoToday() {
    const today = new Date();

    setMgmReviewCalendarMonth(
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
  }

  function openCases() {
    setMainView("cases");
  }

  function openHistory() {
    setMainView("history");
  }

  function openAccountability() {
    setMainView("accountability");
  }

  function openNwGeneral() {
    setMainView("nwgeneral");

    /*
     * "revisioncs" solo se alcanza desde el calendario
     * unificado "CS"; al entrar por el propio nav de NW
     * General siempre arrancamos en un tab real.
     */
    if (nwCalendarKind === "revisioncs") {
      setNwCalendarKind("due");
    }

    if (!nwLoaded && !nwLoading) {
      loadNwGeneral();
    }
  }

  function openCsReview() {
    setMainView("cs");

    if (hasNwGeneral && !nwLoaded && !nwLoading) {
      loadNwGeneral();
    }
  }

  function openCsEvent(event: MergedReviewEvent) {
    if (event.origin === "vawa") {
      openGeneralCase(event.row);
      return;
    }

    setNwCalendarKind("revisioncs");
    setNwSelectedRow(event.row);
  }

  function openMgmReview() {
    setMainView("mgmreview");

    if (hasNwGeneral && !nwLoaded && !nwLoading) {
      loadNwGeneral();
    }
  }

  function openMgmReviewEvent(event: MergedReviewEvent) {
    if (event.origin === "vawa") {
      openTeamCase(event.row, "mgm");
      return;
    }

    setNwCalendarKind("interno");
    setNwSelectedRow(event.row);
  }

  function openTeam() {
    setMainView("team");
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

        <button
          className="workflowMetric isDelivered"
          onDoubleClick={() =>
            setSelectedKpi({
              section,
              type: "delivered",
            })
          }
        >
          <span>
            Entregado
          </span>

          <strong>
            {stats.delivered}
          </strong>
        </button>
      </div>
    );
  }

  /* =========================
     CASES · CALENDARIO DEL CASO
     ========================= */

  const caseDatesLocked =
    role === "MANAGER" || role === "COORDINATOR" || role === "CS";

  const caseCalendarEvents = useMemo(() => {
    if (!selectedCase) {
      return [];
    }

    return CASE_CALENDAR_ITEMS.map((item) => ({
      item,
      date: parseDateOnly(selectedCase[item.dateHeader] || ""),
      delivered: item.stage
        ? isStageDelivered(selectedCase, item.stage)
        : false,
      kpi: caseItemKpi(selectedCase, item),
    })).filter(
      (
        event
      ): event is {
        item: CaseDateItem;
        date: Date;
        delivered: boolean;
        kpi: { label: string; tone: CaseKpiTone };
      } => !!event.date
    );
  }, [selectedCase]);

  // Resumen de KPIs de las etapas del caso (sin contar el deadline).
  const caseKpiSummary = useMemo(() => {
    if (!selectedCase) {
      return [];
    }

    const tones = CASE_CALENDAR_ITEMS.filter((item) => item.stage).map(
      (item) => caseItemKpi(selectedCase, item).tone
    );

    const count = (...wanted: CaseKpiTone[]) =>
      tones.filter((tone) => wanted.includes(tone)).length;

    return [
      {
        label: "A tiempo / adelantadas",
        value: count("ontime", "early"),
        className: "deliveryDelivered",
      },
      { label: "Tarde", value: count("late"), className: "deliveryLate" },
      {
        label: "Backlog",
        value: count("backlog"),
        className: "deliveryBacklog",
      },
      {
        label: "Pendientes",
        value: count("pending", "future"),
        className: "deliveryFuture",
      },
      {
        label: "Sin fecha",
        value: count("none"),
        className: "deliveryNone",
      },
    ];
  }, [selectedCase]);

  function openCaseCalendar() {
    const pending = caseCalendarEvents.find(
      (event) => !event.delivered && event.item.stage
    );

    const target =
      pending?.date || caseCalendarEvents[0]?.date || new Date();

    setCaseCalendarMonth(
      new Date(target.getFullYear(), target.getMonth(), 1)
    );
    setCaseFocusKey(null);
    setCaseModalView("calendar");
  }

  function shiftCaseCalendarMonth(offset: number) {
    setCaseCalendarMonth(
      new Date(
        caseCalendarMonth.getFullYear(),
        caseCalendarMonth.getMonth() + offset,
        1
      )
    );
  }

  function saveCaseDate(header: string, value: string) {
    if (!selectedCase || caseDatesLocked) {
      return;
    }

    setSelectedCase({ ...selectedCase, [header]: value });
    saveField(Number(selectedCase.__row), header, value);
  }

  function renderCaseCalendar() {
    if (!selectedCase) {
      return null;
    }

    return (
      <section className="caseCalendar">
        <div className="calendarCard">
          <div className="calendarToolbar">
            <div className="calendarTitle">
              <h2>
                {monthNames[caseCalendarMonth.getMonth()]}{" "}
                {caseCalendarMonth.getFullYear()}
              </h2>

              <span>
                {caseDatesLocked
                  ? "Solo lectura"
                  : "Arrastra una entrega a otro día para cambiar su fecha"}
              </span>
            </div>

            <div className="calendarControls">
              <button onClick={() => shiftCaseCalendarMonth(-1)}>‹</button>

              <button
                className="todayButton"
                onClick={() => {
                  const now = new Date();

                  setCaseCalendarMonth(
                    new Date(now.getFullYear(), now.getMonth(), 1)
                  );
                }}
              >
                Hoy
              </button>

              <button onClick={() => shiftCaseCalendarMonth(1)}>›</button>
            </div>
          </div>

          <div className="calendarWeekHeader">
            {weekDays.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="calendarGrid">
            {buildMonthDays(caseCalendarMonth).map((day) => {
              const dayEvents = caseCalendarEvents.filter((event) =>
                sameDay(event.date, day)
              );

              const deliveryType = classifyDate(day);

              return (
                <div
                  key={day.toISOString()}
                  className={`calendarDay caseCalendarDay ${
                    day.getMonth() !== caseCalendarMonth.getMonth()
                      ? "outsideMonth"
                      : ""
                  }`}
                  onDragOver={(e) => {
                    if (!caseDatesLocked) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();

                    const item = CASE_CALENDAR_ITEMS.find(
                      (candidate) =>
                        candidate.key ===
                        e.dataTransfer.getData("text/plain")
                    );

                    if (item) {
                      saveCaseDate(item.dateHeader, dateToInput(day));
                      setCaseFocusKey(item.key);
                    }
                  }}
                >
                  <div className="calendarDayNumber">
                    <span
                      className={
                        sameDay(day, new Date()) ? "todayNumber" : ""
                      }
                    >
                      {day.getDate()}
                    </span>
                  </div>

                  <div className="calendarEvents">
                    {dayEvents.map((event) => (
                      <button
                        key={event.item.key}
                        draggable={!caseDatesLocked}
                        onDragStart={(e) =>
                          e.dataTransfer.setData(
                            "text/plain",
                            event.item.key
                          )
                        }
                        className={`calendarEvent ${
                          !event.item.stage
                            ? "calendarEventDeadline"
                            : event.kpi.tone === "late"
                            ? "calendarEventLate"
                            : event.delivered
                            ? "calendarEventDelivered"
                            : deliveryType === "backlog"
                            ? "calendarEventBacklog"
                            : deliveryType === "pending"
                            ? "calendarEventPending"
                            : "calendarEventFuture"
                        } ${
                          caseFocusKey === event.item.key
                            ? "isFocused"
                            : ""
                        }`}
                        title={
                          event.item.stage
                            ? stageLabel(event.item.stage)
                            : "Deadline del caso"
                        }
                        onClick={() => setCaseFocusKey(event.item.key)}
                      >
                        <strong>
                          <b className="teamStageTag">{event.item.label}</b>
                        </strong>

                        <span>
                          {event.delivered ? "✓ " : ""}
                          {event.kpi.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="caseKpiSummary">
          {caseKpiSummary.map((item) => (
            <div key={item.label} className={`caseKpiStat ${item.className}`}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="caseDateList">
          <div className="caseDateListHeader">
            <div>ENTREGA</div>
            <div>FECHA ESPERADA</div>
            <div>ENTREGADO</div>
            <div>KPI</div>
          </div>

          {CASE_CALENDAR_ITEMS.map((item) => {
            const expected = selectedCase[item.dateHeader] || "";
            const done = item.doneHeader
              ? selectedCase[item.doneHeader] || ""
              : "";

            const kpi = caseItemKpi(selectedCase, item);

            return (
              <div
                key={item.key}
                className={`caseDateRow ${
                  caseFocusKey === item.key ? "isFocused" : ""
                }`}
                onClick={() => {
                  setCaseFocusKey(item.key);

                  const date = parseDateOnly(expected);

                  if (date) {
                    setCaseCalendarMonth(
                      new Date(date.getFullYear(), date.getMonth(), 1)
                    );
                  }
                }}
              >
                <div className="caseDateName">
                  <b className="teamStageTag">{item.label}</b>
                  <span>
                    {item.stage
                      ? stageLabel(item.stage)
                      : "Deadline del caso"}
                  </span>
                </div>

                <div>
                  {caseDatesLocked ? (
                    <span className="readValue">
                      {formatDate(expected) || "—"}
                    </span>
                  ) : (
                    <input
                      type="date"
                      value={toInputDate(expected)}
                      onChange={(e) =>
                        setSelectedCase({
                          ...selectedCase,
                          [item.dateHeader]: e.target.value,
                        })
                      }
                      onBlur={(e) =>
                        saveCaseDate(item.dateHeader, e.target.value)
                      }
                    />
                  )}
                </div>

                <div>
                  {!item.doneHeader ? (
                    <span className="tableDash">—</span>
                  ) : caseDatesLocked ? (
                    <span className="readValue">
                      {formatDate(done) || "—"}
                    </span>
                  ) : (
                    <input
                      type="date"
                      value={toInputDate(done)}
                      onChange={(e) =>
                        setSelectedCase({
                          ...selectedCase,
                          [item.doneHeader || ""]: e.target.value,
                        })
                      }
                      onBlur={(e) =>
                        saveCaseDate(item.doneHeader || "", e.target.value)
                      }
                    />
                  )}
                </div>

                <div>
                  <span className={`deliveryState ${caseKpiClass[kpi.tone]}`}>
                    {kpi.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
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
        "COORDINATOR" ||
      role === "CS";

    return (
      <div className="detailField">
        <label>
          {label}
        </label>

        {locked ? (
          <div className="readValue">
            {value.startsWith("http") ? (
              <a
                className="fieldLink"
                href={value}
                target="_blank"
                rel="noreferrer"
              >
                Abrir documento ↗
              </a>
            ) : (
              value || "—"
            )}
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

        {!locked &&
          value.startsWith("http") && (
            <a
              className="fieldLink"
              href={value}
              target="_blank"
              rel="noreferrer"
            >
              Abrir ↗
            </a>
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

            {/* Psych abre la carátula para editarla; el link no se cambia aquí. */}
            <Field
              label="Carátula"
              header="LINK CARÁTULA"
              readOnly
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
        Cargando RFE Hub…
      </div>
    );
  }

  if (!user?.authenticated) {
    return (
      <div className="loginScreen">
        <div className="loginCard">
          <div className="logoMark">
            R
          </div>

          <h1>
            RFE Hub
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
            {celula === "general"
              ? "R"
              : celula === "gmc"
              ? "GB"
              : celula
              ? CELULAS[celula].label.charAt(0)
              : "A"}
          </div>

          <div className="brandWords">
            <strong>
              {celula
                ? vistaLabel(celula).toUpperCase()
                : "ALPHA"}
            </strong>

            <span>
              RFE HUB
            </span>
          </div>
        </div>

        {vistasFor(user).length > 1 && (
          <div
            className="celulaSwitch"
            role="group"
            aria-label="Célula"
          >
            {vistasFor(user).map((v) => (
              <button
                key={v}
                className={
                  v === celula ? "active" : ""
                }
                aria-pressed={v === celula}
                onClick={() => switchCelula(v)}
              >
                {vistaLabel(v)}
              </button>
            ))}
          </div>
        )}

        <div className="navLabel">
          WORKSPACE
        </div>

        <nav className="sidebarNav">
          {isGmc ? (
            <>
              <button
                className={`navItem ${
                  mainView === "gmc" ? "active" : ""
                }`}
                onClick={() => setMainView("gmc")}
              >
                <span className="navIcon">
                  ◷
                </span>

                <span>
                  Entregas GMC
                </span>
              </button>

              <button
                className={`navItem ${
                  mainView === "comms" ? "active" : ""
                }`}
                onClick={() => setMainView("comms")}
              >
                <span className="navIcon">
                  ☎
                </span>

                <span>
                  Comunicaciones
                </span>
              </button>
            </>
          ) : (
            <>
          {isGeneral && (
            <button
              className={`navItem ${
                mainView === "rfe" ? "active" : ""
              }`}
              onClick={() => setMainView("rfe")}
            >
              <span className="navIcon">
                ◧
              </span>

              <span>
                Dashboard RFE
              </span>
            </button>
          )}


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
              openTeam
            }
          >
            <span className="navIcon">
              ◉
            </span>

            <span>
              Team
            </span>
          </button>

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

          <button
            className={`navItem ${
              mainView === "regresos" ? "active" : ""
            }`}
            onClick={() => setMainView("regresos")}
          >
            <span className="navIcon">
              ↺
            </span>

            <span>
              Regresos
            </span>
          </button>

          {commsVista && (
            <button
              className={`navItem ${
                mainView === "comms" ? "active" : ""
              }`}
              onClick={() => setMainView("comms")}
            >
              <span className="navIcon">
                ☎
              </span>

              <span>
                Comunicaciones
              </span>
            </button>
          )}

          {tiemposCelula && (
            <button
              className={`navItem ${
                mainView === "tiempos" ? "active" : ""
              }`}
              onClick={() => setMainView("tiempos")}
            >
              <span className="navIcon">
                ⏱
              </span>

              <span>
                Estudio de tiempos
              </span>
            </button>
          )}

          {rsCelula && (
            <button
              className={`navItem ${
                mainView === "rs" ? "active" : ""
              }`}
              onClick={() => setMainView("rs")}
            >
              <span className="navIcon">
                ✎
              </span>

              <span>
                Rap Sheet (RS)
              </span>
            </button>
          )}

          {hasNwGeneral && (
            <button
              className={`navItem ${
                mainView === "nwgeneral"
                  ? "active"
                  : ""
              }`}
              onClick={openNwGeneral}
            >
              <span className="navIcon">
                ▤
              </span>

              <span>
                NW General
              </span>
            </button>
          )}

          <p className="navSectionLabel">
            Vistas combinadas
          </p>

          <button
            className={`navItem ${
              mainView === "cs" ? "active" : ""
            }`}
            onClick={openCsReview}
          >
            <span className="navIcon">
              ◈
            </span>

            <span>CS</span>
          </button>

          <button
            className={`navItem ${
              mainView === "mgmreview" ? "active" : ""
            }`}
            onClick={openMgmReview}
          >
            <span className="navIcon">
              ◆
            </span>

            <span>MGM Review</span>
          </button>
            </>
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

        {mainView === "rfe" && isGeneral && (
          <RfeDashboard />
        )}

        {mainView === "gmc" && isGmc && <Gmc />}

        {mainView === "rs" && rsCelula && <RapSheet celula={rsCelula} />}

        {mainView === "tiempos" && tiemposCelula && (
          <EstudioTiempos
            celula={tiemposCelula}
            clientes={commsClientes}
          />
        )}

        {mainView === "comms" && commsVista && (
          <Comunicaciones
            key={commsVista}
            vista={commsVista}
            clientes={commsVista === "gmc" ? [] : commsClientes}
          />
        )}

        {mainView === "regresos" && user.role && celula && (
          <Regresos
            role={user.role}
            email={user.email || ""}
            celulas={user.celulas}
            defaultCelula={
              celula === "general" || celula === "gmc"
                ? user.celulas[0]
                : celula
            }
            cases={regresoCases}
          />
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

                {/* SPECIAL CASE / UNRESPONSIVE: aparte del backlog real. */}
                <section className="workflowGroup specialCasesGroup">
                  <div className="workflowGroupHeader">
                    <p className="dashboardSectionEyebrow">
                      FUERA DEL BACKLOG
                    </p>

                    <h2>Special cases</h2>

                    <p>
                      Etapas en SPECIAL CASE o UNRESPONSIVE sin entregar. No cuentan
                      en el backlog. Doble clic para ver los casos.
                    </p>
                  </div>

                  <div className="specialCasesGrid">
                    {(
                      [
                        ["Escalación MGM", "mgm", mgmStats],
                        ["Carátula", "caratula", caratulaStats],
                        ["1st Draft", "draft", draftStats],
                        ["Escalación CVL", "plcvl", plcvlStats],
                        ["Psych · DOE", "psych", psychStats],
                        ["EA / Analyst", "ea", eaStats],
                        ["CVL", "cvl", cvlStats],
                      ] as [string, KpiSection, Stats][]
                    ).map(([title, section, stats]) => (
                      <button
                        key={section}
                        className={`workflowMetric ${stats.special ? "hasSpecial" : ""}`}
                        onDoubleClick={() =>
                          setSelectedKpi({ section, type: "special" })
                        }
                      >
                        <span>{title}</span>
                        <strong>{stats.special}</strong>
                      </button>
                    ))}
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
                      key={rowKey(row)}
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

                            {isGeneral &&
                              row.__celula && (
                                <span className="celulaTag">
                                  {vistaLabel(
                                    row.__celula as Celula
                                  )}
                                </span>
                              )}
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

        {mainView === "team" && (
          <>
            <header className="pageHeader teamPageHeader">
              <div>
                <p className="eyebrow">TEAM WORKLOAD</p>

                <h1>Team</h1>

                <p>
                  Entregas por colaborador. Cada entrega muestra su tipo
                  (Carátula, Draft, DOE, CVL…).
                </p>
              </div>

              <button className="refreshButton" onClick={loadCases}>
                ↻ Refresh
              </button>
            </header>

            <div className="teamViewToolbar">
              <div className="teamViewSwitch">
                <button
                  className={
                    teamViewMode === "calendar"
                      ? "teamViewButton active"
                      : "teamViewButton"
                  }
                  onClick={() => setTeamViewMode("calendar")}
                >
                  <span>▦</span>
                  Calendario
                </button>

                <button
                  className={
                    teamViewMode === "table"
                      ? "teamViewButton active"
                      : "teamViewButton"
                  }
                  onClick={() => setTeamViewMode("table")}
                >
                  <span>≡</span>
                  Tabla
                </button>
              </div>

              <div className="teamFilterBar">
                {teamMenu && (
                  <div
                    className="teamMenuBackdrop"
                    onClick={() => setTeamMenu(null)}
                  />
                )}

                <div className="teamDropdown">
                  <button
                    className={`teamDropdownButton ${
                      teamMenu === "member" ? "open" : ""
                    }`}
                    onClick={() =>
                      setTeamMenu(teamMenu === "member" ? null : "member")
                    }
                  >
                    <span className="teamDropdownLabel">Colaborador</span>
                    <strong>{teamMemberLabel}</strong>
                    <span className="teamDropdownCaret">▾</span>
                  </button>

                  {teamMenu === "member" && (
                    <div className="teamDropdownMenu">
                      <button
                        className="teamStageOption"
                        onClick={toggleAllTeamMembers}
                      >
                        <span
                          className={`teamCheck ${
                            allTeamMembersSelected
                              ? "checked"
                              : hiddenTeamMembers.length < teamMembers.length
                              ? "partial"
                              : ""
                          }`}
                        />
                        <span className="teamMemberName">Todo el equipo</span>
                      </button>

                      {teamMembers.map((item) => (
                        <button
                          key={item.member || "__UNASSIGNED__"}
                          className={`teamStageOption ${
                            !item.member ? "isUnassigned" : ""
                          }`}
                          onClick={() => toggleTeamMember(item.member)}
                        >
                          <span
                            className={`teamCheck ${
                              hiddenTeamMembers.includes(item.member)
                                ? ""
                                : "checked"
                            }`}
                          />

                          <span className="teamMemberName">
                            {item.member || "Sin asignar"}
                          </span>

                          <span className="teamMemberCounts">
                            {item.backlog > 0 && (
                              <em
                                className="teamMemberBacklog"
                                title="Entregas en backlog"
                              >
                                {item.backlog}
                              </em>
                            )}

                            <em title="Entregas en el mes">{item.month}</em>
                          </span>
                        </button>
                      ))}

                      {!teamMembers.length && (
                        <p className="teamMenuEmpty">
                          Nadie tiene entregas en los tipos seleccionados.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="teamDropdown">
                  <button
                    className={`teamDropdownButton ${
                      teamMenu === "stage" ? "open" : ""
                    }`}
                    onClick={() =>
                      setTeamMenu(teamMenu === "stage" ? null : "stage")
                    }
                  >
                    <span className="teamDropdownLabel">Tipo</span>
                    <strong>
                      {hiddenTeamStages.length === 0
                        ? "Todos"
                        : `${TEAM_STAGES.length - hiddenTeamStages.length} de ${TEAM_STAGES.length}`}
                    </strong>
                    <span className="teamDropdownCaret">▾</span>
                  </button>

                  {teamMenu === "stage" && (
                    <div className="teamDropdownMenu">
                      <button
                        className="teamStageOption"
                        onClick={toggleAllTeamStages}
                      >
                        <span
                          className={`teamCheck ${
                            hiddenTeamStages.length === 0
                              ? "checked"
                              : hiddenTeamStages.length < TEAM_STAGES.length
                              ? "partial"
                              : ""
                          }`}
                        />
                        <span className="teamMemberName">Todos</span>
                      </button>

                      {TEAM_STAGES.map((stage) => {
                        const count = memberTeamEvents.filter(
                          (event) =>
                            event.stage === stage &&
                            isInTeamMonth(event.date)
                        ).length;

                        return (
                          <button
                            key={stage}
                            className="teamStageOption"
                            onClick={() => toggleTeamStage(stage)}
                          >
                            <span
                              className={`teamCheck ${
                                hiddenTeamStages.includes(stage)
                                  ? ""
                                  : "checked"
                              }`}
                            />
                            <span className="teamMemberName">
                              {stageLabel(stage)}
                            </span>
                            <span className="teamMemberCounts">
                              <em title="Entregas en el mes">{count}</em>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {teamViewMode === "calendar" && (
              <section className="calendarCard">
                <div className="calendarToolbar">
                  <div className="calendarTitle">
                    <h2>
                      {monthNames[calendarMonth.getMonth()]}{" "}
                      {calendarMonth.getFullYear()}
                    </h2>

                    <span>
                      {teamMemberLabel}{" "}
                      ·{" "}
                      {
                        visibleMonthTeamEvents.filter(
                          (event) => !event.delivered
                        ).length
                      }{" "}
                      pendientes
                      {visibleMonthTeamEvents.some(
                        (event) => event.delivered
                      ) && (
                        <>
                          {" "}
                          ·{" "}
                          {
                            visibleMonthTeamEvents.filter(
                              (event) => event.delivered
                            ).length
                          }{" "}
                          entregadas
                        </>
                      )}
                    </span>
                  </div>

                  <div className="calendarControls">
                    <button onClick={previousMonth}>‹</button>

                    <button className="todayButton" onClick={goToday}>
                      Hoy
                    </button>

                    <button onClick={nextMonth}>›</button>
                  </div>
                </div>

                <div className="calendarWeekHeader calendarGridWithSummary">
                  {weekDays.map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                  <div>SEMANA</div>
                </div>

                <div className="calendarGrid calendarGridWithSummary">
                  {teamCalendarWeeks.map((week) => (
                    <Fragment key={week[0].toISOString()}>
                      {week.map((day) => {
                        const isCurrentMonth =
                          day.getMonth() === calendarMonth.getMonth();

                        const isToday = sameDay(day, new Date());

                        const dayEvents = visibleTeamEvents.filter(
                          (event) => sameDay(event.date, day)
                        );

                        return (
                          <div
                            key={day.toISOString()}
                            className={`calendarDay ${
                              !isCurrentMonth ? "outsideMonth" : ""
                            }`}
                          >
                            <div className="calendarDayNumber">
                              <span className={isToday ? "todayNumber" : ""}>
                                {day.getDate()}
                              </span>
                            </div>

                            <div className="calendarEvents">
                              {dayEvents.map((event) => {
                                const deliveryType = classifyDate(day);

                                return (
                                  <button
                                    key={`${event.stage}-${rowKey(event.row)}`}
                                    className={`calendarEvent ${
                                      event.delivered
                                        ? "calendarEventDelivered"
                                        : deliveryType === "backlog"
                                        ? "calendarEventBacklog"
                                        : deliveryType === "pending"
                                        ? "calendarEventPending"
                                        : "calendarEventFuture"
                                    } ${
                                      !event.delivered && !event.member
                                        ? "calendarEventUnassigned"
                                        : ""
                                    }`}
                                    title={`${stageLabel(event.stage)} · ${
                                      event.row["CLIENTE"] || "Sin cliente"
                                    }`}
                                    onClick={() =>
                                      openTeamCase(event.row, event.stage)
                                    }
                                  >
                                    <strong>
                                      <b className="teamStageTag">
                                        {teamStageShortLabel[event.stage]}
                                      </b>
                                      {event.row["CLIENTE"] || "Sin cliente"}
                                    </strong>

                                    {event.delivered ? (
                                      <span className="deliveredEventLabel">
                                        ✓ Entregado
                                      </span>
                                    ) : !event.member ? (
                                      <span className="unassignedEventLabel">
                                        Sin asignar
                                      </span>
                                    ) : showTeamEventMember ? (
                                      <span>{event.member}</span>
                                    ) : event.status ? (
                                      <span>{event.status}</span>
                                    ) : null}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {renderTeamWeekSummary(week)}
                    </Fragment>
                  ))}
                </div>
              </section>
            )}

            {teamViewMode === "table" && (
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
                        {teamMemberLabel}
                      </p>

                      <h2>Entregas</h2>

                      <span>{teamTableEvents.length} resultados</span>
                    </div>

                    <select
                      className="teamWeekFilter"
                      value={teamTableWeek}
                      onChange={(e) => setTeamTableWeek(e.target.value)}
                      aria-label="Semana de entrega"
                    >
                      <option value="todas">Todas las semanas</option>
                      {teamTableWeeks.map((week) => (
                        <option key={week.key} value={week.key}>
                          {week.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="teamTableHeader">
                    <div>CLIENTE</div>
                    <div>TIPO</div>
                    <div>EXPECTED DONE</div>
                    <div>SEMANA DE ENTREGA</div>
                    <div>STATUS</div>
                    <div>ESTADO</div>
                    <div />
                  </div>

                  <div className="teamTableBody">
                    {teamTableEvents.map((event) => {
                      const deliveryState = classifyDate(event.date);

                      return (
                        <button
                          key={`${event.stage}-${rowKey(event.row)}`}
                          className="teamTableRow"
                          onClick={() =>
                            openTeamCase(event.row, event.stage)
                          }
                        >
                          <div className="teamTableClient">
                            <div className="clientAvatar">
                              {(event.row["CLIENTE"] || "?")
                                .charAt(0)
                                .toUpperCase()}
                            </div>

                            <div>
                              <strong>
                                {event.row["CLIENTE"] || "Sin cliente"}
                              </strong>

                              <span>ID {event.row["ID"] || "—"}</span>
                            </div>
                          </div>

                          <div className="teamTableValue">
                            <b className="teamStageTag">
                              {teamStageShortLabel[event.stage]}
                            </b>

                            {showTeamEventMember &&
                              (event.member ? (
                                event.member
                              ) : (
                                <span className="unassignedPill">
                                  Sin asignar
                                </span>
                              ))}
                          </div>

                          <div className="teamTableValue teamDateValue">
                            {formatDate(
                              event.row[calendarDateHeader(event.stage)] ||
                                ""
                            )}
                          </div>

                          <div className="teamTableValue teamWeekValue">
                            {getDeliveryWeekLabel(event.date)}
                          </div>

                          <div>
                            {event.status ? (
                              <span className={statusClass(event.status)}>
                                {event.status}
                              </span>
                            ) : (
                              <span className="tableDash">—</span>
                            )}
                          </div>

                          <div>
                            <span
                              className={`deliveryState ${
                                event.delivered
                                  ? "deliveryDelivered"
                                  : deliveryState === "backlog"
                                  ? "deliveryBacklog"
                                  : deliveryState === "pending"
                                  ? "deliveryPending"
                                  : "deliveryFuture"
                              }`}
                            >
                              {event.delivered
                                ? "Entregado"
                                : deliveryState === "backlog"
                                ? "Backlog"
                                : deliveryState === "pending"
                                ? "Esta semana"
                                : "Próxima"}
                            </span>
                          </div>

                          <div className="rowArrow">›</div>
                        </button>
                      );
                    })}

                    {!teamTableEvents.length && (
                      <div className="emptyState">
                        No hay entregas con este filtro.
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
                  {isCurrentAccountabilityWeek && (
                    <span className="accountabilityRunningTag"> · en curso</span>
                  )}
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

        {mainView === "nwgeneral" && (
          <>
            <header className="pageHeader">
              <div>
                <p className="eyebrow">NW GENERAL</p>
                <h1>NW General</h1>
                <p>
                  Calendarios de casos por deadline del recibo y deadline interno.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={loadNwGeneral}
              >
                ↻ Refresh
              </button>
            </header>

            {nwMsg && (
              <div className="floatingMessage">✓ {nwMsg}</div>
            )}

            {nwErr && (
              <div className="errorBanner">{nwErr}</div>
            )}

            <div className="teamStageTabs">
              <button
                className={
                  nwCalendarKind === "due"
                    ? "stageTab active"
                    : "stageTab"
                }
                onClick={() => setNwCalendarKind("due")}
              >
                Deadline del Recibo
              </button>

              <button
                className={
                  nwCalendarKind === "interno"
                    ? "stageTab active"
                    : "stageTab"
                }
                onClick={() => setNwCalendarKind("interno")}
              >
                Deadline Interno
              </button>
            </div>

            <div className="teamViewToolbar">
              <div className="collaboratorFilterBox">
                <span className="filterIcon">◎</span>

                <div className="collaboratorFilterText">
                  <span>PL ASSIGNED</span>

                  <select
                    value={nwPlFilter}
                    onChange={(e) =>
                      setNwPlFilter(e.target.value)
                    }
                  >
                    <option value="">Todos</option>
                    <option value="__UNASSIGNED__">
                      Sin asignar
                    </option>

                    {NW_PL_ASSIGNED_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {nwLoading ? (
              <div className="emptyState">
                Cargando casos de NW GENERAL…
              </div>
            ) : (
              <section className="calendarCard">
                <div className="calendarToolbar">
                  <div className="calendarTitle">
                    <h2>
                      {monthNames[nwCalendarMonth.getMonth()]}{" "}
                      {nwCalendarMonth.getFullYear()}
                    </h2>

                    <span>
                      {nwCalendarKind === "revisioncs" ? (
                        <>
                          {
                            nwCalendarEvents.filter(
                              (event) => !event.completed
                            ).length
                          }{" "}
                          pendientes
                          {nwCalendarEvents.some(
                            (event) => event.completed
                          ) && (
                            <>
                              {" "}
                              ·{" "}
                              {
                                nwCalendarEvents.filter(
                                  (event) => event.completed
                                ).length
                              }{" "}
                              completadas
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {nwCalendarEvents.length} casos ·{" "}
                          {NW_DATE_FIELDS[nwCalendarKind].label}
                        </>
                      )}
                    </span>
                  </div>

                  <div className="calendarControls">
                    <button onClick={nwPreviousMonth}>‹</button>
                    <button
                      className="todayButton"
                      onClick={nwGoToday}
                    >
                      Hoy
                    </button>
                    <button onClick={nwNextMonth}>›</button>
                  </div>
                </div>

                <div className="calendarWeekHeader">
                  {weekDays.map((day) => (
                    <div key={day}>{day}</div>
                  ))}
                </div>

                <div className="calendarGrid">
                  {nwCalendarDays.map((day) => {
                    const isCurrentMonth =
                      day.getMonth() === nwCalendarMonth.getMonth();
                    const isToday = sameDay(day, new Date());
                    const dayEvents = nwCalendarEvents.filter((event) =>
                      sameDay(event.date, day)
                    );

                    return (
                      <div
                        key={day.toISOString()}
                        className={`calendarDay ${
                          !isCurrentMonth ? "outsideMonth" : ""
                        }`}
                      >
                        <div className="calendarDayNumber">
                          <span className={isToday ? "todayNumber" : ""}>
                            {day.getDate()}
                          </span>
                        </div>

                        <div className="calendarEvents">
                          {dayEvents.map(({ row, completed }) => {
                            const status = row[NW_STATUS_HEADER] || "";
                            const deliveryType = classifyDate(day);

                            return (
                              <button
                                key={rowKey(row)}
                                className={`calendarEvent ${
                                  completed
                                    ? "calendarEventDelivered"
                                    : deliveryType === "backlog"
                                    ? "calendarEventBacklog"
                                    : deliveryType === "pending"
                                    ? "calendarEventPending"
                                    : "calendarEventFuture"
                                }`}
                                onClick={() => setNwSelectedRow(row)}
                              >
                                <strong>
                                  {row[NW_CLIENT_HEADER] || "Sin cliente"}
                                </strong>

                                {completed ? (
                                  <span className="deliveredEventLabel">
                                    ✓ Completada
                                  </span>
                                ) : status ? (
                                  <span>{status}</span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {mainView === "cs" && (
          <>
            <header className="pageHeader">
              <div>
                <p className="eyebrow">CASE STRATEGY</p>
                <h1>CS</h1>
                <p>
                  Las tres revisiones de Case Strategy (llenado de
                  carátula, post DCL y final review) de VAWA, más las
                  de NON-VAWA. A la derecha, cuántas hay por semana y de
                  quién.
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={() => {
                  loadCases();
                  loadNwGeneral();
                }}
              >
                ↻ Refresh
              </button>
            </header>

            <section className="calendarCard">
              <div className="calendarToolbar">
                <div className="calendarTitle">
                  <h2>
                    {monthNames[csCalendarMonth.getMonth()]}{" "}
                    {csCalendarMonth.getFullYear()}
                  </h2>

                  <span>
                    {
                      csCalendarEvents.filter(
                        (event) => !event.completed
                      ).length
                    }{" "}
                    pendientes
                    {csCalendarEvents.some(
                      (event) => event.completed
                    ) && (
                      <>
                        {" "}
                        ·{" "}
                        {
                          csCalendarEvents.filter(
                            (event) => event.completed
                          ).length
                        }{" "}
                        completadas
                      </>
                    )}
                  </span>
                </div>

                <div className="calendarControls">
                  <button onClick={csPreviousMonth}>‹</button>
                  <button
                    className="todayButton"
                    onClick={csGoToday}
                  >
                    Hoy
                  </button>
                  <button onClick={csNextMonth}>›</button>
                </div>
              </div>

              <div className="calendarWeekHeader calendarGridWithSummary">
                {weekDays.map((day) => (
                  <div key={day}>{day}</div>
                ))}
                <div>SEMANA</div>
              </div>

              <div className="calendarGrid calendarGridWithSummary">
                {Array.from(
                  { length: Math.ceil(csCalendarDays.length / 7) },
                  (_, w) => csCalendarDays.slice(w * 7, w * 7 + 7)
                ).map((week) => (
                  <Fragment key={week[0].toISOString()}>
                    {week.map((day) => {
                      const isCurrentMonth =
                        day.getMonth() ===
                        csCalendarMonth.getMonth();
                      const isToday = sameDay(day, new Date());
                      const dayEvents = csCalendarEvents.filter(
                        (event) => sameDay(event.date, day)
                      );

                      return (
                        <div
                          key={day.toISOString()}
                          className={`calendarDay ${
                            !isCurrentMonth ? "outsideMonth" : ""
                          }`}
                        >
                          <div className="calendarDayNumber">
                            <span
                              className={
                                isToday ? "todayNumber" : ""
                              }
                            >
                              {day.getDate()}
                            </span>
                          </div>

                          <div className="calendarEvents">
                            {dayEvents.map((event) => (
                              <button
                                key={`${event.origin}-${event.kind}-${rowKey(event.row)}`}
                                className={`calendarEvent ${
                                  event.completed
                                    ? "calendarEventDelivered"
                                    : event.origin === "vawa"
                                    ? "calendarEventVawa"
                                    : "calendarEventNonVawa"
                                }`}
                                title={`${CS_KIND_LABEL[event.kind || "nonvawa"]} · ${event.client}`}
                                onClick={() =>
                                  openCsEvent(event)
                                }
                              >
                                <strong>
                                  <b className="teamStageTag">
                                    {CS_KIND_LABEL[event.kind || "nonvawa"]}
                                  </b>
                                  {event.client}
                                </strong>

                                {event.completed ? (
                                  <span className="deliveredEventLabel">
                                    ✓ Completada
                                  </span>
                                ) : (
                                  <span>
                                    {event.member}
                                    {isGeneral && event.row.__celula
                                      ? ` · ${vistaLabel(event.row.__celula as Celula)}`
                                      : ""}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {renderCsWeekSummary(week)}
                  </Fragment>
                ))}
              </div>
            </section>

            {renderInitialReview()}
          </>
        )}

        {mainView === "mgmreview" && (
          <>
            <header className="pageHeader">
              <div>
                <p className="eyebrow">MGM REVIEW</p>
                <h1>MGM Review</h1>
                <p>
                  Calendario unificado de metas MGM Review
                  (VAWA) y entregas por Deadline Interno
                  (NON-VAWA).
                </p>
              </div>

              <button
                className="refreshButton"
                onClick={() => {
                  loadCases();
                  loadNwGeneral();
                }}
              >
                ↻ Refresh
              </button>
            </header>

            <section className="calendarCard">
              <div className="calendarToolbar">
                <div className="calendarTitle">
                  <h2>
                    {
                      monthNames[
                        mgmReviewCalendarMonth.getMonth()
                      ]
                    }{" "}
                    {mgmReviewCalendarMonth.getFullYear()}
                  </h2>

                  <span>
                    {
                      mgmReviewCalendarEvents.filter(
                        (event) => !event.completed
                      ).length
                    }{" "}
                    pendientes
                    {mgmReviewCalendarEvents.some(
                      (event) => event.completed
                    ) && (
                      <>
                        {" "}
                        ·{" "}
                        {
                          mgmReviewCalendarEvents.filter(
                            (event) => event.completed
                          ).length
                        }{" "}
                        completadas
                      </>
                    )}
                  </span>
                </div>

                <div className="calendarControls">
                  <button onClick={mgmReviewPreviousMonth}>
                    ‹
                  </button>
                  <button
                    className="todayButton"
                    onClick={mgmReviewGoToday}
                  >
                    Hoy
                  </button>
                  <button onClick={mgmReviewNextMonth}>
                    ›
                  </button>
                </div>
              </div>

              <div className="calendarWeekHeader">
                {weekDays.map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="calendarGrid">
                {mgmReviewCalendarDays.map((day) => {
                  const isCurrentMonth =
                    day.getMonth() ===
                    mgmReviewCalendarMonth.getMonth();
                  const isToday = sameDay(day, new Date());
                  const dayEvents =
                    mgmReviewCalendarEvents.filter(
                      (event) => sameDay(event.date, day)
                    );

                  return (
                    <div
                      key={day.toISOString()}
                      className={`calendarDay ${
                        !isCurrentMonth ? "outsideMonth" : ""
                      }`}
                    >
                      <div className="calendarDayNumber">
                        <span
                          className={
                            isToday ? "todayNumber" : ""
                          }
                        >
                          {day.getDate()}
                        </span>
                      </div>

                      <div className="calendarEvents">
                        {dayEvents.map((event) => {
                          return (
                            <button
                              key={`${event.origin}-${rowKey(event.row)}`}
                              className={`calendarEvent ${
                                event.completed
                                  ? "calendarEventDelivered"
                                  : event.origin === "vawa"
                                  ? "calendarEventVawa"
                                  : "calendarEventNonVawa"
                              }`}
                              onClick={() =>
                                openMgmReviewEvent(event)
                              }
                            >
                              <strong>{event.client}</strong>

                              {event.completed ? (
                                <span className="deliveredEventLabel">
                                  ✓ Entregado
                                </span>
                              ) : (
                                <span>
                                  {event.origin === "vawa"
                                    ? isGeneral && event.row.__celula
                                      ? `VAWA · ${vistaLabel(event.row.__celula as Celula)}`
                                      : "VAWA"
                                    : "NON-VAWA"}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
                    : selectedKpi.type ===
                      "delivered"
                    ? "Entregado"
                    : selectedKpi.type === "special"
                    ? "Special case / Unresponsive"
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
                    key={rowKey(row)}
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

      {nwSelectedRow && (
        <div
          className="modalOverlay"
          onMouseDown={() => setNwSelectedRow(null)}
        >
          <div
            className="caseModal stageOnlyModal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <p className="eyebrow">NW GENERAL</p>

                <h2>
                  {nwSelectedRow[NW_CLIENT_HEADER] || "Sin cliente"}
                </h2>

                <div className="caseMeta">
                  <span>
                    {NW_DATE_FIELDS[nwCalendarKind].label}
                  </span>
                </div>
              </div>

              <button
                className="closeButton"
                onClick={() => setNwSelectedRow(null)}
              >
                ×
              </button>
            </div>

            <div className="modalBody">
              <div className="fieldGrid">
                {(nwCalendarKind === "revisioncs"
                  ? NW_REVISIONCS_DISPLAY_FIELDS
                  : nwData.headers
                ).map((header) => {
                  const value = nwSelectedRow[header] || "";
                  const normHeader = norm(header);
                  const isStatus = normHeader === norm(NW_STATUS_HEADER);
                  const isLink = normHeader === norm(NW_LINK_HEADER);
                  const isRequirements =
                    normHeader === norm(NW_REQUIREMENT_HEADER);
                  const isPlAssigned =
                    normHeader === norm(NW_PL_ASSIGNED_HEADER);
                  const isDateInput = NW_DATE_INPUT_FIELDS.some(
                    (h) => norm(h) === normHeader
                  );
                  const isTextarea = NW_TEXTAREA_FIELDS.some(
                    (h) => norm(h) === normHeader
                  );
                  const isReassignment = NW_REASSIGNMENT_FIELDS.some(
                    (h) => norm(h) === normHeader
                  );
                  const editableFieldsForKind =
                    nwCalendarKind === "interno"
                      ? NW_EDITABLE_FIELDS
                      : nwCalendarKind === "revisioncs"
                      ? NW_REVISIONCS_EDITABLE_FIELDS
                      : [];
                  const editable =
                    role !== "MANAGER" &&
                    role !== "COORDINATOR" &&
                    role !== "CS" &&
                    editableFieldsForKind.some(
                      (h) => norm(h) === normHeader
                    ) &&
                    (!isReassignment ||
                      role === "ADMIN" ||
                      role === "TL");
                  const selectedRequirements = value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);

                  return (
                    <div className="detailField" key={header}>
                      <label>{header}</label>

                      {isLink && value ? (
                        <a
                          className="readValue"
                          href={value}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {value}
                        </a>
                      ) : !editable ? (
                        <div className="readValue">
                          {value || "—"}
                        </div>
                      ) : isStatus ? (
                        <select
                          defaultValue={value}
                          onChange={(e) =>
                            saveNwField(
                              Number(nwSelectedRow.__row),
                              header,
                              e.target.value
                            )
                          }
                        >
                          <option value="">—</option>
                          {NW_STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : isPlAssigned ? (
                        <select
                          defaultValue={value}
                          onChange={(e) =>
                            saveNwField(
                              Number(nwSelectedRow.__row),
                              header,
                              e.target.value
                            )
                          }
                        >
                          <option value="">—</option>
                          {NW_PL_ASSIGNED_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : isRequirements ? (
                        <div
                          className="teamStageTabs"
                          style={{ flexWrap: "wrap" }}
                        >
                          {NW_REQUIREMENT_OPTIONS.map((opt) => {
                            const active =
                              selectedRequirements.includes(opt);

                            return (
                              <button
                                key={opt}
                                type="button"
                                className={
                                  active ? "stageTab active" : "stageTab"
                                }
                                onClick={() => {
                                  const next = active
                                    ? selectedRequirements.filter(
                                        (s) => s !== opt
                                      )
                                    : [...selectedRequirements, opt];

                                  saveNwField(
                                    Number(nwSelectedRow.__row),
                                    header,
                                    next.join(", ")
                                  );
                                }}
                              >
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                      ) : isDateInput ? (
                        <input
                          type="date"
                          defaultValue={toInputDate(value)}
                          onChange={(e) =>
                            saveNwField(
                              Number(nwSelectedRow.__row),
                              header,
                              e.target.value
                            )
                          }
                        />
                      ) : isTextarea ? (
                        <textarea
                          defaultValue={value}
                          onBlur={(e) => {
                            if (e.target.value !== value) {
                              saveNwField(
                                Number(nwSelectedRow.__row),
                                header,
                                e.target.value
                              );
                            }
                          }}
                        />
                      ) : (
                        <input
                          defaultValue={value}
                          onBlur={(e) => {
                            if (e.target.value !== value) {
                              saveNwField(
                                Number(nwSelectedRow.__row),
                                header,
                                e.target.value
                              );
                            }
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
                <div className="teamViewSwitch caseViewSwitch">
                  <button
                    className={
                      caseModalView === "detail"
                        ? "teamViewButton active"
                        : "teamViewButton"
                    }
                    onClick={() => setCaseModalView("detail")}
                  >
                    <span>≡</span>
                    Detalle
                  </button>

                  <button
                    className={
                      caseModalView === "calendar"
                        ? "teamViewButton active"
                        : "teamViewButton"
                    }
                    onClick={openCaseCalendar}
                  >
                    <span>▦</span>
                    Calendario
                  </button>
                </div>

                {caseModalView === "calendar" ? (
                  renderCaseCalendar()
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
