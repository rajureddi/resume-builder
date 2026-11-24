import { withStudioData } from "@/lib/requestDb";
import { NextRequest, NextResponse } from "next/server";
import { saveProfile } from "@/lib/db";
import type { Profile } from "@/lib/types";

async function handlePUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Profile | null;
  if (!body || !body.name || !body.email) {
    return NextResponse.json(
      { ok: false, error: "Profile needs at least a name and an email." },
      { status: 400 }
    );
  }
  const saved = await saveProfile(body);
  return NextResponse.json({ ok: true, profile: saved });
}

export const PUT = withStudioData(handlePUT);
