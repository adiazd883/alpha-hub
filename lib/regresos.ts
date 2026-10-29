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

// Actualización: qué trajo el cliente que antes no se tenía.
export type ActualizacionOrigen = "informacion" | "documento";

export const ORIGEN_LABELS: Record<ActualizacionOrigen, string> = {
  informacion: "Recordó información",
  documento: "Consiguió un documento",
};

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
  origen?: ActualizacionOrigen; // solo actualizaciones
  area?: Area;
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

/*
 * Qué se pide, agrupado por rol. Tomado de "Regresos de
 * analista a PSYCHS Y PLGS más frecuentes" (regresos) y del
 * "Reporte de regresos - Info adicional VAWA" (actualizaciones).
 */
export type MotivoGrupo = {
  grupo: string;
  motivos: { label: string; hint: string }[];
};

// A quién le toca: un regreso puede ir a paralegal, a psych o a ambos.
export type Area = "paralegal" | "psych";

export const AREA_LABELS: Record<Area, string> = {
  paralegal: "Paralegal",
  psych: "Psych",
};

const OTRO: MotivoGrupo = {
  grupo: "Otro",
  motivos: [{ label: "Otro", hint: "Explícalo en el detalle." }],
};

const GRUPOS_POR_TIPO: Record<RegresoTipo, MotivoGrupo[]> = {
  regreso: [
    {
      grupo: "Paralegal",
      motivos: [
        { label: "Direcciones incompletas", hint: "Lista completa de domicilios con periodos." },
        { label: "Faltan integrantes familiares en direcciones", hint: "Quiénes vivían en cada dirección." },
        { label: "Huecos en la cronología de domicilios", hint: "Mudanzas, deportaciones, viajes, separaciones, shared residence intermitente." },
        { label: "Faltan dinámicas familiares en las direcciones", hint: "Contexto y descripciones exteriores e interiores, no solo dirección y fecha." },
        { label: "Discrepancias de direcciones", hint: "Info Affidavit vs. draft de formularios, licencias, taxes; correspondencia o PO Boxes." },
        { label: "Evidencia sin estatus ni explicación", hint: "Qué está en mano vs. solo solicitado, y por qué no existe un documento." },
        { label: "Falta dinámica financiera", hint: "Renta/mortgage, servicios, cuentas conjuntas, seguros, beneficiarios, propiedades." },
        { label: "Good faith marriage", hint: "Cómo se conocieron, el abuser en el noviazgo, por qué se casaron." },
        { label: "Taxes inconsistentes", hint: "Estatus que no coincide con el estado civil, quién los preparó, desde qué año juntos." },
        { label: "Estado civil y matrimonios previos", hint: "Matrimonios previos, divorcios, actas de inexistencia de cliente y abuser." },
        { label: "Historial migratorio incompleto", hint: "Detenciones, deportaciones y salidas vs. periodos de convivencia." },
        { label: "Atribución de registros", hint: "Quién usa cada teléfono o correo, homónimos en background reports, rol en empresas." },
      ],
    },
    {
      grupo: "Paralegal · general",
      motivos: [
        { label: "Acomodo de documentos", hint: "Un requisito de elegibilidad por exhibit; no mezclar Q Relationship con residence o bona fide." },
        { label: "Calidad de documentos", hint: "Documentos borrosos, incompletos o fotos de mala calidad." },
        { label: "Contradicciones en documentos", hint: "Fuera del periodo, no a nombre del cliente o abuser, direcciones que no están en la declaración." },
        { label: "Carátula y notas en CRM", hint: "Esfuerzos para obtener evidencia y motivos de llamadas registrados." },
        { label: "Formas", hint: "Errores de typo y contradicciones en el llenado." },
      ],
    },
    {
      grupo: "Psych",
      motivos: [
        { label: "Fotos sin fecha ni autor", hint: "Quién tomó la foto, cuándo, qué se ve; fechas que no cuadran." },
        { label: "Incidentes sin fecha", hint: "Fecha aproximada y orden de los incidentes." },
        { label: "Contradicciones entre versiones", hint: "Declaración presentada, DOE, reporte psicológico, info nueva y testigos." },
        { label: "Faltan detalles de los incidentes", hint: "Lesiones, objeto, lugar exacto, quién estuvo presente, secuencia." },
        { label: "Atención médica y denuncia", hint: "Por qué no fue al médico ni denunció; diagnóstico y records." },
        { label: "Amenazas migratorias incompletas", hint: "Palabras textuales, fecha, evento vinculado y efecto en el cliente." },
        { label: "Abuso económico sin cifras claras", hint: "Montos, frecuencia, si autorizó y si paga por miedo o por ayuda." },
        { label: "Origen de la información", hint: "Si lo vio, se lo contaron, lo encontró o solo lo sospecha." },
        { label: "Errores en declaraciones de testigos", hint: "Fechas imposibles, hechos de oídas, periodos que contradicen al cliente." },
        { label: "Vigencia del abuso", hint: "Última amenaza o agresión, acceso a armas, si siguen juntos." },
        { label: "Omisiones sin explicación clínica", hint: "Por qué omitió hechos en la primera declaración o negó daños." },
        { label: "Consecuencias de abuso", hint: "Consecuencias en pasado que no se ligan a una consecuencia continua." },
        { label: "Falta de investigación", hint: "Lo que USCIS acepta (reciprocity, divorcios, no matrimonio) para CVLs." },
      ],
    },
  ],
  actualizacion: [
    {
      grupo: "Paralegal",
      motivos: [
        { label: "Historial de domicilios / shared residence", hint: "Domicilios con periodos, quién vivía ahí, orden de mudanzas y huecos." },
        { label: "Discrepancias de dirección vs. formularios y documentos", hint: "I-360/I-485, licencia, taxes, background report; \"hasta el presente\"; PO Boxes." },
        { label: "Evidencia: qué se tiene y qué falta", hint: "Obtenido vs. solicitado; por qué no existe un documento y qué se intentó." },
        { label: "Dinámica financiera y obligaciones conjuntas", hint: "Renta/mortgage, servicios, cuentas conjuntas, seguros, tarjetas, propiedades." },
        { label: "Fotos y evidencia: fecha, autor y contenido", hint: "Quién tomó la foto, cuándo y qué se ve." },
        { label: "Declaraciones de impuestos inconsistentes", hint: "Estatus por año, quién la preparó, transcripts del IRS." },
        { label: "Estado civil y matrimonios previos", hint: "Matrimonios previos y cómo terminaron; actas de inexistencia." },
        { label: "Atribución de registros a la persona correcta", hint: "Teléfonos, correos, homónimos (DOB/SSN), rol en empresas." },
        { label: "Historial migratorio, salidas y detenciones", hint: "Fechas de detención, liberación, deportación y salidas del país." },
      ],
    },
    {
      grupo: "Psych",
      motivos: [
        { label: "Cronología de los incidentes de abuso", hint: "Fecha aproximada y orden; frente a la boda, los 21 años del hijo(a) o la convivencia." },
        { label: "Contradicciones entre versiones", hint: "Declaración presentada, DOE, reporte, info nueva y testigos." },
        { label: "Detalles concretos del incidente", hint: "Lesiones, objeto, lugar, presentes vs. quién se enteró después, secuencia." },
        { label: "Atención médica y denuncia", hint: "Por qué no fue al médico ni denunció; diagnóstico y records." },
        { label: "Amenazas migratorias", hint: "Palabras textuales, fecha, evento vinculado y efecto en el cliente." },
        { label: "Abuso económico / patrimonial", hint: "Montos, frecuencia, autorización, miedo vs. ayuda voluntaria." },
        { label: "Good faith marriage e inicio de la relación", hint: "Cómo se conocieron, noviazgo, por qué se casó pese a abuso previo." },
        { label: "Base del conocimiento (¿cómo lo sabe?)", hint: "Si lo vio, se lo contaron, encontró algo o lo sospecha." },
        { label: "Declaraciones de testigos (WS)", hint: "Fechas imposibles, hechos de oídas, periodos que contradicen al cliente." },
        { label: "Vigencia del abuso y riesgo actual", hint: "Última amenaza o agresión, armas, si siguen juntos." },
        { label: "Explicación de omisiones o cambios de versión", hint: "Validación clínica de omisiones o revelación tardía." },
      ],
    },
  ],
};

// Opciones de cada área; "Otro" va al final de las dos.
export function gruposDe(tipo: RegresoTipo, area: Area): MotivoGrupo[] {
  const prefix = area === "psych" ? "Psych" : "Paralegal";
  return [
    ...GRUPOS_POR_TIPO[tipo].filter((g) => g.grupo.startsWith(prefix)),
    OTRO,
  ];
}

export function motivosOf(tipo: RegresoTipo, area: Area) {
  return gruposDe(tipo, area).flatMap((g) => g.motivos);
}

// Área de un registro anterior a este campo, según su motivo.
export function areaDeMotivo(tipo: RegresoTipo, motivo: string): Area | null {
  for (const area of ["paralegal", "psych"] as Area[]) {
    const g = GRUPOS_POR_TIPO[tipo].find(
      (x) => x.grupo.startsWith(area === "psych" ? "Psych" : "Paralegal") &&
        x.motivos.some((m) => m.label === motivo)
    );
    if (g) return area;
  }
  return null;
}

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
