import { withStudioData } from "@/lib/requestDb";
import { NextRequest, NextResponse } from "next/server";
import { createApplication, getProfile, listProjects } from "@/lib/db";
import { checkAtsEngine } from "@/lib/ats";
import { recordIdeasForJd } from "@/lib/ideas";
import { getEffectiveSettings, llmJson } from "@/lib/llm";
import { DOMAINS, analyzeJobRules, buildResumeText, extractKeywords, rankProjects, supportedSkillPool, tailorRules, trimSummary } from "@/lib/tailor";
import { projectForVariant, distinctBullets, projectRewriteBullets, validRewrittenBullets } from "@/lib/projectContent";
import { validStrings } from "@/lib/profileValidation";
import { containsTerm } from "@/lib/terms";
import { RESUME_REWRITE_PROMPT } from "@/lib/resumePrompts";
import type { Analysis } from "@/lib/types";

export const maxDuration = 60;

async function handlePOST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.company !== "string" || !body.company.trim() || typeof body.role !== "string" || !body.role.trim() || typeof body.jdText !== "string" || body.jdText.trim().length < 30 || body.jdText.length > 20000) {
    return NextResponse.json({ error: "Enter a company, role and a complete job description." }, { status: 400 });
  }
  for (const field of ["selectedProjectIds", "selectedSkills", "selectedExperienceIds"]) {
    if (body[field] !== undefined && !validStrings(body[field], field === "selectedSkills" ? 60 : 30, 100)) return NextResponse.json({ error: "Invalid resume selections." }, { status: 400 });
  }
  if (body.projectVariants !== undefined && (!body.projectVariants || typeof body.projectVariants !== "object" || Array.isArray(body.projectVariants) || !Object.values(body.projectVariants).every(id => typeof id === "string" && id.length <= 100))) return NextResponse.json({ error: "Invalid project stack versions." }, { status: 400 });
  const [profile, projects] = await Promise.all([getProfile(), listProjects()]);
  if (body.selectedProjectIds?.some((id: string) => !projects.some(project => project.id === id)) || body.selectedExperienceIds?.some((id: string) => !profile.experience?.some(item => item.id === id))) return NextResponse.json({ error: "A selected project or experience entry is no longer available." }, { status: 400 });
  for (const [id, variant] of Object.entries(body.projectVariants ?? {})) {
    const project = projects.find(project => project.id === id);
    if (!project || variant && !project.stackVariants?.some(item => item.id === variant)) return NextResponse.json({ error: "A selected project stack version is no longer available." }, { status: 400 });
  }
  let analysis = analyzeJobRules(body.jdText, profile, projects, body.role);
  const refined = body.analysis;
  if (refined && DOMAINS.includes(refined.domainPrimary) && validStrings(refined.keywords, 100, 60)) {
    const keywords = refined.keywords.filter((keyword: string) => keyword.trim() && containsTerm(`${body.role}\n${body.jdText}`, keyword));
    const secondary = DOMAINS.includes(refined.domainSecondary) ? refined.domainSecondary : null;
    if (keywords.length) analysis = { ...analysis, domainPrimary: refined.domainPrimary, domainSecondary: secondary, keywords, rankedProjects: rankProjects(projects, refined.domainPrimary, secondary, keywords), engine: refined.engine === "llm" ? "llm" : "rules" } as Analysis;
  }
  const tailored = tailorRules({
    company: body.company.trim(), role: body.role.trim(), jdText: body.jdText, profile, projects, analysis,
    selectedProjectIds: body.selectedProjectIds, projectVariants: body.projectVariants,
    selectedSkills: body.selectedSkills, selectedExperienceIds: body.selectedExperienceIds,
  });
  const settings = await getEffectiveSettings(body.llmSettings);
  if (settings.apiKey && (tailored.projects.length || tailored.experience?.length)) {
    const llm = await llmJson<{ summary?: string; bullets?: Record<string, string[]>; experienceBullets?: Record<string, string[]> }>({
      system: RESUME_REWRITE_PROMPT,
      user: JSON.stringify({
        role: body.role, company: body.company, jdText: body.jdText, jobRequirements: analysis.keywords,
        candidate: { title: profile.title, education: profile.education, skills: supportedSkillPool(profile, projects) },
        resumeSkills: tailored.skills, currentSummary: tailored.summary,
        projects: tailored.projects.map(project => {
          const source = projectForVariant(projects.find(item => item.id === project.projectId)!, project.variantId);
          return { projectId: project.projectId, title: source.title, stack: source.tags, description: source.description, sourceBullets: source.bullets, currentBullets: project.bullets };
        }),
        experience: tailored.experience,
      }),
      timeoutMs: 25000, maxTokens: 3000, settings,
    });
    if (llm) {
      if (typeof llm.summary === "string" && llm.summary.trim().length > 40) { tailored.summary = trimSummary(llm.summary); tailored.generationSource = "ai"; }
      for (const project of tailored.projects) {
        const source = projectForVariant(projects.find(item => item.id === project.projectId)!, project.variantId);
        const proposed = llm.bullets?.[project.projectId];
        if (validRewrittenBullets(source, proposed, extractKeywords(Array.isArray(proposed) ? proposed.filter(value => typeof value === "string").join(" ") : ""))) { project.bullets = projectRewriteBullets(source, proposed, body.role, analysis.keywords); tailored.generationSource = "ai"; }
      }
      for (const item of tailored.experience ?? []) {
        const proposed = llm.experienceBullets?.[item.id];
        const source = { id: item.id, title: item.title, year: "", description: item.bullets.join(" "), tags: item.skills, domains: [], github: "", bullets: item.bullets };
        if (validRewrittenBullets(source, proposed, extractKeywords(Array.isArray(proposed) ? proposed.filter(value => typeof value === "string").join(" ") : ""), 1)) { item.bullets = distinctBullets(proposed); tailored.generationSource = "ai"; }
      }
    }
  }
  tailored.summary = trimSummary(tailored.summary);
  tailored.text = buildResumeText(profile, tailored);
  tailored.atsScore = checkAtsEngine({ resumeText: tailored.text, jdText: body.jdText, sourceType: "saved" }).score;
  const application = await createApplication(tailored);
  const ideasAdded = await recordIdeasForJd({ jdText: body.jdText, analysis, projects, company: body.company, role: body.role }).catch(() => []);
  return NextResponse.json({ ok: true, application, ideasAdded });
}

export const POST = withStudioData(handlePOST);
