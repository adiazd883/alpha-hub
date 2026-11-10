// Tipos de Decisions que puede importar el cliente (sin googleapis).
export type DecisionCase = {
  key: string;
  cliente: string;
  forms: string[];
  status: string; // EVIDENCE STATUS (Atty Review, Working, Ready MGM Review)
  deadlineUscis: string; // DATE DD, YYYY-MM-DD
  deadlineInterno: string; // 5 días antes; domingo → sábado
};

// Commitment interno: días antes del deadline con USCIS.
export const DECISION_INTERNO_DIAS = 5;
