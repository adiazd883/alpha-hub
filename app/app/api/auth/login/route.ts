import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing GOOGLE_CLIENT_ID" },
      { status: 500 }
    );
  }

  const redirectUri =
    "https://alpha-hub-ten.vercel.app/api/auth/callback/google";

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
