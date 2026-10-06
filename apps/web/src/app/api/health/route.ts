import { NextResponse } from "next/server";

/** Sonde de disponibilité (utilisée par la supervision). */
export function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() });
}
