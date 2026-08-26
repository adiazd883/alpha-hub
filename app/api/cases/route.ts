import { NextResponse } from "next/server";
import { readCases } from "@/lib/sheets";

export async function GET() {
  try {
    return NextResponse.json(await readCases());
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
