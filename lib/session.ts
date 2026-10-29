import {
  createHmac,
  timingSafeEqual,
} from "crypto";
import type { NextRequest } from "next/server";
import {
  USERS,
  celulasFor,
  gmcAccess,
  type Role,
} from "@/lib/auth";
import type { Celula } from "@/lib/celulas";

/*
 * La sesión va firmada (HMAC) para que nadie pueda
 * escribir a mano una cookie con el correo de otra
 * persona. El rol y las células se recalculan en cada
 * request desde lib/auth.ts, así un cambio de permisos
 * aplica sin volver a iniciar sesión.
 */
export const SESSION_COOKIE = "alpha_hub_session";

export const SESSION_MAX_AGE = 60 * 60 * 8;

function secret() {
  const value =
    process.env.SESSION_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET;

  if (!value) {
    throw new Error("Missing SESSION_SECRET");
  }

  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
}

export function createSessionToken(
  email: string
) {
  const expires =
    Date.now() + SESSION_MAX_AGE * 1000;

  const payload = Buffer.from(
    `${email}|${expires}`
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export type Session = {
  email: string;
  role: Role;
  celulas: Celula[];
  gmc: boolean;
};

export function getSession(
  req: NextRequest
): Session | null {
  const token =
    req.cookies.get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const [payload, signature] =
    token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);

  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }

  const [email, expires] = Buffer.from(
    payload,
    "base64url"
  )
    .toString()
    .split("|");

  if (!email || Number(expires) < Date.now()) {
    return null;
  }

  const role = USERS[email];

  if (!role) {
    return null;
  }

  return {
    email,
    role,
    celulas: celulasFor(email, role),
    gmc: gmcAccess(email, role),
  };
}
