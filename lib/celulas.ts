/*
 * Células de trabajo del hub.
 *
 * Cada célula tiene su propia Google Sheet con una pestaña
 * "ADMINs" del mismo formato. Solo Alpha tiene además la
 * pestaña "NW GENERAL" (NON-VAWA).
 */
export type Celula = "alpha" | "gamma";

export const CELULAS: Record<
  Celula,
  {
    label: string;
    spreadsheetEnv: string;
    defaultSpreadsheetId?: string;
    hasNwGeneral: boolean;
  }
> = {
  alpha: {
    label: "Alpha",
    spreadsheetEnv: "GOOGLE_SPREADSHEET_ID",
    hasNwGeneral: true,
  },
  gamma: {
    label: "Gamma",
    spreadsheetEnv: "GOOGLE_SPREADSHEET_ID_GAMMA",
    defaultSpreadsheetId:
      "1984oviecoQCNxP2PpR13F8osQFSbpNE8DvUieA92wIg",
    hasNwGeneral: false,
  },
};

export const CELULA_KEYS = Object.keys(
  CELULAS
) as Celula[];

export function isCelula(
  value: unknown
): value is Celula {
  return (
    typeof value === "string" &&
    value in CELULAS
  );
}

export function spreadsheetIdFor(
  celula: Celula
) {
  const config = CELULAS[celula];

  const id =
    process.env[config.spreadsheetEnv] ||
    config.defaultSpreadsheetId;

  if (!id) {
    throw new Error(
      `Missing ${config.spreadsheetEnv}`
    );
  }

  return id;
}
