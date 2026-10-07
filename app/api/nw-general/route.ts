import { NextResponse } from "next/server";
import { readSheetCases } from "@/lib/sheets";

export async function GET() {
  try {
    return NextResponse.json(await readSheetCases("NW GENERAL"));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
