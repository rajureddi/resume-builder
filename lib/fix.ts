import {
  autoFixResume,
  checkAtsEngine,
  classifyMissingKeywords,
  parseResume,
} from "./ats";
import { getEffectiveSettings, llmJson } from "./llm";
import {
  buildResumeText,
  buildSummary,
  containsTerm,
  detectDomains,
  extractKeywords,
  skillSupported,
  supportedSkillPool,
  trimSummary,
} from "./tailor";
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

const TEMPLATE_FIXABLE_CHECKS = new Set([
  "f_headings",
  "f_contact_top",
  "s_summary",
  "s_skills",
  "s_projects",
  "s_education",
  "s_certifications",
]);

function sectionBody(text: string, heading: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(
    (l) => l.trim().toUpperCase() === heading.toUpperCase()
  );
  if (start < 0) return "";
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (
      t &&
      t === t.toUpperCase() &&
      t.length >= 4 &&
      t.length <= 30 &&
      /^[A-Z &/]+$/.test(t)
    ) {
      break;
    }
    out.push(lines[i]);
  }
  return out.join("\n").trim();
}

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
      const placed = ensureInProject(existing, libProject);
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
}): Promise<PreparedFix> {
  const { profile, projects } = input;
  const jdText = input.jdText ?? "";
  const before = checkAtsEngine({
    resumeText: input.resumeText,
    jdText,
    sourceType: input.sourceType ?? "paste",
  });
  const missing = classifyMissingKeywords({
    resumeText: input.resumeText,
    jdText,
    result: before,
    profile,
    projects,
  });
  const addable = missing.filter((m) => m.addable);
  const gaps = missing.filter((m) => !m.addable);

  const pool = supportedSkillPool(profile, projects);
  const { fixedText, fixes: textFixes } = autoFixResume({
    resumeText: input.resumeText,
    jdText,
    supportedSkills: pool,
  });

  const templateFixable = before.categories
    .filter((c) => c.id !== "keywords")
    .flatMap((c) => c.checks)
    .filter((c) => c.status !== "pass" && TEMPLATE_FIXABLE_CHECKS.has(c.id));

  const manualSuggestions = before.issues
    .slice(0, 5)
    .map((i) => `${i.label} — ${i.fix}`);

  if (addable.length === 0 && textFixes.length === 0 && templateFixable.length === 0) {
    return {
      report: {
        improved: false,
        beforeScore: before.score,
        afterScore: before.score,
        fixes: [],
        remainingGaps: gaps,
        manualSuggestions: [
          ...gaps.map(
            (g) =>
              `True gap: ${g.keyword} (${g.points} pts) — no evidence in your profile or projects. Learn it or build a project with it before claiming it.`
          ),
          ...manualSuggestions,
        ],
        message:
          "Nothing can be added truthfully — every missing item is a true gap or needs your input. See the suggestions below; your resume was left unchanged.",
      },
      applicationPayload: null,
      afterResult: null,
    };
  }

  /* ── Build the fixed resume as a structured application ─────────── */
  const base = input.baseApplication ?? null;
  let summary: string;
  let skills: string[];
  let tailoredProjects: TailoredProject[];

  if (base) {
    summary = base.summary;
    skills = [...base.skills];
    tailoredProjects = base.projects.map((p) => ({
      ...p,
      bullets: [...p.bullets],
    }));
  } else {
    const parsedSummary = sectionBody(fixedText, "PROFESSIONAL SUMMARY");
    summary =
      parsedSummary.length > 40 ? parsedSummary.replace(/\s*\n\s*/g, " ") : profile.summary;
    const parsedSkills = sectionBody(fixedText, "TECHNICAL SKILLS")
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && s.length <= 30);
    const flatProfileSkills = profile.skillGroups.flatMap((g) => g.items);
    skills = parsedSkills.length >= 4 ? parsedSkills : [...flatProfileSkills];

    tailoredProjects = [];
    for (const p of projects) {
      const short = p.title.split("—")[0].trim();
      if (
        containsTerm(fixedText, p.title) ||
        (short.length >= 6 && containsTerm(fixedText, short))
      ) {
        tailoredProjects.push({
          projectId: p.id,
          title: p.title,
          tech: p.tags.slice(0, 6).join(", "),
          bullets: [...p.bullets],
          github: p.github,
        });
      }
      if (tailoredProjects.length >= 4) break;
    }
    if (tailoredProjects.length === 0) {
      const parsed = parseResume(input.resumeText);
      tailoredProjects = parsed.projectLines.slice(0, 4).map((line, i) => ({
        projectId: `ext-${i}`,
        title: line,
        tech: "",
        bullets: [],
        github: "",
      }));
    }
  }

  // Place every addable keyword: Technical Skills first, then projects.
  const placementNotes = new Map<string, string>();
  for (const item of addable) {
    if (!skills.some((s) => containsTerm(s, item.keyword) || containsTerm(item.keyword, s))) {
      skills.push(item.keyword);
    }
    const note = placeKeywordInProjects(tailoredProjects, projects, item);
    if (note) placementNotes.set(item.keyword, note);
  }
  // Skills front-loaded with the added JD keywords (ATS reads top-down).
  const addedSet = new Set(addable.map((a) => a.keyword.toLowerCase()));
  skills = [
    ...skills.filter((s) => addedSet.has(s.toLowerCase())),
    ...skills.filter((s) => !addedSet.has(s.toLowerCase())),
  ];

  /* Fresh per-role summary for THIS fixed resume — composed from the
     JD's role/domain, the truthfully claimable JD keywords and the
     projects now on the resume. Never the profile's static summary and
     never the base resume's old summary copied over. */
  const { primary: jdPrimary, secondary: jdSecondary } = detectDomains(jdText);
  const summaryKeywords = extractKeywords(jdText).filter((k) =>
    skillSupported(k, pool)
  );
  // Name first the projects that evidence the most of this JD's keywords.
  const summaryTitles = [...tailoredProjects]
    .sort(
      (a, b) =>
        summaryKeywords.filter((k) =>
          containsTerm(`${b.title} ${b.tech} ${b.bullets.join(" ")}`, k)
        ).length -
        summaryKeywords.filter((k) =>
          containsTerm(`${a.title} ${a.tech} ${a.bullets.join(" ")}`, k)
        ).length
    )
    .map((t) => t.title);
  summary = trimSummary(
    buildSummary(
      profile,
      base?.role ?? "",
      base?.domainPrimary ?? jdPrimary,
      skills,
      summaryTitles,
      {
        keywords: summaryKeywords,
        secondary: base?.domainSecondary ?? jdSecondary,
      }
    )
  );

  const role = base?.role ?? "Auto-Fixed Resume";
  let appText = buildResumeText(profile, {
    summary,
    skills,
    projects: tailoredProjects,
    role,
  });

  /* ── Optional LLM weave: make added keywords read naturally in the
        affected bullets. Strictly validated; any failure keeps the
        rule-based version. Never blocks the fix. ──────────────────── */
  const settings = await getEffectiveSettings().catch(() => null);
  if (settings?.apiKey && addable.length > 0) {
    const affected = tailoredProjects.filter((p) =>
      addable.some(
        (a) =>
          containsTerm(p.tech, a.keyword) ||
          p.bullets.some((b) => containsTerm(b, a.keyword))
      )
    );
    if (affected.length) {
      const llm = await llmJson<{ bullets?: Record<string, string[]> }>({
        system:
          "You polish resume bullets. Rules: use ONLY the facts given — never invent a skill, tool or metric. Keep every keyword you are told to keep inside that project's bullets. Reply with strict JSON only: {\"bullets\": {\"<projectId>\": string[]}}. Each bullet starts with a strong action verb and stays under 28 words.",
        user: JSON.stringify({
          keepKeywords: addable.map((a) => a.keyword),
          projects: affected.map((p) => ({
            projectId: p.projectId,
            title: p.title,
            tech: p.tech,
            bullets: p.bullets,
          })),
        }),
        timeoutMs: 30000,
        maxTokens: 1600,
      }).catch(() => null);
      if (llm?.bullets) {
        for (const p of affected) {
          const proposed = llm.bullets[p.projectId];
          if (
            Array.isArray(proposed) &&
            proposed.length > 0 &&
            proposed.every((x) => typeof x === "string" && x.trim().length > 10)
          ) {
            const mustKeep = addable
              .map((a) => a.keyword)
              .filter(
                (kw) =>
                  containsTerm(p.tech, kw) ||
                  p.bullets.some((b) => containsTerm(b, kw))
              );
            const keepsAll = mustKeep.every((kw) =>
              proposed.some((b) => containsTerm(b, kw))
            );
            if (keepsAll) p.bullets = proposed.map((x) => x.trim());
          }
        }
        appText = buildResumeText(profile, {
          summary,
          skills,
          projects: tailoredProjects,
          role,
        });
      }
    }
  }

  const after = checkAtsEngine({
    resumeText: appText,
    jdText,
    sourceType: "saved",
  });
  const delta = after.score - before.score;

  /* ── Per-fix points ─────────────────────────────────────────────────
     Keyword fixes start from their classification points; structural
     fixes take the exact points their check recovered (before→after
     diff, excluding the keyword category). The list is then reconciled
     so the points sum EXACTLY to the measured score delta. */
  const fixes: FixEntry[] = [];
  for (const item of addable) {
    const note = placementNotes.get(item.keyword);
    fixes.push({
      label: note
        ? `Added "${item.keyword}" — Technical Skills + ${note}`
        : `Added "${item.keyword}" to Technical Skills (from ${item.evidence ?? "your profile"})`,
      points: item.points,
      kind: "keyword",
      keyword: item.keyword,
    });
  }
  const beforeChecks = new Map(
    before.categories.flatMap((c) => c.checks.map((x) => [x.id, x] as const))
  );
  for (const cat of after.categories) {
    if (cat.id === "keywords") continue;
    for (const c of cat.checks) {
      const b = beforeChecks.get(c.id);
      if (b && c.points > b.points) {
        fixes.push({
          label: `Fixed: ${c.label}`,
          points: c.points - b.points,
          kind: "structure",
        });
      }
    }
  }

  if (fixes.length > 0) {
    // Reconcile in tenths so displayed points sum exactly to the delta.
    const targetTenths = Math.round(delta * 10);
    let tenths = fixes.map((f) => Math.round(f.points * 10));
    let diff = targetTenths - tenths.reduce((a, b) => a + b, 0);
    const order = fixes
      .map((_, i) => i)
      .sort((a, b) => tenths[b] - tenths[a]);
    let guard = 0;
    while (diff !== 0 && guard++ < 10000) {
      let progressed = false;
      for (const i of order) {
        if (diff === 0) break;
        if (diff > 0) {
          tenths[i] += 1;
          diff -= 1;
          progressed = true;
        } else if (tenths[i] > 0) {
          tenths[i] -= 1;
          diff += 1;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    fixes.forEach((f, i) => {
      f.points = tenths[i] / 10;
    });
    fixes.sort((a, b) => b.points - a.points);
  }

  const { primary, secondary } = detectDomains(jdText);
  const baseLabel = base
    ? base.company
    : (input.resumeName ?? "Resume").replace(/\s*\((Auto-)?Fixed\)\s*$/i, "");
  const payload: Omit<Application, "id" | "createdAt" | "status"> = {
    company: `Auto-Fixed — ${baseLabel}`,
    role,
    domainPrimary: base?.domainPrimary ?? primary,
    domainSecondary: base?.domainSecondary ?? secondary,
    jdText,
    summary,
    skills,
    projects: tailoredProjects,
    gaps: gaps.map((g) => g.keyword),
    atsScore: after.score,
    text: appText,
  };

  return {
    report: {
      improved: delta > 0,
      beforeScore: before.score,
      afterScore: after.score,
      fixes,
      remainingGaps: gaps,
      manualSuggestions: [
        ...gaps.map(
          (g) =>
            `True gap: ${g.keyword} (${g.points} pts) — no evidence in your profile or projects. It was NOT added.`
        ),
        ...after.issues
          .slice(0, 4)
          .map((i) => `${i.label} — ${i.fix}`),
      ],
      message:
        delta > 0
          ? `Auto-Fix created a new resume: ${before.score} → ${after.score} (+${delta} pts). Open it from the button below — it prints and saves as PDF like any other resume.`
          : "Auto-Fix built a corrected resume in the standard template, but the score did not rise — the recovered items were offset by rounding or length changes. The new resume was still saved; check the report below.",
    },
    applicationPayload: payload,
    afterResult: after,
  };
}
