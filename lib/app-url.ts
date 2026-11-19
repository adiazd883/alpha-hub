/*
 * Origen público de la app según el request. Sirve para que el
 * login con Google funcione en cualquier dominio: el hub y la
 * plataforma de "solo tiempos" (que corre del mismo código en
 * otro proyecto de Vercel) comparten estas rutas de OAuth.
 */
export function appOrigin(req: Request): string {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host");
  if (host) return `${proto}://${host}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://alpha-hub-ten.vercel.app";
  }
}
