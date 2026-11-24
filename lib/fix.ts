import {
  checkAtsEngine,
  classifyMissingKeywords,
} from "./ats";
import { getEffectiveSettings, llmJson } from "./llm";
import {
  buildResumeText,
  buildSummary,
  containsTerm,
  detectDomains,
  extractKeywords,
  skillSupported,
  trimSummary,
} from "./tailor";
import { profileFromResumeText, resumeProfile, resumeSections } from "./resumeContent";
import { canonicalProject, distinctBullets, parseProjectBlocks, projectForVariant, roleProjectBullets, validRewrittenBullets } from "./projectContent";
import { RESUME_REWRITE_PROMPT } from "./resumePrompts";
import type {
  Application,
  AtsResult,
  FixEntry,
  FixReport,
  MissingItem,
  Profile,
  Project,
  TailoredProject,
} from "./types";

/* ── Auto-Fix that creates a real, saved resume ─────────────────────────
   Flow: score the original → classify missing keywords into addable
   (evidenced in the profile / project library) vs true gaps → build a
   NEW structured resume in the standard template with every addable
   keyword placed into Technical Skills and into the evidencing
   project's tech stack / bullets → re-score → attribute the measured
   score delta back to each fix so per-fix points sum exactly to it.
   A skill with no profile evidence is NEVER added. */

function descriptionBullet(project: Project, keyword: string): string | null {
  const sentence = project.description
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .find((s) => containsTerm(s, keyword));
  if (!sentence) return null;
  const clean = sentence.replace(/\s+/g, " ").trim();
  return clean.endsWith(".") ? clean.slice(0, -1) : clean;
}

/** Place one addable keyword into the tailored project list. Mutates the
 *  list; returns a placement note, or null if it could not be placed in
 *  any project (it still goes into Technical Skills). */
function placeKeywordInProjects(
  tailored: TailoredProject[],
  library: Project[],
  item: MissingItem
): string | null {
  const kw = item.keyword;
  const libProject = item.projectId
    ? library.find((p) => p.id === item.projectId)
    : undefined;

  const ensureInProject = (tp: TailoredProject, src: Project): string => {
    let placed = "";
    if (!containsTerm(tp.tech, kw)) {
      tp.tech = tp.tech ? `${tp.tech}, ${kw}` : kw;
      placed = "tech stack";
    }
    if (!tp.bullets.some((b) => containsTerm(b, kw))) {
      const existing = src.bullets.find((b) => containsTerm(b, kw));
      const derived = existing ?? descriptionBullet(src, kw);
      if (derived) {
        tp.bullets = [...tp.bullets, derived];
        placed = placed ? `${placed} and a project bullet` : "a project bullet";
      }
    }
    return placed;
  };

  if (libProject) {
    const existing = tailored.find((t) => t.projectId === libProject.id);
    if (existing) {
      const source = projectForVariant(libProject, existing.variantId);
      if (!containsTerm(`${source.tags.join(" ")} ${source.description} ${source.bullets.join(" ")}`, kw)) return null;
      const placed = ensureInProject(existing, source);
      return placed ? `${libProject.title} (${placed})` : libProject.title;
    }
    if (tailored.length < 5) {
      const tp: TailoredProject = {
        projectId: libProject.id,
        title: libProject.title,
        tech: libProject.tags.slice(0, 6).join(", "),
        bullets: [...libProject.bullets],
        github: libProject.github,
      };
      const placed = ensureInProject(tp, libProject);
      tailored.push(tp);
      return placed
        ? `${libProject.title} — added to the resume (${placed})`
        : `${libProject.title} — added to the resume`;
    }
  }
  // Keyword evidenced by coursework/skills only, or the evidencing
  // project did not fit — it still lands in Technical Skills.
  return null;
}

export interface PreparedFix {
  report: Omit<FixReport, "applicationId" | "checkId">;
  applicationPayload: Omit<
    Application,
    "id" | "createdAt" | "status"
  > | null;
  afterResult: AtsResult | null;
}

export async function prepareAutoFix(input: {
  resumeText: string;
  jdText: string;
  sourceType?: string;
  resumeName?: string;
  baseApplication?: Application | null;
  profile: Profile;
  projects: Project[];
  additionalSkills?: string[];
  llmSettings?: unknown;
}): Promise<PreparedFix> {
  const { projects } = input;
  const base = input.baseApplication ?? null;
  const profile = base ? resumeProfile(base, input.profile) : profileFromResumeText(input.resumeText, input.profile);
  const jdText = input.jdText ?? "";
  const before = checkAtsEngine({ resumeText: input.resumeText, jdText, sourceType: input.sourceType ?? "paste" });
  const missing = classifyMissingKeywords({ resumeText: input.resumeText, jdText, result: before, profile: input.profile, projects });
  const selected = new Set((input.additionalSkills ?? []).map(skill => skill.toLowerCase()));
  const addable = missing.filter(item => item.addable || selected.has(item.keyword.toLowerCase()));
  const gaps = missing.filter(item => !item.addable && !selected.has(item.keyword.toLowerCase()));
  const sections = resumeSections(input.resumeText);
  let skills = base ? [...base.skills] : (sections.skills ?? []).map(line => line.replace(/^[A-Za-z /&]+:\s*/, "")).join(",").split(/[,\n]/).map(skill => skill.trim()).filter(Boolean);
  if (!skills.length) skills = profile.skillGroups.flatMap(group => group.items);
  const tailoredProjects = (base ? base.projects : parseProjectBlocks(sections.projects ?? [], projects)).map(project => canonicalProject(project, projects));
  const experience = (base?.experience ?? (sections.experience?.length ? [] : input.profile.experience ?? [])).map(item => ({ ...item, skills: [...item.skills], bullets: [...item.bullets] }));
  const additionalSections = base?.additionalSections ?? Object.entries(sections)
    .filter(([key]) => ["experience", "awards"].includes(key))
    .map(([title, lines]) => ({ title: title === "experience" ? "Work Experience" : "Awards", lines }));
  const placements = new Map<string, string>();
  for (const item of addable) {
    if (!skillSupported(item.keyword, skills)) skills.push(item.keyword);
    const placement = placeKeywordInProjects(tailoredProjects, projects, item);
    if (placement) placements.set(item.keyword, placement);
  }
  for (const skill of input.additionalSkills ?? []) if (!skillSupported(skill, skills)) skills.push(skill);
  const keywords = extractKeywords(jdText);
  const score = (skill: string) => keywords.some(keyword => skillSupported(keyword, [skill])) ? 0 : 1;
  skills = [...new Set(skills)].sort((a, b) => score(a) - score(b));
  const sourceFor = (project: TailoredProject): Project => {
    const original = projects.find(item => item.id === project.projectId);
    return original ? projectForVariant(original, project.variantId) : { id: project.projectId, title: project.title, year: "", description: project.bullets[0] ?? "", tags: project.tech.split(",").map(tag => tag.trim()).filter(Boolean), domains: [], github: project.github, bullets: project.bullets };
  };
  for (const project of tailoredProjects) project.bullets = roleProjectBullets(sourceFor(project), base?.role ?? "", keywords);
  const { primary, secondary } = detectDomains(jdText);
  const summaryKeywords = keywords.filter(keyword => skillSupported(keyword, skills));
  let summary = buildSummary(profile, base?.role ?? "", base?.domainPrimary ?? primary, skills, tailoredProjects.map(project => project.title), {
    keywords: summaryKeywords, secondary: base?.domainSecondary ?? secondary,
    projectEvidence: tailoredProjects.flatMap(project => project.bullets),
    experienceCount: experience.length,
  });
  // Editing is useful even with no addable keywords: rewrite the entire
  // summary and improve existing bullets, instead of returning early.
  let generationSource: Application["generationSource"] = "rules";
  const settings = await getEffectiveSettings(input.llmSettings).catch(() => null);
  if (settings?.apiKey) {
    const llm = await llmJson<{ summary?: string; bullets?: Record<string, string[]> }>({
      system: RESUME_REWRITE_PROMPT,
      user: JSON.stringify({ jdText, role: base?.role ?? "", candidate: { title: profile.title, education: profile.education }, skills, currentSummary: base?.summary ?? sections.summary?.join(" "), projects: tailoredProjects.map(project => ({ ...project, description: sourceFor(project).description, sourceBullets: sourceFor(project).bullets })), experience }),
      timeoutMs: 25000,
      maxTokens: 2400,
      settings,
    });
    if (llm) {
      generationSource = "ai";
      if (typeof llm.summary === "string" && llm.summary.trim().length > 30) summary = trimSummary(llm.summary);
      for (const project of tailoredProjects) {
        const proposed = llm.bullets?.[project.projectId];
        if (validRewrittenBullets(sourceFor(project), proposed, extractKeywords(Array.isArray(proposed) ? proposed.filter(value => typeof value === "string").join(" ") : ""))) project.bullets = distinctBullets([roleProjectBullets(sourceFor(project), base?.role ?? "", keywords)[0], ...proposed.slice(1)]);
      }
    }
  }
  summary = trimSummary(summary);
  const role = base?.role ?? "Updated Resume";
  const payload: Omit<Application, "id" | "createdAt" | "status"> = {
    company: `Auto-Fixed — ${base?.company ?? input.resumeName ?? "Resume"}`,
    role, domainPrimary: base?.domainPrimary ?? primary, domainSecondary: base?.domainSecondary ?? secondary,
    jdText, summary, skills, projects: tailoredProjects, additionalSections, experience,
    profileSnapshot: structuredClone(profile), resumeTemplate: base?.resumeTemplate ?? "compact",
    skillGroups: base?.skillGroups, interests: base?.interests, skillLayout: base?.skillLayout,
    showContactIcons: base?.showContactIcons, showSectionRules: base?.showSectionRules,
    generationSource, gaps: gaps.map(item => item.keyword), atsScore: 0, text: "",
  };
  payload.text = buildResumeText(profile, payload);
  const after = checkAtsEngine({ resumeText: payload.text, jdText, sourceType: "saved" });
  payload.atsScore = after.score;
  const fixes: FixEntry[] = [];
  if (summary !== (base?.summary ?? sections.summary?.join(" "))) fixes.push({ label: "Rewrote the professional summary for this job", points: 0, kind: "structure" });
  if (tailoredProjects.some((project, i) => JSON.stringify(project.bullets) !== JSON.stringify(base?.projects[i]?.bullets ?? sections.projects))) fixes.push({ label: "Improved project bullet wording and action verbs", points: 0, kind: "structure" });
  const keywordDelta = (after.categories.find(category => category.id === "keywords")?.score ?? 0) - (before.categories.find(category => category.id === "keywords")?.score ?? 0);
  const totalShares = addable.reduce((sum, item) => sum + item.points, 0);
  for (const item of addable) fixes.push({ label: `Added ${item.keyword}${placements.has(item.keyword) ? ` — ${placements.get(item.keyword)}` : " to Technical Skills"}`, points: totalShares ? Math.round(keywordDelta * item.points / totalShares * 10) / 10 : 0, kind: "keyword", keyword: item.keyword });
  for (const category of after.categories.filter(category => category.id !== "keywords")) {
    for (const check of category.checks) {
      const previous = before.categories.flatMap(category => category.checks).find(item => item.id === check.id);
      if (previous && check.points > previous.points) fixes.push({ label: `Improved ${check.label}`, points: check.points - previous.points, kind: "structure" });
    }
  }
  if (!fixes.length) fixes.push({ label: "Refreshed the resume using the shared PDF layout", points: 0, kind: "structure" });
  const delta = after.score - before.score;
  const adjustment = Math.round((delta - fixes.reduce((sum, fix) => sum + fix.points, 0)) * 10) / 10;
  if (adjustment) fixes.push({ label: "Other scoring and rounding changes", points: adjustment, kind: "structure" });
  return {
    applicationPayload: payload,
    afterResult: after,
    report: {
      improved: delta > 0, beforeScore: before.score, afterScore: after.score, fixes, remainingGaps: gaps,
      manualSuggestions: [...gaps.map(item => `Review ${item.keyword} in the resume editor or add it to your profile.`), ...after.issues.slice(0, 4).map(issue => `${issue.label} — ${issue.fix}`)],
      message: `Updated resume saved. ATS: ${before.score} → ${after.score}. ${generationSource === "ai" ? "AI rewrote the summary and project content." : "Summary, bullet wording and formatting were refreshed."}`,
    },
  };
}
