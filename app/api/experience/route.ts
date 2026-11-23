import { NextRequest, NextResponse } from "next/server";
import { getProfile, saveExperience } from "@/lib/db";
import { validExperience } from "@/lib/profileValidation";

export async function GET() { return NextResponse.json({ experience: (await getProfile()).experience ?? [] }); }

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !validExperience(body.experience)) return NextResponse.json({ error: "Add a role, company, valid dates and bullet points for each experience entry." }, { status: 400 });
  const profile = await saveExperience(body.experience.map((item: import("@/lib/types").ExperienceItem) => ({ ...item, title: item.title.trim(), company: item.company.trim(), bullets: item.bullets.map(bullet => bullet.trim()).filter(Boolean), skills: [...new Set(item.skills.map(skill => skill.trim()).filter(Boolean))] })));
  return NextResponse.json({ ok: true, profile, experience: profile.experience });
}
