// Tipos y constantes de "Días antes del deadline" (también los usa el navegador).
export type AntFuente = "VAWA" | "NON VAWA" | "VISA T";
export type AntTipo = "NOID" | "RFE DL NOID" | "RFE";

export const ANT_FUENTES: AntFuente[] = ["VAWA", "NON VAWA", "VISA T"];
export const ANT_TIPOS: AntTipo[] = ["NOID", "RFE DL NOID", "RFE"];

// Días entre recibo y deadline para considerar un RFE con deadline de NOID.
export const NOID_DEADLINE_MAX_DIAS = 35;

export type AntCaso = {
  fuente: AntFuente;
  tipo: AntTipo;
  cliente: string;
  tipoSheet: string;
  recibo: string;
  deadline: string;
  entrega: string; // READY FOR MGM REVIEW / FECHA RTP
  dias: number;
};

export type AntData = {
  casos: AntCaso[];
  // Casos del tipo correcto que aún no llegan a revisión (sin fecha).
  pendientes: Record<AntFuente, number>;
};
