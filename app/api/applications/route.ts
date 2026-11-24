import { withStudioData } from "@/lib/requestDb";
import { NextResponse } from "next/server";
import { listApplications } from "@/lib/db";

async function handleGET() {
  return NextResponse.json({ ok: true, applications: await listApplications() });
}

export const GET = withStudioData(handleGET);
