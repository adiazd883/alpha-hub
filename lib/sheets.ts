import { google } from "googleapis";
import {
  type Celula,
  spreadsheetIdFor,
} from "@/lib/celulas";

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

export async function getSheets() {
  const auth = client();

  return google.sheets({
    version: "v4",
    auth,
  });
}

export async function getTargetSheet(
  celula: Celula
) {
  const sheets = await getSheets();

  const spreadsheetId =
    spreadsheetIdFor(celula);

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

/*
 * Todas las células usan el mismo formato de ADMINs,
 * pero solo en Alpha se renombraron los headers repetidos
 * (ej. "EXPECTED DONE" -> "EA EXPECTED DONE"). El hub busca
 * columnas por esos nombres, así que para otra célula
 * tomamos los headers de Alpha columna por columna.
 *
 * Si alguien mueve columnas en una Sheet, estas anclas ya
 * no coinciden y preferimos fallar antes que leer o
 * escribir la columna equivocada.
 */
const ADMINS_ANCHORS: [number, string][] = [
  [0, "DUE DATE/NO DUE DATE"],
  [1, "CLIENTE"],
  [2, "ID"],
  [3, "RECEIPT NUMBER"],
  [6, "DEADLINE"],
  [7, "COMMITMENT"],
  [9, "PARALEGAL"],
  [24, "PSYCH"],
  [25, "DCL STATUS"],
  [30, "DOE STATUS"],
  [65, "PARALEGAL"],
  [75, "PARALEGAL"],
  [95, "LINK RFE"],
];

function checkAnchors(
  headers: string[],
  label: string
) {
  const broken = ADMINS_ANCHORS.find(
    ([index, name]) =>
      normal(headers[index] || "") !==
      normal(name)
  );

  if (broken) {
    throw new Error(
      `Las columnas de ADMINs (${label}) no están en el orden esperado: ` +
        `la columna ${columnName(broken[0] + 1)} debería ser "${broken[1]}"`
    );
  }
}

async function readHeaderRow(
  sheets: Awaited<ReturnType<typeof getSheets>>,
  spreadsheetId: string,
  title: string
) {
  const res =
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${title.replace(
        /'/g,
        "''"
      )}'!2:2`,
    });

  return (res.data.values?.[0] || []).map(
    (v) => String(v ?? "")
  );
}

async function alignedHeaders(
  celula: Celula,
  localHeaders: string[]
) {
  if (celula === "alpha") {
    return localHeaders;
  }

  const alpha =
    await getTargetSheet("alpha");

  const alphaHeaders =
    await readHeaderRow(
      alpha.sheets,
      alpha.spreadsheetId,
      alpha.title
    );

  checkAnchors(alphaHeaders, "alpha");
  checkAnchors(localHeaders, celula);

  // Columnas nuevas que no están en la misma posición en ambas
  // Sheets (p. ej. INITIAL REVIEW) conservan su propio nombre.
  const keepOwn = new Set(
    ["INITIAL REVIEW (FIRST APPROACH)"].map(normal)
  );

  return localHeaders.map(
    (header, index) =>
      keepOwn.has(normal(header))
        ? header
        : alphaHeaders[index] || header
  );
}

export async function readCases(
  celula: Celula
) {
  const {
    sheets,
    spreadsheetId,
    title,
  } = await getTargetSheet(celula);

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
    await alignedHeaders(
      celula,
      values[0].map((v) =>
        String(v ?? "")
      )
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
  celula: Celula,
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
  } = await getTargetSheet(celula);

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
    const headers =
      await alignedHeaders(
        celula,
        await readHeaderRow(
          sheets,
          spreadsheetId,
          title
        )
      );

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

/*
 * A diferencia de getTargetSheet()
 * (hardcoded a "ADMINs"), estas
 * funciones genéricas leen/escriben
 * cualquier pestaña por su título
 * exacto, asumiendo headers en la
 * fila 1 y datos desde la fila 2
 * (sin columnas duplicadas ni
 * campos sintéticos).
 */

async function getSheetByTitle(
  title: string
) {
  const sheets = await getSheets();

  // NW GENERAL solo existe en la Sheet de Alpha.
  const spreadsheetId =
    spreadsheetIdFor("alpha");

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
      s.properties?.title === title
  );

  if (!sheet?.properties?.title) {
    throw new Error(
      `Could not find sheet "${title}"`
    );
  }

  return {
    sheets,
    spreadsheetId,
    title: sheet.properties.title,
  };
}

export async function readSheetCases(
  title: string
) {
  const {
    sheets,
    spreadsheetId,
    title: sheetTitle,
  } = await getSheetByTitle(title);

  const range = `'${sheetTitle.replace(
    /'/g,
    "''"
  )}'!1:1000`;

  /*
   * Usamos spreadsheets.get con includeGridData en vez de
   * values.get para poder leer el campo "hyperlink" de cada
   * celda: algunas columnas (ej. LINK) muestran un texto fijo
   * ("LINK") con un enlace insertado por separado, y el texto
   * mostrado no sirve como URL.
   */
  const res =
    await sheets.spreadsheets.get({
      spreadsheetId,
      ranges: [range],
      includeGridData: true,
      fields:
        "sheets.data.rowData.values(formattedValue,hyperlink)",
    });

  const gridRows =
    res.data.sheets?.[0]?.data?.[0]
      ?.rowData || [];

  const values: string[][] =
    gridRows.map((r) =>
      (r.values || []).map(
        (v) =>
          v.hyperlink ||
          v.formattedValue ||
          ""
      )
    );

  if (!values.length) {
    return {
      title: sheetTitle,
      headers: [],
      rows: [],
    };
  }

  const headers = values[0].map(
    (v) => String(v ?? "")
  );

  const rows = values
    .slice(1)
    .map((r, i) => {
      const obj: Record<
        string,
        string
      > = {
        __row: String(i + 2),
      };

      headers.forEach(
        (header, index) => {
          if (
            header &&
            !(header in obj)
          ) {
            obj[header] = String(
              r[index] ?? ""
            );
          }
        }
      );

      return obj;
    })
    .filter((row) =>
      Object.entries(row).some(
        ([key, value]) =>
          key !== "__row" && value
      )
    );

  return {
    title: sheetTitle,
    headers,
    rows,
  };
}

export async function updateSheetCase(
  title: string,
  rowNumber: number,
  changes: Record<string, string> = {}
) {
  const {
    sheets,
    spreadsheetId,
    title: sheetTitle,
  } = await getSheetByTitle(title);

  if (
    !Number.isInteger(rowNumber) ||
    rowNumber < 2
  ) {
    throw new Error(
      "Invalid row number"
    );
  }

  if (!Object.keys(changes).length) {
    return;
  }

  const current =
    await sheets.spreadsheets.values.get(
      {
        spreadsheetId,
        range: `'${sheetTitle.replace(
          /'/g,
          "''"
        )}'!1:1`,
      }
    );

  const headers = (
    current.data.values?.[0] || []
  ).map(String);

  const data = Object.entries(
    changes
  ).map(([header, value]) => {
    const idx = headers.findIndex(
      (h) =>
        normal(h) === normal(header)
    );

    if (idx < 0) {
      throw new Error(
        `Column not found: ${header}`
      );
    }

    const col = columnName(idx + 1);

    return {
      range: `'${sheetTitle.replace(
        /'/g,
        "''"
      )}'!${col}${rowNumber}`,
      values: [[value]],
    };
  });

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

/*
 * Pestaña "NW ADMINs" de Alpha (casos NON VAWA): títulos en la
 * fila 2. Cada fila sale como objeto por título, con __row = la
 * fila real de la Sheet.
 */
export async function readNwAdmins() {
  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: spreadsheetIdFor("alpha"),
    range: "'NW ADMINs'!A2:AW",
  });

  const values = (res.data.values || []) as string[][];
  const headers = (values[0] || []).map((h) => String(h ?? "").trim());

  return values
    .slice(1)
    .map((r, i) => {
      const obj: Record<string, string> = { __row: String(i + 3) };
      headers.forEach((h, j) => {
        if (h && !(h in obj)) obj[h] = String(r[j] ?? "").trim();
      });
      return obj;
    })
    .filter((r) => r["CL"]);
}
