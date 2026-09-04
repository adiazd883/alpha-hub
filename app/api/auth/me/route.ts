import { NextRequest, NextResponse } from "next/server";

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

export async function GET(req: NextRequest) {
  const email = req.cookies.get("alpha_hub_email")?.value;

  if (!email) {
    return NextResponse.json({
      authenticated: false,
      email: null,
      role: null,
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const role = USERS[normalizedEmail];

  if (!role) {
    return NextResponse.json({
      authenticated: false,
      email: null,
      role: null,
    });
  }

  return NextResponse.json({
    authenticated: true,
    email: normalizedEmail,
    role,
  });
}
