import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const response = NextResponse.redirect(
    new URL("/", req.url)
  );

  response.cookies.delete("alpha_hub_email");
  response.cookies.delete("alpha_hub_role");

  return response;
}
