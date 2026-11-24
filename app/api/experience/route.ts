import { withStudioData } from "@/lib/requestDb";
import { NextRequest, NextResponse } from "next/server";
import { getProfile, saveExperience } from "@/lib/db";
import { validExperience } from "@/lib/profileValidation";

async function handleGET() { return NextResponse.json({ experience: (await getProfile()).experience ?? [] }); }

async function handlePUT(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || !validExperience(body.experience)) return NextResponse.json({ error: "Add a role, company, valid dates and bullet points for each experience entry." }, { status: 400 });
  const profile = await saveExperience(body.experience.map((item: import("@/lib/types").ExperienceItem) => ({ ...item, title: item.title.trim(), company: item.company.trim(), bullets: item.bullets.map(bullet => bullet.trim()).filter(Boolean), skills: [...new Set(item.skills.map(skill => skill.trim()).filter(Boolean))] })));
  return NextResponse.json({ ok: true, profile, experience: profile.experience });
}

export const GET = withStudioData(handleGET);
export const PUT = withStudioData(handlePUT);
