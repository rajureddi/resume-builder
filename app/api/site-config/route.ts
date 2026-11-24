import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ authEnabled: !!process.env.APP_PASSWORD });
}
