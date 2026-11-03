import { NextRequest, NextResponse } from "next/server";
import {
  addProjectIdea,
  getProfile,
  listProjectIdeas,
  listProjects,
} from "@/lib/db";
import { recordIdeasForJd } from "@/lib/ideas";
import { analyzeJobRules } from "@/lib/tailor";

// Build Later ideas: JD themes the project library does not cover yet.
// Ideas are NOT projects — nothing in resume building / ATS / Auto-Fix
// reads this list. Convert (…/[id]/convert) is the only way an idea
// becomes a real project.

export async function GET() {
  return NextResponse.json({ ok: true, ideas: await listProjectIdeas() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    jdText?: string;
    company?: string;
    role?: string;
    title?: string;
    description?: string;
    keywords?: string[];
    domain?: string;
  };

  // Add-from-analysis mode: run the same uncovered-theme detection the
  // analyse flow uses and persist whatever is new (deduped by theme).
  if (body.jdText && body.jdText.trim().length >= 30) {
    const [profile, projects] = await Promise.all([
      getProfile(),
      listProjects(),
    ]);
    const analysis = analyzeJobRules(body.jdText, profile, projects);
    const added = await recordIdeasForJd({
      jdText: body.jdText,
      analysis,
      projects,
      company: body.company,
      role: body.role,
    });
    return NextResponse.json({
      ok: true,
      added,
      ideas: await listProjectIdeas(),
    });
  }

  // Manual add mode.
  if (body.title && body.title.trim()) {
    const title = body.title.trim();
    const created = await addProjectIdea({
      theme: `manual-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title,
      description: body.description?.trim() ?? "",
      keywords: (body.keywords ?? []).filter(
        (k): k is string => typeof k === "string" && k.trim().length > 0
      ),
      domain: body.domain?.trim() ?? "",
      sourceCompany: body.company?.trim() ?? "",
      sourceRole: body.role?.trim() ?? "",
    });
    if (!created) {
      return NextResponse.json(
        { ok: false, error: "An idea with this theme already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, idea: created });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Provide a job description (jdText) to analyse, or a title to add an idea manually.",
    },
    { status: 400 }
  );
}
