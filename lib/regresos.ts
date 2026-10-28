import type { Role } from "@/lib/auth";
import type { Celula } from "@/lib/celulas";

/*
 * Registro de regresos y actualizaciones del área RFE.
 *
 * - Regreso: alguien cometió un error y hay que corregirlo.
 *   Cuenta para el 80/20 de feedback (a quién va = quien lo
 *   corrige / quien lo cometió).
 * - Actualización: el cliente mandó información o documentos
 *   nuevos. No es un error de nadie.
 *
 * Este archivo lo usan el navegador y el servidor, así que no
 * importa nada del lado servidor.
 */

export type RegresoTipo = "regreso" | "actualizacion";

export type RegresoEstado = "pendiente" | "concretado";

export type Person = {
  id: string;
  name: string;
  email?: string;
  celula: Celula;
  active: boolean;
};

export type Regreso = {
  id: string;
  tipo: RegresoTipo;
  celula: Celula;
  cliente: string;
  clienteId?: string;
  receipt?: string;
  etapa: string;
  motivo: string;
  detalle: string;
  para: string; // Person.id
  de: string; // Person.id
  deEmail: string; // quien lo capturó en el hub
  enviado: string; // YYYY-MM-DD
  limite?: string; // YYYY-MM-DD
  estado: RegresoEstado;
  concretado?: string; // YYYY-MM-DD
  nota?: string;
  creado: string; // ISO
  actualizado: string; // ISO
};

export const TIPO_LABELS: Record<RegresoTipo, string> = {
  regreso: "Regreso",
  actualizacion: "Actualización",
};

export const ETAPAS = [
  "Carátula",
  "DOE / Psych",
  "1st Draft",
  "EA",
  "Esc. CVL",
  "CVL",
  "MGM Review",
  "Envío / Filing",
  "Otra",
];

export const MOTIVOS: Record<RegresoTipo, string[]> = {
  regreso: [
    "Dato incorrecto",
    "Documento faltante",
    "Evidencia incorrecta",
    "Redacción / argumento",
    "Formato",
    "Traducción",
    "Firma",
    "No siguió instrucción",
    "Otro",
  ],
  actualizacion: [
    "Documento nuevo del cliente",
    "Información nueva del cliente",
    "Corrección del cliente",
    "Cambio de estrategia",
    "Otro",
  ],
};

// Roles que ven todo (y el 80/20) de sus células.
const LEAD_ROLES = new Set<Role>([
  "ADMIN",
  "MANAGER",
  "COORDINATOR",
  "TL",
]);

export function isLead(role: Role) {
  return LEAD_ROLES.has(role);
}

export type Viewer = {
  email: string;
  personId: string | null;
  role: Role;
  celulas: Celula[];
};

export function canSee(viewer: Viewer, r: Regreso) {
  if (isLead(viewer.role) && viewer.celulas.includes(r.celula)) {
    return true;
  }
  return (
    r.deEmail === viewer.email ||
    (!!viewer.personId &&
      (r.para === viewer.personId || r.de === viewer.personId))
  );
}

// Concretar: quien lo debe, quien lo mandó o un lead.
export function canClose(viewer: Viewer, r: Regreso) {
  return canSee(viewer, r);
}

// Editar / borrar: quien lo mandó o un lead.
export function canEdit(viewer: Viewer, r: Regreso) {
  return (
    (isLead(viewer.role) && viewer.celulas.includes(r.celula)) ||
    (!!viewer.personId && r.de === viewer.personId) ||
    r.deEmail === viewer.email
  );
}

/*
 * Fecha de hoy en hora de México (el servidor corre en UTC).
 */
export function todayMx() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
  }).format(new Date());
}

export function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) /
      86_400_000
  );
}

export function isOverdue(r: Regreso, today = todayMx()) {
  return r.estado === "pendiente" && !!r.limite && r.limite < today;
}

/*
 * Pareto (80/20): ordena de mayor a menor y marca los
 * elementos que juntos llegan al 80% del total. El elemento
 * que cruza el 80% también cuenta como "vital".
 */
export type ParetoRow = {
  key: string;
  count: number;
  share: number;
  cumulative: number;
  vital: boolean;
};

export function pareto(counts: Map<string, number>): ParetoRow[] {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return [];
  let running = 0;
  let reached = false;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => {
      const vital = !reached;
      running += count;
      if (running / total >= 0.8) reached = true;
      return {
        key,
        count,
        share: count / total,
        cumulative: running / total,
        vital,
      };
    });
}
