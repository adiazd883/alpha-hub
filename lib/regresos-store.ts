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
  CS: "cs",
};

const defaultName = (email: string) => email.split("@")[0].toUpperCase();

function puestoDe(email?: string): Puesto | undefined {
  const role = email ? USERS[email.toLowerCase()] : undefined;
  return role ? PUESTO_POR_ROL[role] || "otro" : undefined;
}

// Primer arranque: el equipo sale de los usuarios con acceso.
function seedRoster(): Person[] {
  return Object.entries(USERS)
    // El equipo GMC no tiene célula de casos.
    .filter(([email, role]) => celulasFor(email, role).length > 0)
    .map(([email, role]) => ({
      id: email,
      name: USER_NAMES[email] || defaultName(email),
      email,
      celula: celulasFor(email, role)[0],
      puesto: puestoDe(email),
      active: true,
    }));
}

// Nombres que se cambiaron en el hub: la lista guardada se actualiza sola.
const PREVIOUS_NAMES: Record<string, string[]> = {
  // Había dos "Alonso" (Alpha y Gamma); el de Alpha es Andres.
  "aramirezc@supportmendoza.com": ["Alonso"],
};

/*
 * Quien tenga acceso al hub y aún no esté en la lista se
 * agrega solo, para que siempre pueda ver lo suyo.
 */
/*
 * Una sola vez: si en la lista quedó una persona capturada a mano
 * (sin correo) con el nombre anterior y en la misma célula, se une
 * con la persona del hub. Sus regresos pasan al id de la persona
 * del hub y la duplicada se quita, para que los análisis muestren
 * el nombre actual también en los registros pasados.
 */
const MERGE_FLAG_KEY = "hub:regresos-merge-names-v1";

async function mergePreviousNames(stored: Person[]): Promise<Person[]> {
  if (await redis(["GET", MERGE_FLAG_KEY])) return stored;

  let roster = [...stored];
  const rename = new Map<string, string>(); // id viejo → id del hub
  for (const [email, oldNames] of Object.entries(PREVIOUS_NAMES)) {
    const role = USERS[email];
    if (!role) continue;
    const celula = celulasFor(email, role)[0];
    const legacy = roster.filter(
      (p) => !p.email && p.celula === celula && oldNames.includes(p.name.trim())
    );
    if (!legacy.length) continue;
    const canonical = roster.find((p) => p.email?.toLowerCase() === email);
    if (!canonical) {
      // No había persona del hub: la capturada a mano se vuelve esa persona.
      const [first, ...rest] = legacy;
      roster = roster.map((p) =>
        p.id === first.id ? { ...p, email, name: USER_NAMES[email] || p.name } : p
      );
      rest.forEach((p) => rename.set(p.id, first.id));
    } else {
      legacy.forEach((p) => rename.set(p.id, canonical.id));
    }
    roster = roster.filter((p) => !rename.has(p.id));
  }

  if (rename.size) {
    const regresos = await listRegresos();
    for (const r of regresos) {
      const para = rename.get(r.para) || r.para;
      const de = rename.get(r.de) || r.de;
      if (para !== r.para || de !== r.de) await saveRegreso({ ...r, para, de });
    }
  }
  if (roster.length !== stored.length || rename.size || roster.some((p, i) => p !== stored[i])) {
    await saveRoster(roster);
  }
  await redis(["SET", MERGE_FLAG_KEY, new Date().toISOString()]);
  return roster;
}

export async function getRoster(): Promise<Person[]> {
  const raw = await getJson<Person[]>(ROSTER_KEY);
  const stored = raw ? await mergePreviousNames(raw) : raw;
  if (!stored) return seedRoster();
  const known = new Set(stored.map((p) => p.email).filter(Boolean));
  const missing = seedRoster().filter((p) => !known.has(p.email));
  return [
    ...stored.map((p) => ({
      ...p,
      // Quien no tenga puesto toma el de su rol en el hub.
      puesto: p.puesto || puestoDe(p.email),
      // Si aún tiene el nombre automático (usuario del correo) o uno
      // anterior, toma el real.
      name:
        p.email &&
        USER_NAMES[p.email] &&
        (p.name === defaultName(p.email) || PREVIOUS_NAMES[p.email]?.includes(p.name))
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
