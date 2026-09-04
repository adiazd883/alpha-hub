import { NextResponse } from "next/server";

export async function GET() {
  const response = NextResponse.json({
    authenticated: false,
    email: null,
    role: null,
  });

  // Las cookies HttpOnly no se pueden leer desde el navegador,
  // pero sí desde una ruta del servidor.
  const cookieHeader = response.headers.get("set-cookie");

  return response;
}
