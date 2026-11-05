import type { Celula } from "@/lib/celulas";
import { CELULA_KEYS } from "@/lib/celulas";

export type Role =
  | "ADMIN"
  | "TL"
  | "PARALEGAL"
  | "PSYCH"
  | "ANALYST"
  | "MANAGER"
  | "COORDINATOR"
  | "CS"; // Case Strategy: ve todo su equipo, solo lectura

export const USERS: Record<string, Role> = {
  "adiazd@supportmendoza.com": "ADMIN",
  "nrioja@supportmendoza.com": "TL",
  "anavag@supportmendoza.com": "TL",
  "mponce@supportmendoza.com": "PARALEGAL",
  "camontoya@supportmendoza.com": "PARALEGAL",
  "pperezy@supportmendoza.com": "PARALEGAL",
  "aramirezd@supportmendoza.com": "PSYCH",
  "fvals@supportmendoza.com": "PSYCH",
  "nmolina@supportmendoza.com": "PSYCH",
  "agonzalezgo@supportmendoza.com": "ANALYST",
  "aramirezc@supportmendoza.com": "ANALYST",
  "hjesus@supportmendoza.com": "ANALYST",
  "lcamaro@supportmendoza.com": "ANALYST",
  "jlara@supportmendoza.com": "PARALEGAL",
  "bcastellanos@supportmendoza.com": "MANAGER",
  "vperez@supportmendoza.com": "COORDINATOR",
  "aperezn@supportmendoza.com": "TL",

  // Gamma
  "binfante@supportmendoza.com": "PSYCH",
  "cgarciag@supportmendoza.com": "CS",
  "dbonifacio@supportmendoza.com": "PARALEGAL",
  "jbocanegra@supportmendoza.com": "ANALYST",
  "lgutierrezu@supportmendoza.com": "PARALEGAL",
  "lmurillo@supportmendoza.com": "PSYCH",
  "ocervantes@supportmendoza.com": "PARALEGAL",
  "pbautista@supportmendoza.com": "ANALYST",
  "pponce@supportmendoza.com": "PARALEGAL",
  "sesquivel@supportmendoza.com": "PSYCH",

  // GMC (Gov Branch)
  "gsanchez@supportmendoza.com": "TL",
  // Equipo GMC (Gov Branch): solo ven GMC.
  "amagana@supportmendoza.com": "PARALEGAL",
  "cgarcia@supportmendoza.com": "TL",
  "dgutierrezve@supportmendoza.com": "ANALYST",
  "icalzada@supportmendoza.com": "PARALEGAL",
  "jnavarrete@supportmendoza.com": "TL",
  "rmontes@supportmendoza.com": "PARALEGAL",
  "vfloresc@supportmendoza.com": "PARALEGAL",
  "vnyssen@supportmendoza.com": "PARALEGAL",
  "mcastror@supportmendoza.com": "PARALEGAL",
  "evazquez@supportmendoza.com": "PARALEGAL",
  "llopez@supportmendoza.com": "PARALEGAL",
};

/*
 * Nombre con el que sale cada quien en el hub (Regresos).
 * Quien no esté aquí sale con su usuario de correo.
 */
export const USER_NAMES: Record<string, string> = {
  // Alpha
  "adiazd@supportmendoza.com": "Alexandro",
  "nrioja@supportmendoza.com": "Nayeli",
  "anavag@supportmendoza.com": "Agustin",
  "mponce@supportmendoza.com": "Mayla",
  "camontoya@supportmendoza.com": "Carlos Arturo",
  "pperezy@supportmendoza.com": "Paola",
  "aramirezd@supportmendoza.com": "Alberto",
  "fvals@supportmendoza.com": "Fernanda",
  "nmolina@supportmendoza.com": "Natalia",
  "agonzalezgo@supportmendoza.com": "Alejandro",
  "aramirezc@supportmendoza.com": "Alonso",
  "hjesus@supportmendoza.com": "Hector",
  "lcamaro@supportmendoza.com": "Les",
  "jlara@supportmendoza.com": "Jazmin",
  "bcastellanos@supportmendoza.com": "Brenda",
  "vperez@supportmendoza.com": "Valeria",

  // Gamma
  "aperezn@supportmendoza.com": "Fernando P",
  "binfante@supportmendoza.com": "Barbara",
  "cgarciag@supportmendoza.com": "Consuelo",
  "dbonifacio@supportmendoza.com": "Diana",
  "jbocanegra@supportmendoza.com": "Jesus Alonso",
  "lgutierrezu@supportmendoza.com": "Lucio",
  "lmurillo@supportmendoza.com": "Fernando",
  "ocervantes@supportmendoza.com": "Oswa",
  "pbautista@supportmendoza.com": "Sofia",
  "pponce@supportmendoza.com": "Paulina",
  "sesquivel@supportmendoza.com": "Susana",

  // GMC
  "gsanchez@supportmendoza.com": "Gerson",
  "amagana@supportmendoza.com": "Armando",
  "cgarcia@supportmendoza.com": "Carolina",
  "dgutierrezve@supportmendoza.com": "Diana P",
  "icalzada@supportmendoza.com": "Itzel",
  "jnavarrete@supportmendoza.com": "Jacob",
  "rmontes@supportmendoza.com": "Renata",
  "vfloresc@supportmendoza.com": "Viator",
  "vnyssen@supportmendoza.com": "Viviana",
  "mcastror@supportmendoza.com": "Martha",
  "evazquez@supportmendoza.com": "Erik",
  "llopez@supportmendoza.com": "Luis",
};

/*
 * Estos roles ven todas las células.
 */
const ALL_CELULAS_ROLES = new Set<Role>([
  "ADMIN",
  "MANAGER",
  "COORDINATOR",
]);

/*
 * Célula de cada TL / colaborador.
 * Quien no aparezca aquí pertenece a Alpha.
 */
export const USER_CELULAS: Record<string, Celula[]> = {
  "aperezn@supportmendoza.com": ["gamma"],
  "binfante@supportmendoza.com": ["gamma"],
  "cgarciag@supportmendoza.com": ["gamma"],
  "dbonifacio@supportmendoza.com": ["gamma"],
  "jbocanegra@supportmendoza.com": ["gamma"],
  "lgutierrezu@supportmendoza.com": ["gamma"],
  "lmurillo@supportmendoza.com": ["gamma"],
  "ocervantes@supportmendoza.com": ["gamma"],
  "pbautista@supportmendoza.com": ["gamma"],
  "pponce@supportmendoza.com": ["gamma"],
  "sesquivel@supportmendoza.com": ["gamma"],

  // Equipo GMC: no tiene célula de casos, solo GMC.
  "gsanchez@supportmendoza.com": [],
  "amagana@supportmendoza.com": [],
  "cgarcia@supportmendoza.com": [],
  "dgutierrezve@supportmendoza.com": [],
  "icalzada@supportmendoza.com": [],
  "jnavarrete@supportmendoza.com": [],
  "rmontes@supportmendoza.com": [],
  "vfloresc@supportmendoza.com": [],
  "vnyssen@supportmendoza.com": [],
  "mcastror@supportmendoza.com": [],
  "evazquez@supportmendoza.com": [],
  "llopez@supportmendoza.com": [],
};

/*
 * Equipo GMC (Gov Branch). Ven la célula GMC y actualizan
 * estatus, fecha de entrega y link; la fecha esperada solo la
 * pone el Admin. Quien ve todas las células también ve GMC.
 */
// Equipo GMC: entra a GMC y edita sus entregas (status, entrega y link).
const GMC_MEMBERS = new Set<string>([
  "amagana@supportmendoza.com",
  "cgarcia@supportmendoza.com",
  "dgutierrezve@supportmendoza.com",
  "icalzada@supportmendoza.com",
  "jnavarrete@supportmendoza.com",
  "rmontes@supportmendoza.com",
  "vfloresc@supportmendoza.com",
  "vnyssen@supportmendoza.com",
  "mcastror@supportmendoza.com",
  "evazquez@supportmendoza.com",
  "llopez@supportmendoza.com",
  "gsanchez@supportmendoza.com",
]);

export function gmcAccess(email: string, role: Role) {
  return ALL_CELULAS_ROLES.has(role) || GMC_MEMBERS.has(email);
}

export function gmcEditFields(
  email: string,
  role: Role
): ("expected" | "status" | "done" | "link")[] {
  if (role === "ADMIN") return ["expected", "status", "done", "link"];
  if (GMC_MEMBERS.has(email)) return ["status", "done", "link"];
  return [];
}

export function celulasFor(
  email: string,
  role: Role
): Celula[] {
  if (ALL_CELULAS_ROLES.has(role)) {
    return CELULA_KEYS;
  }

  return USER_CELULAS[email] || ["alpha"];
}
