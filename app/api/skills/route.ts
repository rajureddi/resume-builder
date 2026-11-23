import { NextRequest, NextResponse } from "next/server";
import { getProfile, saveProfileSkills } from "@/lib/db";
import { validSkillGroups } from "@/lib/profileValidation";

export async function GET() { return NextResponse.json({ skillGroups: (await getProfile()).skillGroups }); }

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !validSkillGroups(body.skillGroups)) return NextResponse.json({ error: "Use labelled skill categories with up to 100 skills in total." }, { status: 400 });
  const profile = await saveProfileSkills(body.skillGroups.map((group: import("@/lib/types").SkillGroup) => ({ label: group.label.trim(), items: [...new Set(group.items.map(item => item.trim()).filter(Boolean))] })));
  return NextResponse.json({ ok: true, profile, skillGroups: profile.skillGroups });
}
