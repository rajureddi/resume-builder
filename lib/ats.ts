import type {
  AtsCategory,
  AtsIssue,
  AtsResult,
  AtsSubCheck,
  MissingItem,
  ParsedResume,
  Profile,
  Project,
} from "./types";
import { containsTerm, extractKeywords, skillSupported } from "./tailor";

const STANDARD_HEADINGS: Record<string, string[]> = {
  summary: ["professional summary", "summary", "profile", "objective", "about"],
  skills: ["technical skills", "skills", "core competencies", "technologies", "tech stack"],
  projects: ["projects", "project experience", "selected projects", "personal projects"],
  experience: ["experience", "work experience", "employment history", "professional experience", "internships"],
  education: ["education", "academic background", "academics"],
  certifications: ["certifications", "certificates", "certification", "licenses"],
};

const ACTION_VERBS = new Set([
  "developed", "built", "designed", "implemented", "created", "engineered",
  "integrated", "optimised", "optimized", "achieved", "delivered", "trained",
  "fine-tuned", "deployed", "automated", "improved", "led", "launched",
  "architected", "programmed", "constructed", "established", "enhanced",
  "reduced", "increased", "analysed", "analyzed", "developed.", "shipped",
  "maintained", "tested", "wrote", "crafted", "enabled", "designed.",
]);

function headingKey(line: string): string | null {
  const clean = line.replace(/[^a-zA-Z ]/g, "").trim().toLowerCase();
  if (!clean || clean.length > 42) return null;
  for (const [key, names] of Object.entries(STANDARD_HEADINGS)) {
    if (names.includes(clean)) return key;
  }
  return null;
}

export function findSections(text: string): Record<string, number> {
  const lines = text.split(/\r?\n/);
  const found: Record<string, number> = {};
  lines.forEach((line, i) => {
    const key = headingKey(line);
    if (key && found[key] === undefined) found[key] = i;
  });
  return found;
}

function sectionText(text: string, key: string): string {
  const lines = text.split(/\r?\n/);
  const sections = findSections(text);
  const start = sections[key];
  if (start === undefined) return "";
  const later = Object.values(sections).filter((i) => i > start);
  const end = later.length ? Math.min(...later) : lines.length;
  return lines.slice(start + 1, end).join("\n");
}

export function parseResume(text: string): ParsedResume {
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] ?? null;
  const phone = text.match(/\+?\d[\d\s()-]{8,}\d/)?.[0]?.trim() ?? null;
  const linkedin = text.match(/(?:www\.)?linkedin\.com\/[^\s)]+/)?.[0] ?? null;
  const github = text.match(/(?:www\.)?github\.com\/[^\s)]+/)?.[0] ?? null;
  const domains = text.match(/\b[a-z0-9-]+\.(?:site|dev|io|me|com|in|app)\b/gi) ?? [];
  const portfolio =
    domains.find(
      (d) =>
        !d.includes("linkedin") &&
        !d.includes("github") &&
        !d.includes("gmail")
    ) ?? null;

  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const firstContent = lines.find(
    (l) => l.length >= 3 && l.length <= 42 && !l.includes("@") && /[A-Za-z]/.test(l)
  );
  const name =
    firstContent && !headingKey(firstContent) ? firstContent : null;

  const skillsRaw = sectionText(text, "skills");
  const skills = skillsRaw
    ? skillsRaw
        .split(/[,\n•|]/)
        .map((s) => s.replace(/^[A-Za-z /&]+:\s*/, "").replace(/^[-–]\s*/, "").trim())
        .filter((s) => s.length >= 2 && s.length <= 30)
        .slice(0, 40)
    : [];

  const eduText = sectionText(text, "education");
  const educationLines = (
    eduText
      ? eduText.split(/\r?\n/)
      : lines.filter((l) =>
          /(university|college|b\.?tech|bachelor|master|ssc|intermediate|cgpa)/i.test(l)
        )
  )
    .map((l) => l.trim())
    .filter((l) => l.length >= 4)
    .slice(0, 6);

  const projText = sectionText(text, "projects") || sectionText(text, "experience");
  const projectLines = projText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length >= 4 &&
        l.length <= 90 &&
        !l.startsWith("•") &&
        !l.startsWith("-") &&
        !/^github:/i.test(l)
    )
    .slice(0, 8);

  return {
    name,
    email,
    phone,
    linkedin,
    github,
    portfolio,
    skills,
    educationLines,
    projectLines,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length,
  };
}

/**
 * The JD keyword universe and must-have set, exactly as the scoring
 * engine sees them. Shared so per-keyword points and classification
 * never drift from the score itself.
 */
export function jdKeywordSets(jdText: string): {
  keywords: string[];
  mustSet: Set<string>;
} {
  const keywords = jdText ? extractKeywords(jdText) : [];
  if (!jdText || keywords.length === 0) {
    return { keywords, mustSet: new Set<string>() };
  }
  const head = jdText.slice(0, Math.ceil(jdText.length * 0.4));
  const mustHave = keywords.filter(
    (k) =>
      containsTerm(head, k) ||
      jdText.toLowerCase().split(k.toLowerCase()).length - 1 >= 2
  );
  const mustSet = new Set(
    mustHave.length
      ? mustHave
      : keywords.slice(0, Math.ceil(keywords.length / 2))
  );
  return { keywords, mustSet };
}

const pts = (
  status: "pass" | "warn" | "fail",
  max: number,
  override?: number
): number =>
  override !== undefined
    ? override
    : status === "pass"
      ? max
      : status === "warn"
        ? Math.floor(max / 2)
        : 0;

function check(
  id: string,
  label: string,
  status: "pass" | "warn" | "fail",
  maxPoints: number,
  evidence: string,
  override?: number
): AtsSubCheck {
  return { id, label, status, maxPoints, points: pts(status, maxPoints, override), evidence };
}

export function checkAtsEngine(input: {
  resumeText: string;
  jdText?: string;
  sourceType?: string; // 'upload' | 'paste' | 'saved'
}): AtsResult {
  const { resumeText } = input;
  const jdText = (input.jdText ?? "").trim();
  const sourceType = input.sourceType ?? "paste";
  const parsed = parseResume(resumeText);
  const sections = findSections(resumeText);
  const lines = resumeText.split(/\r?\n/);
  const categories: AtsCategory[] = [];
  const issues: AtsIssue[] = [];

  /* ── Format & Parse-Safety (20) ─────────────────────────────────────── */
  const formatChecks: AtsSubCheck[] = [];
  formatChecks.push(
    parsed.charCount >= 300
      ? check("f_text", "Resume text is machine-readable", "pass", 4, `${parsed.charCount} characters of selectable text extracted`)
      : parsed.charCount >= 150
        ? check("f_text", "Resume text is machine-readable", "warn", 4, `Only ${parsed.charCount} characters extracted — very short for an ATS`)
        : check("f_text", "Resume text is machine-readable", "fail", 4, `Only ${parsed.charCount} characters extracted — an ATS may read almost nothing`)
  );
  const pipeCount = (resumeText.match(/\|/g) ?? []).length;
  const tabColumns = lines.filter((l) => (l.match(/\t/g) ?? []).length >= 2).length;
  formatChecks.push(
    tabColumns > 0 || pipeCount > 6
      ? check("f_tables", "No tables or column layouts", "fail", 3, `Detected ${tabColumns} tab-column lines / ${pipeCount} table-style separators — tables break ATS parsing`)
      : check("f_tables", "No tables or column layouts", "pass", 3, "No table markup or column separators detected in the text")
  );
  formatChecks.push(
    sourceType === "saved"
      ? check("f_single", "Single-column layout", "pass", 3, "Generated with the single-column ATS template")
      : check("f_single", "Single-column layout", "warn", 3, "Cannot be fully verified from text alone — make sure the original file is single-column with no text boxes")
  );
  const headingCount = Object.keys(sections).length;
  formatChecks.push(
    headingCount >= 4
      ? check("f_headings", "Standard section headings", "pass", 4, `${headingCount} standard section headings found`)
      : headingCount >= 2
        ? check("f_headings", "Standard section headings", "warn", 4, `Only ${headingCount} standard headings found — use exact names like "Technical Skills" and "Education"`)
        : check("f_headings", "Standard section headings", "fail", 4, "Section headings are missing or non-standard — ATS systems map sections by heading names")
  );
  formatChecks.push(
    parsed.wordCount >= 250 && parsed.wordCount <= 950
      ? check("f_length", "Resume content length", "pass", 3, `${parsed.wordCount} words — within the recommended content range`)
      : parsed.wordCount >= 150 && parsed.wordCount <= 1300
        ? check("f_length", "Resume content length", "warn", 3, `${parsed.wordCount} words — consider adjusting content length`)
        : check("f_length", "Resume content length", "fail", 3, `${parsed.wordCount} words — content is ${parsed.wordCount < 150 ? "short" : "long"}`)
  );
  const firstQuarter = lines.slice(0, Math.max(4, Math.ceil(lines.length / 4))).join("\n");
  const contactTop = !!(parsed.email && firstQuarter.includes(parsed.email));
  formatChecks.push(
    contactTop
      ? check("f_contact_top", "Contact details at the top", "pass", 3, "Email found in the top quarter of the resume, in the body (not a header/footer)")
      : parsed.email
        ? check("f_contact_top", "Contact details at the top", "warn", 3, "Email exists but not near the top — many ATS parsers look for contact info first")
        : check("f_contact_top", "Contact details at the top", "fail", 3, "No email found anywhere in the resume body")
  );
  categories.push({
    id: "format",
    label: "Format & Parse-Safety",
    maxScore: 20,
    score: formatChecks.reduce((a, c) => a + c.points, 0),
    checks: formatChecks,
  });

  /* ── Keyword Match (40, JD only) ────────────────────────────────────── */
  const { keywords, mustSet } = jdKeywordSets(jdText);
  const matched = keywords.filter((k) => containsTerm(resumeText, k));
  const missing = keywords.filter((k) => !containsTerm(resumeText, k));
  const missingMustHave = missing.filter((k) => mustSet.has(k));
  const missingNiceToHave = missing.filter((k) => !mustSet.has(k));

  if (jdText && keywords.length > 0) {
    const stuffed = matched.filter(
      (k) => resumeText.toLowerCase().split(k.toLowerCase()).length - 1 >= 7
    );
    let overallPts = Math.round(30 * (matched.length / keywords.length));
    if (stuffed.length) overallPts = Math.max(0, overallPts - 2 * stuffed.length);
    const mustMatched = [...mustSet].filter((k) => containsTerm(resumeText, k));
    const mustPts = mustSet.size
      ? Math.round(10 * (mustMatched.length / mustSet.size))
      : 10;
    categories.push({
      id: "keywords",
      label: "Keyword Match vs JD",
      maxScore: 40,
      score: overallPts + mustPts,
      checks: [
        check(
          "k_overall",
          "JD keywords present in resume",
          matched.length === keywords.length ? "pass" : matched.length >= keywords.length * 0.6 ? "warn" : "fail",
          30,
          `${matched.length} of ${keywords.length} JD keywords found${stuffed.length ? `; keyword stuffing detected for: ${stuffed.join(", ")} (−${2 * stuffed.length} pts)` : ""}`,
          overallPts
        ),
        check(
          "k_musthave",
          "Must-have keywords covered",
          missingMustHave.length === 0 ? "pass" : missingMustHave.length <= 2 ? "warn" : "fail",
          10,
          missingMustHave.length === 0
            ? "All must-have keywords are present"
            : `Missing must-haves: ${missingMustHave.join(", ")}`,
          mustPts
        ),
      ],
    });
  }

  /* ── Sections & Completeness (15) ───────────────────────────────────── */
  const sectionDefs: [string, string, string][] = [
    ["summary", "Professional Summary section", "summary"],
    ["skills", "Technical Skills section", "skills"],
    ["projects", "Projects / Experience section", "projects"],
    ["education", "Education section", "education"],
    ["certifications", "Certifications section", "certifications"],
  ];
  const sectionChecks = sectionDefs.map(([key, label]) => {
    const present =
      sections[key] !== undefined ||
      (key === "projects" && sections.experience !== undefined);
    return check(
      `s_${key}`,
      label,
      present ? "pass" : "fail",
      3,
      present ? "Section found with a standard heading" : "Section not found — add it with the standard heading"
    );
  });
  categories.push({
    id: "sections",
    label: "Sections & Completeness",
    maxScore: 15,
    score: sectionChecks.reduce((a, c) => a + c.points, 0),
    checks: sectionChecks,
  });

  /* ── Bullet Quality (15) ────────────────────────────────────────────── */
  const bulletSource = sections.projects !== undefined || sections.experience !== undefined
    ? `${sectionText(resumeText, "projects")}\n${sectionText(resumeText, "experience")}`.split(/\r?\n/)
    : lines;
  const bullets = bulletSource
    .map((l) => l.trim())
    .filter((l) => /^[•\-*▪]/.test(l) || /^developed|^built|^designed|^implemented/i.test(l))
    .map((l) => l.replace(/^[•\-*▪]\s*/, ""));
  const verbCount = bullets.filter((b) => {
    const first = b.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, "");
    return first ? ACTION_VERBS.has(first) : false;
  }).length;
  const metricCount = bullets.filter((b) => /\d/.test(b)).length;
  const pronounCount = bullets.filter((b) => /\b(I|my|we|our)\b/.test(b)).length;
  const verbPct = bullets.length ? verbCount / bullets.length : 0;
  const metricPct = bullets.length ? metricCount / bullets.length : 0;
  const bulletChecks: AtsSubCheck[] = [
    check(
      "b_exist",
      "Bullet points used",
      bullets.length >= 6 ? "pass" : bullets.length >= 3 ? "warn" : "fail",
      3,
      `${bullets.length} bullet lines found`
    ),
    check(
      "b_verbs",
      "Bullets start with action verbs",
      verbPct >= 0.7 ? "pass" : verbPct >= 0.4 ? "warn" : "fail",
      5,
      `${verbCount} of ${bullets.length} bullets start with a strong action verb`,
      Math.round(5 * verbPct)
    ),
    check(
      "b_metrics",
      "Measurable results in bullets",
      metricPct >= 0.4 ? "pass" : metricPct >= 0.15 ? "warn" : "fail",
      4,
      `${metricCount} of ${bullets.length} bullets contain a number or measurable result`,
      Math.round(4 * metricPct)
    ),
    check(
      "b_pronouns",
      "No first-person pronouns",
      pronounCount === 0 ? "pass" : pronounCount <= 2 ? "warn" : "fail",
      3,
      pronounCount === 0
        ? "No first-person pronouns in bullets"
        : `${pronounCount} bullets use first-person pronouns (I / my / we)`
    ),
  ];
  categories.push({
    id: "bullets",
    label: "Bullet Quality",
    maxScore: 15,
    score: bulletChecks.reduce((a, c) => a + c.points, 0),
    checks: bulletChecks,
  });

  /* ── Contact & Links (10) ───────────────────────────────────────────── */
  const phoneDigits = parsed.phone ? parsed.phone.replace(/\D/g, "") : "";
  const contactChecks: AtsSubCheck[] = [
    check("c_email", "Email present and valid", parsed.email ? "pass" : "fail", 3, parsed.email ?? "No email address found"),
    check(
      "c_phone",
      "Phone with country code",
      parsed.phone?.startsWith("+") && phoneDigits.length >= 11
        ? "pass"
        : parsed.phone
          ? "warn"
          : "fail",
      3,
      parsed.phone
        ? parsed.phone.startsWith("+")
          ? parsed.phone
          : `${parsed.phone} — add the country code (e.g. +91)`
        : "No phone number found"
    ),
    check("c_linkedin", "LinkedIn profile linked", parsed.linkedin ? "pass" : "fail", 2, parsed.linkedin ?? "No LinkedIn URL found"),
    check(
      "c_code",
      "GitHub / portfolio linked",
      parsed.github || parsed.portfolio ? "pass" : "fail",
      2,
      parsed.github ?? parsed.portfolio ?? "No GitHub or portfolio URL found"
    ),
  ];
  categories.push({
    id: "contact",
    label: "Contact & Links",
    maxScore: 10,
    score: contactChecks.reduce((a, c) => a + c.points, 0),
    checks: contactChecks,
  });

  /* ── Total + issues ─────────────────────────────────────────────────── */
  const rawTotal = categories.reduce((a, c) => a + c.score, 0);
  const rawMax = categories.reduce((a, c) => a + c.maxScore, 0);
  const score = jdText && keywords.length ? rawTotal : Math.round((rawTotal / rawMax) * 100);

  for (const cat of categories) {
    for (const c of cat.checks) {
      if (c.status !== "pass") {
        issues.push({
          label: c.label,
          impact: c.maxPoints - c.points,
          fix: fixFor(c.id, { missingMustHave, missingNiceToHave }),
        });
      }
    }
  }
  for (const k of missingMustHave) {
    issues.push({
      label: `Missing must-have keyword: ${k}`,
      impact: 4,
      fix: `Review "${k}" in the resume editor and include it in Technical Skills where relevant.`,
    });
  }
  issues.sort((a, b) => b.impact - a.impact);

  return {
    score,
    hasJd: !!(jdText && keywords.length),
    categories,
    parsed,
    matchedKeywords: matched,
    missingMustHave,
    missingNiceToHave,
    issues,
  };
}

function fixFor(id: string, ctx: { missingMustHave: string[]; missingNiceToHave: string[] }): string {
  const fixes: Record<string, string> = {
    f_text: "Export the resume as a text-based PDF (not a scan/image) so ATS parsers can read it.",
    f_tables: "Remove tables, text boxes and multi-column layouts — use a single column.",
    f_single: "Rebuild the resume in a single-column layout with no text boxes or sidebars.",
    f_headings: "Rename section headings to the standard names: Professional Summary, Technical Skills, Projects, Education, Certifications.",
    f_length: "Trim or expand the content to fit one page (roughly 250–950 words for a fresher).",
    f_contact_top: "Move your name, phone, email and links to the very top of the resume body.",
    k_overall: "Use the job description's terminology in your Skills and relevant project bullets.",
    k_musthave: `Review the missing required skills: ${ctx.missingMustHave.join(", ") || "—"}.`,
    s_summary: "Add a Professional Summary section (2–3 lines) at the top, tailored to the role.",
    s_skills: "Add a Technical Skills section listing your tools and technologies.",
    s_projects: "Add a Projects section with your strongest 3–4 projects for this role.",
    s_education: "Add an Education section with degree, university, years and CGPA/score.",
    s_certifications: "Add a Certifications section if you have any certificates.",
    b_exist: "Write experience and projects as bullet points, not paragraphs.",
    b_verbs: "Start every bullet with a strong action verb: Developed, Built, Implemented, Integrated…",
    b_metrics: "Add measurable results where true — accuracy %, users, latency, counts (e.g. \"98% accuracy\").",
    b_pronouns: "Remove first-person pronouns (I, my, we) from bullets.",
    c_email: "Add a professional email address at the top.",
    c_phone: "Add your phone number with country code, e.g. +91 …",
    c_linkedin: "Add your LinkedIn profile URL at the top.",
    c_code: "Add your GitHub and/or portfolio URL at the top.",
  };
  return fixes[id] ?? "Review this item and correct it in the resume.";
}

/* ── Truthful auto-fix ──────────────────────────────────────────────── */

const HEADING_ALIASES: Record<string, string> = {
  "summary": "PROFESSIONAL SUMMARY",
  "profile": "PROFESSIONAL SUMMARY",
  "objective": "PROFESSIONAL SUMMARY",
  "about me": "PROFESSIONAL SUMMARY",
  "skills": "TECHNICAL SKILLS",
  "core competencies": "TECHNICAL SKILLS",
  "tech stack": "TECHNICAL SKILLS",
  "technologies": "TECHNICAL SKILLS",
  "projects": "PROJECTS",
  "project experience": "PROJECTS",
  "selected projects": "PROJECTS",
  "experience": "PROJECTS",
  "work experience": "PROJECTS",
  "education": "EDUCATION",
  "academics": "EDUCATION",
  "certifications": "CERTIFICATIONS",
  "certificates": "CERTIFICATIONS",
};

export function autoFixResume(input: {
  resumeText: string;
  jdText?: string;
  supportedSkills: string[];
}): { fixedText: string; fixes: string[] } {
  const fixes: string[] = [];
  let text = input.resumeText;
  const lines = text.split(/\r?\n/);

  // 1. Standardise headings
  let headingChanged = false;
  const newLines = lines.map((line) => {
    const clean = line.replace(/[^a-zA-Z ]/g, "").trim().toLowerCase();
    const std = HEADING_ALIASES[clean];
    if (std && line.trim().toUpperCase() !== std) {
      headingChanged = true;
      return std;
    }
    return line;
  });
  if (headingChanged) {
    text = newLines.join("\n");
    fixes.push("Renamed section headings to the standard ATS names");
  }

  // 2. Add truthfully-supported missing JD keywords to the Skills section
  if (input.jdText) {
    const kws = extractKeywords(input.jdText);
    const supported = kws.filter(
      (k) =>
        !containsTerm(text, k) &&
        input.supportedSkills.some(
          (s) =>
            s.toLowerCase() === k.toLowerCase() ||
            containsTerm(s, k) ||
            containsTerm(k, s)
        )
    );
    if (supported.length) {
      const tLines = text.split(/\r?\n/);
      const idx = tLines.findIndex(
        (l) => l.trim().toUpperCase() === "TECHNICAL SKILLS"
      );
      if (idx >= 0 && tLines[idx + 1] !== undefined) {
        tLines[idx + 1] = `${tLines[idx + 1].replace(/\s*$/, "")}, ${supported.join(", ")}`;
        text = tLines.join("\n");
        fixes.push(
          `Added your own proven keywords to Technical Skills: ${supported.join(", ")}`
        );
      }
    }
  }

  // 3. Move contact line to the top if it is buried
  const parsed = parseResume(text);
  const tLines = text.split(/\r?\n/);
  const contactIdx = tLines.findIndex(
    (l) => parsed.email && l.includes(parsed.email) && l !== tLines[1]
  );
  if (contactIdx > 3 && parsed.email) {
    const contactParts = [parsed.phone, parsed.email, parsed.github, parsed.linkedin, parsed.portfolio]
      .filter(Boolean)
      .join(" | ");
    const rest = tLines.filter((_, i) => i !== contactIdx);
    rest.splice(1, 0, contactParts);
    text = rest.join("\n");
    fixes.push("Moved your contact details to the top of the resume");
  }

  return { fixedText: text, fixes };
}

/* ── Missing keywords: points + addable/gap classification ──────────────
   Per-keyword points come from the same shares the engine uses:
   30 pts spread over all JD keywords (k_overall) plus 10 pts spread
   over the must-have set (k_musthave). The shares are rescaled so the
   items sum exactly to the points the keyword category actually lost
   to missing keywords (excluding any keyword-stuffing penalty, which
   is a separate issue). Addable = the keyword is evidenced somewhere
   in the user's profile or project library; otherwise it is a true gap. */

function keywordEvidence(
  keyword: string,
  profile: Profile,
  projects: Project[]
): { evidence: string; projectId: string | null } | null {
  // Project evidence wins over skill-list evidence: it is the strongest
  // proof, and it lets Auto-Fix place the keyword into that project's
  // tech stack and bullets, not just the skills list.
  for (const p of projects) {
    if (p.tags.some((t) => skillSupported(keyword, [t]))) {
      return { evidence: `Project: ${p.title} (tags)`, projectId: p.id };
    }
  }
  for (const p of projects) {
    const hay = `${p.title} ${p.description} ${p.bullets.join(" ")}`;
    if (containsTerm(hay, keyword)) {
      return { evidence: `Project: ${p.title}`, projectId: p.id };
    }
  }
  for (const g of profile.skillGroups) {
    if (g.items.some((i) => skillSupported(keyword, [i]))) {
      return { evidence: `Your Technical Skills (${g.label})`, projectId: null };
    }
  }
  if (profile.coursework.some((c) => skillSupported(keyword, [c]))) {
    return { evidence: "Your coursework", projectId: null };
  }
  if (containsTerm(profile.summary, keyword)) {
    return { evidence: "Your profile summary", projectId: null };
  }
  if (profile.certifications.some((c) => containsTerm(c, keyword))) {
    return { evidence: "Your certifications", projectId: null };
  }
  return null;
}

export function classifyMissingKeywords(input: {
  resumeText: string;
  jdText?: string;
  result?: AtsResult;
  profile: Profile;
  projects: Project[];
}): MissingItem[] {
  const jdText = (input.jdText ?? "").trim();
  if (!jdText) return [];
  const { keywords, mustSet } = jdKeywordSets(jdText);
  if (keywords.length === 0) return [];

  const result =
    input.result ??
    checkAtsEngine({ resumeText: input.resumeText, jdText });
  const missing = [...result.missingMustHave, ...result.missingNiceToHave];
  if (missing.length === 0) return [];

  const kwCat = result.categories.find((c) => c.id === "keywords");
  const kwLost = kwCat ? kwCat.maxScore - kwCat.score : 0;
  const stuffed = result.matchedKeywords.filter(
    (k) =>
      input.resumeText.toLowerCase().split(k.toLowerCase()).length - 1 >= 7
  );
  // Points lost purely to keywords being absent (stuffing is separate).
  const target = Math.max(0, kwLost - stuffed.length * 2);

  const rawShare = (k: string) =>
    30 / keywords.length +
    (mustSet.has(k) ? 10 / Math.max(1, mustSet.size) : 0);
  const totalRaw = missing.reduce((a, k) => a + rawShare(k), 0);

  // Distribute `target` proportionally to the raw shares, in tenths,
  // largest remainder first, so the items sum exactly to the target.
  const exact = missing.map((k) =>
    totalRaw > 0 ? (target * rawShare(k)) / totalRaw : 0
  );
  const tenths = exact.map((v) => Math.floor(v * 10));
  let remainder = Math.round(target * 10) - tenths.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v * 10 - Math.floor(v * 10) }))
    .sort((a, b) => b.frac - a.frac);
  for (let j = 0; remainder > 0 && order.length > 0; j = (j + 1) % order.length) {
    tenths[order[j].i] += 1;
    remainder -= 1;
  }

  return missing
    .map((k, i) => {
      const ev = keywordEvidence(k, input.profile, input.projects);
      return {
        keyword: k,
        mustHave: mustSet.has(k),
        points: tenths[i] / 10,
        addable: !!ev,
        evidence: ev?.evidence ?? null,
        projectId: ev?.projectId ?? null,
      } as MissingItem;
    })
    .sort((a, b) => b.points - a.points);
}
