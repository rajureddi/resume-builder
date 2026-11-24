import { withStudioData } from "@/lib/requestDb";
import { NextResponse } from "next/server";
import { listAtsChecks } from "@/lib/db";

async function handleGET() {
  const checks = await listAtsChecks();
  // History list omits the full resume text to keep the payload light.
  const light = checks.map(({ resumeText, jdText, ...rest }) => ({
    ...rest,
    hasJd: jdText.trim().length > 0,
  }));
  return NextResponse.json({ ok: true, checks: light });
}

export const GET = withStudioData(handleGET);
