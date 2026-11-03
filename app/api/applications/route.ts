import { NextResponse } from "next/server";
import { listApplications } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ ok: true, applications: await listApplications() });
}
