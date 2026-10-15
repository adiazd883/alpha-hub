import { NextRequest, NextResponse } from "next/server";
import { USERS } from "@/lib/auth";

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
