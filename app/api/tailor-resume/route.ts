import { NextRequest, NextResponse } from "next/server";
import { createApplication, getProfile, listProjects } from "@/lib/db";
import { checkAtsEngine } from "@/lib/ats";
import { recordIdeasForJd } from "@/lib/ideas";
import { getEffectiveSettings, llmJson } from "@/lib/llm";
import {
  analyzeJobRules,
  buildResumeText,
  tailorRules,
  trimSummary,
} from "@/lib/tailor";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    company?: string;
    role?: string;
    jdText?: string;
    selectedProjectIds?: string[];
  };
  if (!body.company || !body.role || !body.jdText) {
    return NextResponse.json(
      { ok: false, error: "Company, role and job description are all required." },
      { status: 400 }
    );
  }
  const [profile, projects] = await Promise.all([getProfile(), listProjects()]);

  const tailored = tailorRules({
    company: body.company,
    role: body.role,
    jdText: body.jdText,
    profile,
    projects,
    selectedProjectIds: body.selectedProjectIds,
  });

  // Optional LLM rewrite of summary + bullets. Guardrails: only the project
  // ids we selected, only non-empty strings; skills order never comes from
  // the LLM, so no skill can be invented here.
  const settings = await getEffectiveSettings();
  if (settings.apiKey && tailored.projects.length) {
    const llm = await llmJson<{
      summary?: string;
      bullets?: Record<string, string[]>;
    }>({
      system:
        "You rewrite resume content for one specific job. Rules: use ONLY the facts, skills and projects provided — never invent a skill, tool, employer or metric. Reply with strict JSON only: {\"summary\": string, \"bullets\": {\"<projectId>\": string[]}}. The summary MUST be short: 3–4 sentences, 55–75 words total — never a long paragraph. Keep each bullet starting with a strong action verb and under 28 words.",
      user: JSON.stringify({
        role: body.role,
        company: body.company,
        domain: tailored.domainPrimary,
        jdKeywords: tailored.gaps.concat(tailored.skills.slice(0, 10)),
        currentSummary: tailored.summary,
        projects: tailored.projects.map((p) => ({
          projectId: p.projectId,
          title: p.title,
          tech: p.tech,
          bullets: p.bullets,
        })),
      }),
      timeoutMs: 45000,
      maxTokens: 2200,
    });
    if (llm) {
      if (typeof llm.summary === "string" && llm.summary.trim().length > 40) {
        tailored.summary = llm.summary.trim();
      }
      if (llm.bullets) {
        for (const p of tailored.projects) {
          const b = llm.bullets[p.projectId];
          if (
            Array.isArray(b) &&
            b.length &&
            b.every((x) => typeof x === "string" && x.trim().length > 10)
          ) {
            p.bullets = b.map((x) => x.trim());
          }
        }
      }
      tailored.text = buildResumeText(profile, tailored);
    }
  }

  // HARD summary cap (rules + LLM alike): at most 4 sentences before the
  // application is saved. If the cap changed the text, rebuild the
  // resume text so the stored text matches the stored summary.
  const cappedSummary = trimSummary(tailored.summary);
  if (cappedSummary !== tailored.summary) {
    tailored.summary = cappedSummary;
    tailored.text = buildResumeText(profile, tailored);
  }

  const ats = checkAtsEngine({
    resumeText: tailored.text,
    jdText: body.jdText,
    sourceType: "saved",
  });
  tailored.atsScore = ats.score;

  const application = await createApplication(tailored);

  // Build Later: record an idea for any JD theme the library does not
  // cover (deduped by theme; normally already added at analyse time, so
  // this is a no-op then). Ideas never appear in the resume just built.
  const ideasAdded = await recordIdeasForJd({
    jdText: body.jdText,
    analysis: analyzeJobRules(body.jdText, profile, projects),
    projects,
    company: body.company,
    role: body.role,
  }).catch(() => []);

  return NextResponse.json({ ok: true, application, ideasAdded });
}
