import { NextResponse } from "next/server";
import { google } from "googleapis";

const USERS: Record<string, string> = {
  "adiazd@supportmendoza.com": "ADMIN",

  "nrioja@supportmendoza.com": "TL",

  "mponce@supportmendoza.com": "PARALEGAL",
  "camontoya@supportmendoza.com": "PARALEGAL",

  "aramirezd@supportmendoza.com": "PSYCH",
  "fvals@supportmendoza.com": "PSYCH",
  "nmolina@supportmendoza.com": "PSYCH",

  "agonzalezgo@supportmendoza.com": "ANALYST",
  "aramirezc@supportmendoza.com": "ANALYST",
  "hjesus@supportmendoza.com": "ANALYST",

  "bcastellanos@supportmendoza.com": "MANAGER",
  "vperez@supportmendoza.com": "COORDINATOR",
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Missing Google OAuth environment variables");
    }

    const redirectUri =
      "https://alpha-hub-ten.vercel.app/api/auth/callback/google";

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.id_token) {
      throw new Error("Google did not return an ID token");
    }

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: clientId,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error("Could not read Google account");
    }

    const email = String(payload.email || "").toLowerCase().trim();

    if (!email) {
      throw new Error("Google account has no email");
    }

    const role = USERS[email];

    if (!role) {
      return new NextResponse(
        "Acceso denegado. Esta cuenta no está autorizada para Alpha Hub.",
        { status: 403 }
      );
    }

    const response = NextResponse.redirect(
      new URL("/", "https://alpha-hub-ten.vercel.app")
    );

    response.cookies.set("alpha_hub_email", email, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    response.cookies.set("alpha_hub_role", role, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (e) {
    console.error("Google login error:", e);

    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Google authentication failed",
      },
      { status: 500 }
    );
  }
}
