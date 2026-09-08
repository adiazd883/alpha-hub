import { google } from "googleapis";

function client() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!raw) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const credentials = JSON.parse(raw);

  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ],
  });
}

async function getSheets() {
  const auth = client();

  return google.sheets({
    version: "v4",
    auth,
  });
}

export async function getTargetSheet() {
  const sheets = await getSheets();

  const spreadsheetId =
    process.env.GOOGLE_SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error(
      "Missing GOOGLE_SPREADSHEET_ID"
    );
  }

  const meta =
    await sheets.spreadsheets.get({
      spreadsheetId,
      fields:
        "sheets(properties(sheetId,title,index))",
    });

  const sheet = (
    meta.data.sheets || []
  ).find(
    (s) =>
      s.properties?.title ===
      "ADMINs"
  );

  if (!sheet?.properties?.title) {
    throw new Error(
      'Could not find sheet "ADMINs"'
    );
  }

  return {
    sheets,
    spreadsheetId,
    title:
      sheet.properties.title,
  };
}

export async function readCases() {
  const {
    sheets,
    spreadsheetId,
    title,
  } = await getTargetSheet();

  const range =
    `'${title.replace(
      /'/g,
      "''"
    )}'!2:1000`;

  const res =
    await sheets.spreadsheets.values.get(
      {
        spreadsheetId,
        range,
        valueRenderOption:
          "FORMATTED_VALUE",
      }
    );

  const values =
    res.data.values || [];

  if (!values.length) {
    return {
      title,
      headers: [],
      rows: [],
    };
  }

  const headers =
    values[0].map((v) =>
      String(v ?? "")
    );

  const rows = values
    .slice(1)
    .map((r, i) => {
      const obj: Record<
        string,
        string
      > = {
        __row: String(i + 3),
      };

      /*
       * Para headers duplicados conservamos
       * la primera aparición con el nombre
       * normal del header.
       */
      headers.forEach(
        (header, index) => {
          if (
            header &&
            !(header in obj)
          ) {
            obj[header] =
              String(
                r[index] ?? ""
              );
          }
        }
      );

      /*
       * IMPORTANTE:
       *
       * En ADMINs existen 3 columnas
       * llamadas PARALEGAL.
       *
       * J  = Carátula
       * S  = 1st Draft
       * BN = Escalación CVL
       *
       * Creamos nombres internos únicos.
       * Estos nombres NO existen en Google
       * Sheets; son solamente para Alpha Hub.
       */

      obj[
        "__PARALEGAL_CARATULA"
      ] = String(
        r[9] ?? ""
      );

      obj[
        "__PARALEGAL_DRAFT"
      ] = String(
        r[18] ?? ""
      );

      obj[
        "__PARALEGAL_PLCVL"
      ] = String(
        r[65] ?? ""
      );

      return obj;
    })
    .filter((row) =>
      Object.entries(row).some(
        ([key, value]) =>
          key !== "__row" &&
          value
      )
    );

  return {
    title,
    headers,
    rows,
  };
}

const normal = (
  value: string
) =>
  value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

export async function updateCase(
  rowNumber: number,
  changes: Record<
    string,
    string
  > = {},
  columnChanges: Record<
    string,
    string
  > = {}
) {
  const {
    sheets,
    spreadsheetId,
    title,
  } = await getTargetSheet();

  if (
    !Number.isInteger(
      rowNumber
    ) ||
    rowNumber < 3
  ) {
    throw new Error(
      "Invalid row number"
    );
  }

  const data: {
    range: string;
    values: string[][];
  }[] = [];

  /*
   * Cambios normales:
   * buscan la columna por header.
   */
  if (
    Object.keys(changes).length
  ) {
    const current =
      await sheets.spreadsheets.values.get(
        {
          spreadsheetId,
          range:
            `'${title.replace(
              /'/g,
              "''"
            )}'!2:2`,
        }
      );

    const headers = (
      current.data.values?.[0] ||
      []
    ).map(String);

    Object.entries(
      changes
    ).forEach(
      ([header, value]) => {
        const idx =
          headers.findIndex(
            (h) =>
              normal(h) ===
              normal(header)
          );

        if (idx < 0) {
          throw new Error(
            `Column not found: ${header}`
          );
        }

        const col =
          columnName(idx + 1);

        data.push({
          range:
            `'${title.replace(
              /'/g,
              "''"
            )}'!${col}${rowNumber}`,
          values: [[value]],
        });
      }
    );
  }

  /*
   * Cambios por columna exacta.
   *
   * Esto es lo que usamos para los
   * PARALEGAL duplicados.
   */
  Object.entries(
    columnChanges
  ).forEach(
    ([column, value]) => {
      const col =
        column
          .trim()
          .toUpperCase();

      if (
        !/^[A-Z]{1,3}$/.test(
          col
        )
      ) {
        throw new Error(
          `Invalid column: ${column}`
        );
      }

      data.push({
        range:
          `'${title.replace(
            /'/g,
            "''"
          )}'!${col}${rowNumber}`,
        values: [[value]],
      });
    }
  );

  if (!data.length) {
    return;
  }

  await sheets.spreadsheets.values.batchUpdate(
    {
      spreadsheetId,

      requestBody: {
        valueInputOption:
          "USER_ENTERED",

        data,
      },
    }
  );
}

function columnName(
  n: number
) {
  let s = "";

  while (n) {
    const r =
      (n - 1) % 26;

    s =
      String.fromCharCode(
        65 + r
      ) + s;

    n =
      Math.floor(
        (n - 1) / 26
      );
  }

  return s;
}
