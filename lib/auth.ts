import type { Celula } from "@/lib/celulas";
import { CELULA_KEYS } from "@/lib/celulas";

export type Role =
  | "ADMIN"
  | "TL"
  | "PARALEGAL"
  | "PSYCH"
  | "ANALYST"
  | "MANAGER"
  | "COORDINATOR";

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
  "bcastellanos@supportmendoza.com": "MANAGER",
  "vperez@supportmendoza.com": "COORDINATOR",
  "aperezn@supportmendoza.com": "TL",
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
};

export function celulasFor(
  email: string,
  role: Role
): Celula[] {
  if (ALL_CELULAS_ROLES.has(role)) {
    return CELULA_KEYS;
  }

  return USER_CELULAS[email] || ["alpha"];
}
