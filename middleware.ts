import { NextResponse, type NextRequest } from "next/server";

/*
 * Despliegue "solo tiempos": cuando TIEMPOS_ONLY está puesto, esta
 * misma app solo deja ver el Estudio de Tiempos. El resto del hub
 * (casos, dashboard, regresos, comunicaciones…) queda bloqueado,
 * también sus APIs, aunque se intente entrar por URL directa.
 * Sin la variable (el hub normal), el middleware no hace nada.
 */
export function middleware(req: NextRequest) {
  if (!process.env.TIEMPOS_ONLY) return NextResponse.next();

  const { pathname } = req.nextUrl;

  const permitido =
    pathname === "/solo-tiempos" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/tiempos" ||
    pathname.startsWith("/api/tiempos/");

  if (permitido) return NextResponse.next();

  // La raíz lleva directo al estudio de tiempos.
  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/solo-tiempos";
    return NextResponse.rewrite(url);
  }

  // Cualquier otra ruta o API del hub no existe en este despliegue.
  return new NextResponse("No encontrado", { status: 404 });
}

export const config = {
  // Todo menos los estáticos de Next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
