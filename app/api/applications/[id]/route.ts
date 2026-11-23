import { NextRequest, NextResponse } from "next/server";
import {
  deleteApplication,
  getApplication,
  updateApplication,
  getProfile,
} from "@/lib/db";
import { checkAtsEngine } from "@/lib/ats";
import { buildResumeText } from "@/lib/tailor";
import { resumeProfile } from "@/lib/resumeContent";
import type { Application, ResumeTemplate } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const application = await getApplication(id);
  if (!application) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, application });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid resume changes" }, { status: 400 });
  const current = await getApplication(id);
  if (!current) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  const changes: Partial<Application> = {};
  if (body.status !== undefined) {
    if (!["Saved", "Applied", "Interview", "Offer", "Rejected"].includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    changes.status = body.status;
  }
  if (body.summary !== undefined) {
    if (typeof body.summary !== "string" || body.summary.length > 2000) return NextResponse.json({ error: "Summary must be text under 2,000 characters" }, { status: 400 });
    changes.summary = body.summary.trim();
  }
  if (body.skills !== undefined) {
    if (!Array.isArray(body.skills) || body.skills.length > 60 || !body.skills.every((skill: unknown) => typeof skill === "string" && skill.length <= 80)) return NextResponse.json({ error: "Use up to 60 skills, each under 80 characters" }, { status: 400 });
    changes.skills = [...new Set<string>(body.skills.map((skill: string) => skill.trim()).filter(Boolean))];
  }
  if (body.resumeTemplate !== undefined) {
    if (!["classic", "modern", "compact"].includes(body.resumeTemplate)) return NextResponse.json({ error: "Invalid layout" }, { status: 400 });
    changes.resumeTemplate = body.resumeTemplate as ResumeTemplate;
  }
  if (body.skillGroups !== undefined) {
    if (!Array.isArray(body.skillGroups) || body.skillGroups.length > 10 || !body.skillGroups.every((group: { label?: unknown; items?: unknown }) => group && typeof group.label === "string" && group.label.trim().length > 0 && group.label.length <= 40 && Array.isArray(group.items) && group.items.every((item: unknown) => typeof item === "string" && item.length <= 80))) return NextResponse.json({ error: "Invalid skill categories" }, { status: 400 });
    changes.skillGroups = body.skillGroups.map((group: { label: string; items: string[] }) => ({ label: group.label.trim(), items: [...new Set(group.items.map(item => item.trim()).filter(Boolean))] }));
    changes.skills = [...new Set(changes.skillGroups!.flatMap(group => group.items))];
    if (changes.skills.length > 60) return NextResponse.json({ error: "Use up to 60 technical skills" }, { status: 400 });
  }
  if (body.interests !== undefined) {
    if (!Array.isArray(body.interests) || body.interests.length > 10 || !body.interests.every((item: unknown) => typeof item === "string" && item.length <= 80)) return NextResponse.json({ error: "Invalid interests" }, { status: 400 });
    changes.interests = body.interests.map((item: string) => item.trim()).filter(Boolean);
  }
  if (body.skillLayout !== undefined) {
    if (!["stacked", "columns"].includes(body.skillLayout)) return NextResponse.json({ error: "Invalid skills layout" }, { status: 400 });
    changes.skillLayout = body.skillLayout;
  }
  for (const field of ["showContactIcons", "showSectionRules"] as const) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "boolean") return NextResponse.json({ error: "Invalid display setting" }, { status: 400 });
      changes[field] = body[field];
    }
  }
  if (!Object.keys(changes).length) return NextResponse.json({ error: "No resume changes received" }, { status: 400 });
  if (Object.keys(changes).some(key => key !== "status")) {
    changes.profileSnapshot = resumeProfile(current, await getProfile());
    const edited = { ...current, ...changes };
    changes.text = buildResumeText(changes.profileSnapshot, edited);
    changes.atsScore = checkAtsEngine({ resumeText: changes.text, jdText: current.jdText, sourceType: "saved" }).score;
  }
  const application = await updateApplication(id, changes);
  return NextResponse.json({ ok: true, application });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const removed = await deleteApplication(id);
  return NextResponse.json({ ok: removed });
}
