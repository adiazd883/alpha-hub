/*
 * Dashboard RFE del área: mismas reglas que el dashboard
 * "Estatus General RFE" (repo dashboard-rfe-noid), leyendo
 * la misma Sheet general de RFE.
 *
 * Este archivo también lo usa el navegador: nada de
 * process.env aquí.
 */
export const TABS = {
  vawaDueDate: "RFE's I-360 duedate",
  vawaNoDueDate: "RFE's I-360 no duedate",
  otherForms: "RFE's (other forms)",
};

export const NOID_FAMILY = ["NOID", "NOID VISA T", "NOIR", "NOIR VISA T"];
export const RFE_FAMILY = ["RFE", "RFE VISA T"];
export const EXCLUDED_TYPES = ["DECISION"];

export const INVENTORY_STATUSES_VAWA = ["", "WORKING", "MGM REVIEW", "MGM DRAFT"];
export const INVENTORY_STATUSES_VAWA_NDD = ["", "WORKING", "MGM REVIEW", "MGM DRAFT"];

export const INVENTORY_STATUSES_OTHER = [
  "",
  "WORKING",
  "ASSIGNED",
  "WAITING MEDICAL EXAM",
  "WAITING SIGNATURES",
  "WAITING PASSPORT PHOTOS",
  "READY TO PRINT",
];

// Columnas de fecha usadas para la gráfica de llegadas semanales.
export const ARRIVAL_DATE_COLUMNS = {
  vawaDueDate: "DATE ON DROPBOX",
  vawaNoDueDate: "RFE Receipt",
  otherForms: "Date on Dropbox",
};

export const ARRIVALS_MIN_WEEK = 30;
export const ARRIVALS_YEAR = 2026;

export const RFE_CATEGORIES = [
  "vawaDD",
  "vawaNDD",
  "visaT",
  "otherForms",
] as const;

export type RfeCategory = (typeof RFE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<RfeCategory, string> = {
  vawaDD: "VAWA con deadline",
  vawaNDD: "VAWA sin deadline",
  visaT: "VISA T",
  otherForms: "Other forms",
};
