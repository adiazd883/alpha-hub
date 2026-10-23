import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({
      authenticated: false,
      email: null,
      role: null,
      celulas: [],
    });
  }

  return NextResponse.json({
    authenticated: true,
    ...session,
  });
}
