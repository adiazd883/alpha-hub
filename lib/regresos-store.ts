import { randomUUID } from "crypto";
import { USERS, USER_NAMES, celulasFor, type Role } from "@/lib/auth";
import { getJson, redis, setJson } from "@/lib/rfe/store";
import type { Person, Puesto, Regreso } from "@/lib/regresos";

/*
 * Misma base Upstash del hub. Cada registro va en un campo del
 * hash, así dos personas registrando al mismo tiempo no se
 * pisan. El equipo (para quién / quién lo manda) es una lista
 * aparte que el Admin edita desde el hub.
 */
const REGRESOS_KEY = "hub:regresos-v1";
const ROSTER_KEY = "hub:regresos-roster-v1";

export async function listRegresos(): Promise<Regreso[]> {
  const flat: string[] = (await redis(["HGETALL", REGRESOS_KEY])) || [];
  const out: Regreso[] = [];
  for (let i = 1; i < flat.length; i += 2) {
    try {
      out.push(JSON.parse(flat[i]) as Regreso);
    } catch {
      // Un registro dañado no tumba la lista.
    }
  }
  return out.sort((a, b) => b.creado.localeCompare(a.creado));
}

export async function getRegreso(id: string): Promise<Regreso | null> {
  const raw = await redis(["HGET", REGRESOS_KEY, id]);
  return raw ? (JSON.parse(raw) as Regreso) : null;
}

export async function saveRegreso(r: Regreso) {
  await redis(["HSET", REGRESOS_KEY, r.id, JSON.stringify(r)]);
}

export async function deleteRegreso(id: string) {
  await redis(["HDEL", REGRESOS_KEY, id]);
}

export function newId() {
  return randomUUID();
}

const PUESTO_POR_ROL: Partial<Record<Role, Puesto>> = {
  PARALEGAL: "paralegal",
  PSYCH: "psych",
  ANALYST: "analista",
  TL: "tl",
};

const defaultName = (email: string) => email.split("@")[0].toUpperCase();

function puestoDe(email?: string): Puesto | undefined {
  const role = email ? USERS[email.toLowerCase()] : undefined;
  return role ? PUESTO_POR_ROL[role] || "otro" : undefined;
}

// Primer arranque: el equipo sale de los usuarios con acceso.
function seedRoster(): Person[] {
  return Object.entries(USERS).map(([email, role]) => ({
    id: email,
    name: USER_NAMES[email] || defaultName(email),
    email,
    celula: celulasFor(email, role)[0],
    puesto: puestoDe(email),
    active: true,
  }));
}

/*
 * Quien tenga acceso al hub y aún no esté en la lista se
 * agrega solo, para que siempre pueda ver lo suyo.
 */
export async function getRoster(): Promise<Person[]> {
  const stored = await getJson<Person[]>(ROSTER_KEY);
  if (!stored) return seedRoster();
  const known = new Set(stored.map((p) => p.email).filter(Boolean));
  const missing = seedRoster().filter((p) => !known.has(p.email));
  return [
    ...stored.map((p) => ({
      ...p,
      // Quien no tenga puesto toma el de su rol en el hub.
      puesto: p.puesto || puestoDe(p.email),
      // Si aún tiene el nombre automático (usuario del correo), toma el real.
      name:
        p.email && p.name === defaultName(p.email) && USER_NAMES[p.email]
          ? USER_NAMES[p.email]
          : p.name,
    })),
    ...missing,
  ];
}

export async function saveRoster(roster: Person[]) {
  await setJson(ROSTER_KEY, roster);
}

export function personIdFor(roster: Person[], email: string) {
  return (
    roster.find(
      (p) => p.email?.toLowerCase() === email.toLowerCase()
    )?.id || null
  );
}
