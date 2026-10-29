import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gmcEditFields } from "@/lib/auth";
import {
  GMC_STATUS_OPTIONS,
  GMC_TABS,
  loadGmc,
  updateGmc,
  type GmcField,
  type GmcTab,
} from "@/lib/gmc";

export const dynamic = "force-dynamic";

const FIELDS: GmcField[] = ["status", "expected", "done", "link"];

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// Vista del área: solo quien ve todas las células.
function access(req: NextRequest) {
  const session = getSession(req);
  if (!session) return { error: fail("No autenticado", 401) };
  if (!session.gmc) {
    return { error: fail("No tienes acceso a GMC", 403) };
  }
  return { session };
}

export async function GET(req: NextRequest) {
  const { session, error } = access(req);
  if (error) return error;

  try {
    return NextResponse.json({
      ...(await loadGmc()),
      editFields: gmcEditFields(session.email, session.role),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function PATCH(req: NextRequest) {
  const { session, error } = access(req);
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const tab = GMC_TABS.find((t) => t === body.tab) as GmcTab | undefined;
  const field = FIELDS.find((f) => f === body.field);
  if (field && !gmcEditFields(session.email, session.role).includes(field)) {
    return fail(
      field === "expected" ? "Solo Admin pone la fecha esperada" : "No puedes editar GMC",
      403
    );
  }
  const row = Number(body.row);
  const cliente = typeof body.cliente === "string" ? body.cliente : "";
  const value = typeof body.value === "string" ? body.value.trim() : "";

  if (!tab || !field || !Number.isInteger(row) || row < 2 || !cliente) {
    return fail("Datos incompletos");
  }
  if (field === "status" && !GMC_STATUS_OPTIONS.includes(value)) {
    return fail("Estatus inválido");
  }
  if ((field === "expected" || field === "done") && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fail("Fecha inválida");
  }
  if (field === "link" && value && (!/^https?:\/\//i.test(value) || value.length > 500)) {
    return fail("El link debe empezar con http");
  }

  try {
    const item = await updateGmc({ tab, row, cliente, field, value });
    return NextResponse.json({ item });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "No se pudo guardar", 500);
  }
}
