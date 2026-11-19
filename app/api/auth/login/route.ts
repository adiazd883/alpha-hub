import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/app-url";

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing GOOGLE_CLIENT_ID" },
      { status: 500 }
    );
  }

  const redirectUri = `${appOrigin(req)}/api/auth/callback/google`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
