import { randomUUID } from "crypto";
import { redis } from "@/lib/rfe/store";
import { USER_NAMES, type Role } from "@/lib/auth";
import type { Celula } from "@/lib/celulas";

/*
 * Estudio de tiempos dentro del hub (Alpha y Gamma). Mismas
 * reglas que la app de estudio de tiempos: hoy o ayer para
 * colaboradores, sin traslapes, confirmación arriba de 4 h, un
 * solo cronómetro corriendo. Cada registro va en un campo del
 * hash, así dos personas guardando a la vez no se pisan.
 */
const KEY = "hub:tiempos-v1";

export type Puesto =
  | "analista"
  | "paralegal"
  | "psych"
  // GMC (Gov Branch)
  | "gb"
  | "gb_sup"
  | "sr"
  | "sr_sup"
  | "ea"
  | "gmc_tl";

export const PUESTO_LABELS: Record<Puesto, string> = {
  analista: "Analista",
  paralegal: "Paralegal",
  psych: "Psych",
  gb: "GB",
  gb_sup: "Supervisor GB",
  sr: "Special Reports",
  sr_sup: "Supervisor SR",
  ea: "Evidence Analyst",
  gmc_tl: "TL GMC",
};

export const GMC_PUESTOS: Puesto[] = ["gb", "gb_sup", "sr", "sr_sup", "ea", "gmc_tl"];

// Alpha, Gamma o GMC: dónde se registró el tiempo.
export type TiemposCelula = Celula | "gmc";

/*
 * Puesto de cada persona de GMC (no sale del rol del hub).
 * Falta completar con el equipo.
 */
export const GMC_PUESTO_POR_EMAIL: Record<string, Puesto> = {
  "gsanchez@supportmendoza.com": "gmc_tl",
};

export const PUESTO_POR_ROL: Partial<Record<Role, Puesto>> = {
  ANALYST: "analista",
  PARALEGAL: "paralegal",
  PSYCH: "psych",
};

// Analistas indican si el tiempo es para la DCL o la CVL.
export const KPIS_ANALISTA = ["DCL", "CVL"];

export type Grupo = {
  categoria: string;
  actividades: string[];
  // Grupo con numeración propia (p. ej. "RS-1") y solo para ciertas células.
  codigo?: string;
  celulas?: Celula[];
  // Número fijo de cada actividad (GMC: el del PDF, 1–65) y su descripción.
  numeros?: number[];
  descripciones?: string[];
};

const POST_CLIENTE = "Post entrega · debido al cliente";
const POST_ERROR = "Post entrega · error del colaborador";

// Tareas del PDF "TASKS" (Downloads, oct 2026).
// Los puestos de GMC se llenan más abajo.
export const CATALOGO = {
  analista: [
    {
      categoria: "Proceso",
      actividades: [
        "Revisión de declaración inicial",
        "Análisis de Dropbox, CRM, carátula",
        "Lectura de DOE Psych",
        "Lectura de AFF Paralegal",
        "Ejecución de Draft declaración a través de CRM",
        "Edición de declaración, incorporación de imágenes",
        "Envío de notas de solicitud complementaria por falta de información",
        "Actualización de DCL por información nueva del cliente",
        "Revisión de testimonios",
        "Ejecución de Draft de testimonios a través de CRM",
        "Edición de testimonios",
        "Llenado de Carátula y validación de entregable",
        "Atención de feedback de Case Strategist",
        "Revisión de Psych Evaluation",
        "Revisión de otros reportes especiales",
        "Revisión correcciones de reportes especiales",
        "Búsqueda de precedentes y registro",
        "Elaboración de Cover Letter",
        "Traducción de Declaración y testimonios",
      ],
    },
    {
      categoria: POST_CLIENTE,
      actividades: [
        "Actualización de DCL por reportes especiales",
        "Actualización de DCL por información nueva del cliente (post entrega)",
        "Actualización de DCL por evidencia documental recibida",
        "Actualización de CVL por cambios en paquete",
        "Actualización de CVL por reportes especiales",
        "Homologación de traducciones por actualización",
        "Actualización de carátula",
      ],
    },
    {
      categoria: POST_ERROR,
      actividades: [
        "Atención de feedback DCL por parte de management",
        "Atención de feedback CVL por parte de management",
        "Actualización de DCL por cambios en Case Review",
        "Actualización de CVL por cambios en Case Review",
        "Atención de feedback DCL por parte de Atty",
        "Atención de feedback CVL por parte de Atty",
      ],
    },
  ],
  psych: [
    {
      categoria: "Proceso",
      actividades: [
        "Revisión de declaración inicial",
        "Revisión de Dropbox, CRM",
        "Primer contacto",
        "Llamada de exploración de abuso",
        "Búsqueda de evidencia externa",
        "Revisión de evidencia e información para complementar",
        "Análisis de estrategia con CS",
        "Llamada de seguimiento a evidencias y testimonios",
        "Llamada a testigos",
        "Llamada de seguimiento a testigo",
        "Llenado de carátula",
        "Procesamiento de DOE",
        "Procesamiento de Testimonios",
        "Edición de DOE",
        "Edición de Testimonios",
        "Atención de Feedback IA",
      ],
    },
    {
      categoria: POST_CLIENTE,
      actividades: [
        "Atención de Solicitud de información adicional",
        "Edición - Cliente comparte información de nuevos eventos",
        "Edición - Cliente comparte evidencia solicitada previamente",
        "Actualización de carátula",
        "Agenda de Case Review",
      ],
    },
    {
      categoria: POST_ERROR,
      actividades: [
        "Actualización por FB de CS",
        "Actualización por FB de Management",
        "Actualización por FB de Atty",
      ],
    },
  ],
  paralegal: [
    {
      categoria: "Proceso",
      actividades: [
        "Lectura y análisis de RFE/NOID",
        "Revisión de Filed Copy y paquetes enviados previamente",
        "Revisión de notas CRM",
        "Revisión de documentación disponible en Dropbox",
        "Identificación de inconsistencias entre RFE, formularios y Filed Copy",
        "Llenado básico de carátula",
        "Primer contacto con el cliente",
        "Explicación de RFE y deadline",
        "Validación de estrategia en carátula",
        "Identificación y escalación de incidencias con estrategia",
        "Seguimiento y registro de contactos",
        "Recepción y descarga de documentación del cliente",
        "Clasificación y organización de documentos en Dropbox",
        "Validación de evidencia contra requisitos del RFE",
        "Solicitud de documentos faltantes o correcciones al cliente",
        "Elaboración de Affidavit",
        "Actualización de Affidavit con información complementaria",
        "Llenado de formularios",
        "Validación de información en formularios",
        "Revisión de consistencia entre formularios y documentación",
        "Solicitud y seguimiento de traducciones",
        "Ensamble de Draft",
        "Registro y actualización de carátula",
        "Validación de entregable antes de mandar 1er Draft",
        "Entrega de Draft",
        "Revisión de feedback de Case Strategist",
        "Atención de correcciones",
        "Incorporación de evidencia documental adicional",
        "Corrección de inconsistencias identificadas durante revisión",
        "Reorganización de paquete por cambios de estrategia",
        "Actualización de carátula",
        "Atención de dudas del cliente",
        "Actualización feedback de Case Strategist",
        "Actualización feedback de Management",
        "Actualización feedback de Attorney",
        "Obtención de firmas en formularios y declaración",
        "Entrega paquete final",
      ],
    },
    {
      categoria: "Actividades complementarias",
      actividades: [
        "Seguimiento a clientes con documentación pendiente",
        "Seguimiento a clientes con firmas pendientes",
        "Gestión de documentos alternativos cuando no se consigue evidencia",
        "Actualización de CRM con información nueva",
        "Registro de intentos de contacto y respuestas del cliente",
        "Preparación y seguimiento de No Contact Letter y No Coop",
        "Revisión de evidencia recibida fuera de la fecha acordada",
        "Reprocesamiento de firmas por cambios en documentos",
        "Actualización de paquete por cambios en Case Review",
      ],
    },
  ],
} as Record<Puesto, Grupo[]>;

// "Otro" en los puestos de Alpha y Gamma: la actividad se escribe a mano.
export const OTRA_ACTIVIDAD = "Otro";
for (const puesto of ["analista", "paralegal", "psych"] as Puesto[]) {
  CATALOGO[puesto].push({ categoria: "Otro", actividades: [OTRA_ACTIVIDAD] });
}

// En GMC el equivalente es "Actividad extraordinaria".
export const ACTIVIDAD_EXTRAORDINARIA = "Actividad extraordinaria";
export const ACTIVIDADES_LIBRES = [OTRA_ACTIVIDAD, ACTIVIDAD_EXTRAORDINARIA];

/*
 * GMC: PDF "TIEMPOS INSTRUCCIONES" (Downloads, nov 2026). Cada
 * actividad lleva su número del PDF. [número, actividad, descripción]
 */
type Item = [number, string, string];
const G = (categoria: string, items: Item[]): Grupo => ({
  categoria,
  numeros: items.map((i) => i[0]),
  actividades: items.map((i) => i[1]),
  descripciones: items.map((i) => i[2]),
});
const EXTRA = "Solicitudes no ordinarias fuera de las actividades estandarizadas";
const TRAINING = "Capacitación interna sobre procesos, actualizaciones legales y manejo de casos.";
const REGISTROS = "Gestión y ejecución de revisión y validación de data administrativa referente a clientes, comunicaciones y tiempos.";
const TEAM_FU = "Planeación, coordinación, y ejecución de checkpoints de seguimiento con los colaboradores";
const PLAN_UP = "Planificación sobre entregas, clientes y temas operacionales y/o administrativos";
const INCIDENCE = "Revisión y apoyo activo a necesidades de colaboradores";
const OTHER_TEAMS = "Planeación, coordinación, y ejecución de reuniones con externos al equipo dentro de la firma para temas administrativos u operacionales";
const PREP_CALL = "Llamada de preparación al Long interview y TNR";

const GB_UNIVERSALES = G("Universales GB", [
  [1, "Case Study", "Análisis completo del historial del cliente para identificar riesgos, overdisclosure de información previo, y contexto."],
  [2, "Rap Sheet", "Envío y gestión del Public Safety Form y solicitud formal al FBI"],
  [3, "Third Party Prep. Call", PREP_CALL],
  [4, "Case Strategy Design", "Análisis integral del caso para definir narrativa, mitigación y enfoque legal."],
  [5, "Packet Update", "Actualización del paquete por correcciones, nueva evidencia o requerimientos adicionales."],
  [6, "Training", TRAINING],
  [7, "Registros", REGISTROS],
  [8, ACTIVIDAD_EXTRAORDINARIA, EXTRA],
]);
const GB_CORTES = G("Cortes", [
  [9, "Records Interview", "Entrevista con el cliente enfocada en identificar antecedentes sin registro, procesos previos y posibles inconsistencias contra evidencia (antes de la llamada oficial de affidavit, mientras se trabaja el caso)."],
  [10, "Authority Mapping", "Identificación de autoridades involucradas y localización de contactos"],
  [11, "Authority Contact", "Comunicación con autoridades para solicitar documentos oficiales."],
  [12, "Authority Document Review", "Revisión de documentos emitidos por autoridades incluidos background checks para detección de oportunidades y diseño de estrategia."],
  [13, "FOIA Results Review", "Análisis técnico de los resultados FOIA obtenidos para evaluar impacto en el caso"],
  [14, "Exhibit / Packet Assembly", "Organización y ensamble de documentos obtenidos"],
  [15, "Affidavit Call", "Llamada con el cliente para estructurar su declaración formal sobre historial legal."],
  [16, "Third Party Search", "Búsquedas y solicitudes a expertos no correspondientes a Special Reports."],
]);
const GB_REHAB = G("Rehab", [
  [17, "Forms Interview Call", "Llamada con el cliente para confirmar información necesaria para formularios."],
  [18, "Forms Preparation", "Llenado de formularios migratorios basado en información validada."],
  [19, "Rehabilitation Evidence Collection", "Gestión para obtener evidencia que demuestre rehabilitación o buen carácter moral."],
  [20, "Rehabilitation Packet Assembly", "Organización de la evidencia de rehabilitación en paquete formal."],
]);
const TL_UNIVERSALES = G("Universales TL / Supervisor", [
  [21, "Training", TRAINING],
  [22, "Sheet Management", "Manejo, modificación, creación, revisión, y supervisión de google sheets."],
  [23, "Status", "Compilación y distribución de status clientes en agenda"],
  [24, ACTIVIDAD_EXTRAORDINARIA, EXTRA],
]);
const GB_SUPERVISION = G("Supervisión GB", [
  [25, "Feedback", "Revisión de entregables con el fin de garantizar el cumplimiento de estrategias y estándares de calidad, además de comunicación sobre áreas de oportunidad."],
  [26, "Client Assignation", "Registro, asignación, y notificación sobre clientes nuevos."],
  [27, "Client Draft Management", "Manejo de clientes para draft"],
  [28, "Review", "Revisión a profundidad de casos con el fin de garantizar el cumplimiento de estándares de calidad y estrategia"],
  [29, "Revisión / Edición IA Doc", "Ensamble, submission, y revisión de resultados a detalle de los resultados proporcionados por IA con el fin de asegurar que el estudio del caso se llevó a cabo de manera óptima."],
  [30, "Team FU", TEAM_FU],
]);
const SR_UNIVERSALES = G("Universales SR", [
  [31, "Case Study", "Búsqueda y análisis completo de recibos, DCL, DOE, entre otro material necesario para la orden de special reports."],
  [32, "Third Party Search", "Localización, contacto, y cotización activa de proveedores."],
  [33, "Registros", REGISTROS],
  [34, "Amendment Review & Follow Up", "Revisión y seguimiento activo de correcciones solicitadas para reportes especiales."],
  [35, "FOIA Submission", "Envío formal del paquete FOIA."],
  [36, "FOIA Results Distribution", "Distribución de los resultados FOIA obtenidos."],
  [37, "Client Profiling", "Identificación de las características principales de cada caso y cliente, con el objetivo de determinar el tipo de caso, los servicios requeridos, las necesidades específicas y los tiempos de entrega correspondientes."],
  [38, "Collateral Info. Prep.", "Preparación y ensamble de paquetes de información para proveedores."],
  [39, "Scheduling", "Revisión y confirmación activa de agendas con proveedores y clientes"],
  [40, "Questionnaires", "Soporte/apoyo a los clientes que presentan dificultades con la tecnología para que puedan responder y enviar sus pruebas psicométricas a los proveedores que lo requieren"],
  [41, "Special Report Distribution", "Distribución de reportes especiales a los colaboradores relacionados con el cliente."],
  [42, "Info. Upload", "Subida y actualización activa de documentación relacionada con reportes especiales a CRM y DropBox"],
  [43, ACTIVIDAD_EXTRAORDINARIA, EXTRA],
]);
const SR_SUPERVISION = G("Supervisión SR", [
  [44, "CRM Translation Auditing", "Auditoría de traducciones generadas por CRM en el área"],
  [45, "Team FU", TEAM_FU],
  [46, "Plan Up", PLAN_UP],
  [47, "Colab. Incidence validation", INCIDENCE],
  [48, "Other teams communications", OTHER_TEAMS],
  [49, "Soft Accounting", "Revisión soft de gastos e invoicing por parte de proveedores"],
]);
const EA_TASKS = G("Evidence Analyst", [
  [50, "English Declaration Writing", "Redacción de affidavit en inglés de acuerdo a estándares"],
  [51, "Spanish Declaration Writing", "Validación y formato a traducción de affidavit"],
  [52, "Additional Information", "Obtención de información adicional para la correcta escritura de affidavits de acuerdo a la estrategia"],
  [53, "Feedback Resolution", "Valoración y atención a feedback"],
  [54, "Special Reports Review", "Revisión de reportes especiales en temas referentes a colateral e info básica"],
  [55, "Special Reports Aid", "Apoyo en tasks voluminosos al equipo de reportes especiales"],
  [56, "Third Party Prep. Call", PREP_CALL],
  [57, "Training", TRAINING],
  [58, "Registros", REGISTROS],
  [59, ACTIVIDAD_EXTRAORDINARIA, EXTRA],
]);
const TL_TASKS = G("TL", [
  [60, "Other teams communications", OTHER_TEAMS],
  [61, "Team Auditing", "Planeación, coordinación, y ejecución de auditorías para detectar áreas de oportunidad en el equipo y asegurar el correcto funcionamiento con respectivo feedback"],
  [62, "Plan Up", PLAN_UP],
  [63, "Client Final Handoff", "Preparación y entrega final de los clientes por los medios adecuados"],
  [64, "Key Solutions", "Investigación, desarrollo, revisión, y validación de nuevos métodos, estrategias, o potenciales third parties para una implementación uniforme a corto, mediano, y largo plazo."],
  [65, "Colab. Incidence validation", INCIDENCE],
]);

/*
 * Un puesto que junta varios grupos no repite una actividad con el
 * mismo nombre (p. ej. Training): se queda la primera.
 */
function juntar(...grupos: Grupo[]): Grupo[] {
  const seen = new Set<string>();
  return grupos
    .map((g) => {
      const keep = g.actividades.map((a) => !seen.has(a) && (seen.add(a), true));
      const pick = <T,>(list?: T[]) => list?.filter((_, i) => keep[i]);
      return {
        ...g,
        actividades: pick(g.actividades)!,
        numeros: pick(g.numeros),
        descripciones: pick(g.descripciones),
      };
    })
    .filter((g) => g.actividades.length);
}

CATALOGO.gb = juntar(GB_UNIVERSALES, GB_CORTES, GB_REHAB);
CATALOGO.gb_sup = juntar(GB_UNIVERSALES, GB_CORTES, GB_REHAB, TL_UNIVERSALES, GB_SUPERVISION);
CATALOGO.sr = juntar(SR_UNIVERSALES);
CATALOGO.sr_sup = juntar(SR_UNIVERSALES, TL_UNIVERSALES, SR_SUPERVISION);
CATALOGO.ea = juntar(EA_TASKS);
CATALOGO.gmc_tl = juntar(TL_UNIVERSALES, TL_TASKS, GB_SUPERVISION, SR_SUPERVISION);

// Actividades internas de GMC: el cliente es opcional ("INTERNO").
export const SIN_CLIENTE = new Set([
  "Training", "Registros", ACTIVIDAD_EXTRAORDINARIA, "Sheet Management", "Status", "Team FU",
  "Plan Up", "Colab. Incidence validation", "Other teams communications", "Soft Accounting",
  "CRM Translation Auditing", "Team Auditing", "Key Solutions", "Client Assignation",
]);

// Rap Sheet: actividades de paralegales solo en Gamma, numeradas RS-1…RS-5.
CATALOGO.paralegal.push({
  categoria: "Rap Sheet (RS)",
  codigo: "RS",
  celulas: ["gamma"],
  actividades: [
    "RS · Búsqueda de estatus de cliente",
    "RS · Llamada de seguimiento",
    "RS · Correo de seguimiento",
    "RS · Llamada/Correo seguimiento con proveedor",
    "RS · Carga de RS en CRM",
  ],
});

// Grupos que ve un puesto en una célula.
export function gruposPara(puesto: Puesto, celula?: TiemposCelula) {
  return CATALOGO[puesto].filter(
    (g) => !g.celulas || !celula || g.celulas.includes(celula as Celula)
  );
}

export function categoriaDe(puesto: Puesto, actividad: string, celula?: TiemposCelula) {
  return gruposPara(puesto, celula).find((g) => g.actividades.includes(actividad))?.categoria || null;
}

/*
 * Número de la actividad: 1, 2, 3… en orden del PDF; los grupos
 * con código llevan su propia numeración (RS-1, RS-2…).
 */
export function numeroDe(puesto: Puesto, actividad: string): string | number | null {
  let n = 0;
  for (const g of CATALOGO[puesto]) {
    const i = g.actividades.indexOf(actividad);
    if (g.numeros) {
      if (i >= 0) return g.numeros[i];
      continue;
    }
    if (g.codigo) {
      if (i >= 0) return `${g.codigo}-${i + 1}`;
      continue;
    }
    if (i >= 0) return n + i + 1;
    n += g.actividades.length;
  }
  return null;
}

export type Registro = {
  id: string;
  email: string;
  nombre: string;
  celula: TiemposCelula;
  puesto: Puesto;
  kpi: string; // DCL / CVL (analistas)
  categoria: string;
  actividad: string;
  cliente: string;
  inicio: string; // ISO
  fin: string | null; // null = cronómetro corriendo
  creado: string;
  prueba: boolean; // registrado por el Admin para probar
  // Cómo se registró; "editado" si después se cambiaron las horas a mano.
  modo?: "cronometro" | "manual";
  editado?: boolean;
  // Lo que escribieron cuando eligieron "Otro".
  otro?: string;
};

// Quién ve al equipo (sin registrar): Admin, Manager y Coordinadora
// todo; TL y CS su(s) célula(s).
export const TEAM_ROLES = ["ADMIN", "MANAGER", "COORDINATOR", "TL", "CS"];

export function teamScope(role: string, celulas: TiemposCelula[]): TiemposCelula[] | null {
  if (!TEAM_ROLES.includes(role)) return null;
  return ["ADMIN", "MANAGER", "COORDINATOR"].includes(role) ? null : celulas;
}

export const LONG_HOURS = 4;
export const MAX_DAYS_BACK = 1;

// Hora de la oficina (Ciudad de México, sin horario de verano).
export const TZ_OFFSET = "-06:00";

export function mxDate(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Date(d.getTime() - 6 * 3600000).toISOString().slice(0, 10);
}

export function mxTime(iso: string) {
  return new Date(new Date(iso).getTime() - 6 * 3600000).toISOString().slice(11, 16);
}

export function clock() {
  const now = new Date();
  const today = mxDate(now);
  const yesterday = mxDate(new Date(now.getTime() - 86400000));
  return { today, yesterday, now: mxTime(now.toISOString()), nowIso: now.toISOString() };
}

export const nameOf = (email: string) =>
  USER_NAMES[email] || email.split("@")[0].toUpperCase();

export async function listRegistros(): Promise<Registro[]> {
  const flat: string[] = (await redis(["HGETALL", KEY])) || [];
  const out: Registro[] = [];
  for (let i = 1; i < flat.length; i += 2) out.push(JSON.parse(flat[i]) as Registro);
  return out;
}

export async function getRegistro(id: string) {
  const raw = await redis(["HGET", KEY, id]);
  return raw ? (JSON.parse(raw) as Registro) : null;
}

export async function saveRegistro(r: Registro) {
  await redis(["HSET", KEY, r.id, JSON.stringify(r)]);
}

export async function deleteRegistro(id: string) {
  await redis(["HDEL", KEY, id]);
}

export const newId = () => randomUUID();

const minutes = (r: Pick<Registro, "inicio" | "fin">, nowIso = new Date().toISOString()) =>
  Math.max(0, Math.round((Date.parse(r.fin || nowIso) - Date.parse(r.inicio)) / 60000));

export { minutes };

// CSV con todo el histórico (para análisis aparte).
export function toCsv(rows: Registro[]) {
  const header = [
    "Cliente", "Colaborador", "Correo", "Célula", "Puesto", "KPI", "Categoría", "No. actividad", "Actividad", "Otro (descripción)",
    "Fecha", "Inicio", "Fin", "Duración (min)", "Semana (lunes)", "Modo", "Editado", "Prueba", "Registrado el", "ID",
  ];
  const monday = (date: string) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows
    .filter((r) => r.fin)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((r) =>
      [
        r.cliente, r.nombre, r.email, r.celula, PUESTO_LABELS[r.puesto], r.kpi, r.categoria,
        numeroDe(r.puesto, r.actividad) ?? "", r.actividad, r.otro || "",
        mxDate(r.inicio), mxTime(r.inicio), mxTime(r.fin!), minutes(r), monday(mxDate(r.inicio)),
        r.modo === "cronometro" ? "Cronómetro" : r.modo === "manual" ? "Manual" : "",
        r.editado ? "SÍ" : "", r.prueba ? "SÍ" : "", mxDate(r.creado) + " " + mxTime(r.creado), r.id,
      ].map(esc).join(",")
    );
  // BOM para que Excel abra bien los acentos.
  return "﻿" + [header.join(","), ...lines].join("\n");
}
