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

export type Puesto = "analista" | "paralegal" | "psych";

export const PUESTO_LABELS: Record<Puesto, string> = {
  analista: "Analista",
  paralegal: "Paralegal",
  psych: "Psych",
};

export const PUESTO_POR_ROL: Partial<Record<Role, Puesto>> = {
  ANALYST: "analista",
  PARALEGAL: "paralegal",
  PSYCH: "psych",
};

// Analistas indican si el tiempo es para la DCL o la CVL.
export const KPIS_ANALISTA = ["DCL", "CVL"];

export type Grupo = { categoria: string; actividades: string[] };

const POST_CLIENTE = "Post entrega · debido al cliente";
const POST_ERROR = "Post entrega · error del colaborador";

// Tareas del PDF "TASKS" (Downloads, oct 2026).
export const CATALOGO: Record<Puesto, Grupo[]> = {
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
};

export function categoriaDe(puesto: Puesto, actividad: string) {
  return CATALOGO[puesto].find((g) => g.actividades.includes(actividad))?.categoria || null;
}

// Número de la actividad en la lista de su puesto (1, 2, 3… como en el PDF).
export function numeroDe(puesto: Puesto, actividad: string) {
  const i = CATALOGO[puesto].flatMap((g) => g.actividades).indexOf(actividad);
  return i >= 0 ? i + 1 : null;
}

export type Registro = {
  id: string;
  email: string;
  nombre: string;
  celula: Celula;
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
};

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
    "Cliente", "Colaborador", "Correo", "Célula", "Puesto", "KPI", "Categoría", "No. actividad", "Actividad",
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
        numeroDe(r.puesto, r.actividad) ?? "", r.actividad,
        mxDate(r.inicio), mxTime(r.inicio), mxTime(r.fin!), minutes(r), monday(mxDate(r.inicio)),
        r.modo === "cronometro" ? "Cronómetro" : r.modo === "manual" ? "Manual" : "",
        r.editado ? "SÍ" : "", r.prueba ? "SÍ" : "", mxDate(r.creado) + " " + mxTime(r.creado), r.id,
      ].map(esc).join(",")
    );
  // BOM para que Excel abra bien los acentos.
  return "﻿" + [header.join(","), ...lines].join("\n");
}
