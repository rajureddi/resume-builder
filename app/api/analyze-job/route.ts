import { withStudioData } from "@/lib/requestDb";
import { NextRequest, NextResponse } from "next/server";
import { getProfile, listProjects } from "@/lib/db";
import { recordIdeasForJd } from "@/lib/ideas";
import { getEffectiveSettings, llmJson } from "@/lib/llm";
import {
  DOMAINS,
  analyzeJobRules,
  rankProjects,
} from "@/lib/tailor";
import type { Analysis } from "@/lib/types";

export const maxDuration = 60;

async function handlePOST(req: NextRequest) {
  const { jdText, company, role, llmSettings } = (await req.json().catch(() => ({}))) as {
    jdText?: string;
    company?: string;
    role?: string;
    llmSettings?: unknown;
  };
  if (!jdText || jdText.trim().length < 30) {
    return NextResponse.json(
      { ok: false, error: "Paste the full job description first (at least a few lines)." },
      { status: 400 }
    );
  }
  const [profile, projects] = await Promise.all([getProfile(), listProjects()]);
  let analysis: Analysis = analyzeJobRules(jdText, profile, projects, role);

  // Optional LLM refinement — any failure silently keeps the rule result.
  const settings = await getEffectiveSettings(llmSettings);
  if (settings.apiKey) {
    const llm = await llmJson<{
      domainPrimary?: string;
      domainSecondary?: string | null;
      keywords?: string[];
    }>({
      system:
        "You analyse job descriptions for a resume builder. Reply with strict JSON only: {\"domainPrimary\": string, \"domainSecondary\": string|null, \"keywords\": string[]}. Domains must be one of: " +
        DOMAINS.join(", ") +
        ". Keywords are the exact technical skills/terms named in the JD.",
      user: jdText.slice(0, 6000),
      timeoutMs: 20000,
      maxTokens: 800,
      settings,
    });
    if (
      llm &&
      llm.domainPrimary &&
      DOMAINS.includes(llm.domainPrimary) &&
      Array.isArray(llm.keywords)
    ) {
      const keywords = llm.keywords.filter(
        (k): k is string => typeof k === "string" && k.length <= 40
      );
      analysis = {
        domainPrimary: llm.domainPrimary,
        domainSecondary:
          llm.domainSecondary && DOMAINS.includes(llm.domainSecondary)
            ? llm.domainSecondary
            : analysis.domainSecondary,
        keywords: keywords.length ? keywords : analysis.keywords,
        mustHave: analysis.mustHave,
        rankedProjects: rankProjects(
          projects,
          llm.domainPrimary,
          llm.domainSecondary ?? analysis.domainSecondary,
          keywords.length ? keywords : analysis.keywords
        ),
        engine: "llm",
      };
    }
  }

  // Build Later: if this JD leans on a theme the project library does
  // not cover, record one idea for it (deduped by theme). Ideas are
  // suggestions only — they never feed back into this analysis, any
  // resume, or ATS evidence.
  const ideasAdded = await recordIdeasForJd({
    jdText,
    analysis,
    projects,
    company,
    role,
  }).catch(() => []);

  return NextResponse.json({ ok: true, analysis, ideasAdded });
}

export const POST = withStudioData(handlePOST);
