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
  "aramirezd@supportmendoza.com": "PSYCH",
  "fvals@supportmendoza.com": "PSYCH",
  "nmolina@supportmendoza.com": "PSYCH",
  "agonzalezgo@supportmendoza.com": "ANALYST",
  "aramirezc@supportmendoza.com": "ANALYST",
  "hjesus@supportmendoza.com": "ANALYST",
  "bcastellanos@supportmendoza.com": "MANAGER",
  "vperez@supportmendoza.com": "COORDINATOR",
};
