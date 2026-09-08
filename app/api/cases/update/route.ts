import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  updateCase,
} from "@/lib/sheets";

type Role =
  | "ADMIN"
  | "TL"
  | "PARALEGAL"
  | "PSYCH"
  | "ANALYST"
  | "MANAGER"
  | "COORDINATOR";

const USERS: Record<
  string,
  Role
> = {
  "adiazd@supportmendoza.com":
    "ADMIN",

  "nrioja@supportmendoza.com":
    "TL",

  "mponce@supportmendoza.com":
    "PARALEGAL",

  "camontoya@supportmendoza.com":
    "PARALEGAL",

  "aramirezd@supportmendoza.com":
    "PSYCH",

  "fvals@supportmendoza.com":
    "PSYCH",

  "nmolina@supportmendoza.com":
    "PSYCH",

  "agonzalezgo@supportmendoza.com":
    "ANALYST",

  "aramirezc@supportmendoza.com":
    "ANALYST",

  "hjesus@supportmendoza.com":
    "ANALYST",

  "bcastellanos@supportmendoza.com":
    "MANAGER",

  "vperez@supportmendoza.com":
    "COORDINATOR",
};

/*
 * Estas son las únicas columnas
 * duplicadas de PARALEGAL que
 * permitimos modificar directamente.
 */
const PARALEGAL_COLUMNS =
  new Set([
    "J",
    "S",
    "BN",
  ]);

export async function POST(
  req: NextRequest
) {
  try {
    const email =
      req.cookies.get(
        "alpha_hub_email"
      )?.value;

    if (!email) {
      return NextResponse.json(
        {
          error:
            "No autenticado",
        },
        {
          status: 401,
        }
      );
    }

    const normalizedEmail =
      email
        .toLowerCase()
        .trim();

    const role =
      USERS[
        normalizedEmail
      ];

    if (!role) {
      return NextResponse.json(
        {
          error:
            "Usuario no autorizado",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * Manager y Coordinator
     * siguen completamente
     * read-only.
     */
    if (
      role === "MANAGER" ||
      role === "COORDINATOR"
    ) {
      return NextResponse.json(
        {
          error:
            "Tu rol es de solo lectura",
        },
        {
          status: 403,
        }
      );
    }

    const body =
      await req.json();

    const row =
      Number(body.row);

    const changes =
      body.changes &&
      typeof body.changes ===
        "object"
        ? body.changes
        : {};

    const columnChanges =
      body.columnChanges &&
      typeof body.columnChanges ===
        "object"
        ? body.columnChanges
        : {};

    if (
      !Number.isInteger(row) ||
      row < 3
    ) {
      return NextResponse.json(
        {
          error:
            "Fila inválida",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Si alguien intenta modificar
     * una columna exacta de PARALEGAL,
     * solamente ADMIN y TL pueden hacerlo.
     */
    const exactColumns =
      Object.keys(
        columnChanges
      ).map((column) =>
        column
          .trim()
          .toUpperCase()
      );

    const hasParalegalReassignment =
      exactColumns.some(
        (column) =>
          PARALEGAL_COLUMNS.has(
            column
          )
      );

    if (
      hasParalegalReassignment &&
      role !== "ADMIN" &&
      role !== "TL"
    ) {
      return NextResponse.json(
        {
          error:
            "Solo Admin y Team Leader pueden reasignar colaboradores",
        },
        {
          status: 403,
        }
      );
    }

    /*
     * No permitimos otras columnas
     * exactas diferentes de J/S/BN.
     */
    const invalidExactColumn =
      exactColumns.find(
        (column) =>
          !PARALEGAL_COLUMNS.has(
            column
          )
      );

    if (
      invalidExactColumn
    ) {
      return NextResponse.json(
        {
          error:
            `No está permitido modificar directamente la columna ${invalidExactColumn}`,
        },
        {
          status: 403,
        }
      );
    }

    /*
     * Psych, EA Member y CVL Member
     * tienen headers únicos.
     *
     * También son reasignaciones,
     * por lo que solo ADMIN/TL
     * pueden cambiar esos campos.
     */
    const restrictedHeaders =
      new Set([
        "PSYCH",
        "EA MEMBER",
        "CVL MEMBER",
      ]);

    const isUniqueCollaboratorChange =
      Object.keys(
        changes
      ).some(
        (header) =>
          restrictedHeaders.has(
            header
              .trim()
              .toUpperCase()
          )
      );

    if (
      isUniqueCollaboratorChange &&
      role !== "ADMIN" &&
      role !== "TL"
    ) {
      return NextResponse.json(
        {
          error:
            "Solo Admin y Team Leader pueden reasignar colaboradores",
        },
        {
          status: 403,
        }
      );
    }

    await updateCase(
      row,
      changes,
      columnChanges
    );

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error(
      "Update case error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el cambio",
      },
      {
        status: 500,
      }
    );
  }
}
