import type {
  Analysis,
  Application,
  Profile,
  Project,
  RankedProject,
} from "./types";

/* ── Skill dictionary (canonical terms an ATS looks for) ────────────── */
export const SKILL_DICTIONARY: string[] = [
  "Python", "Java", "JavaScript", "TypeScript", "Kotlin", "C++", "SQL",
  "React", "Next.js", "Node.js", "Flask", "FastAPI", "Django", "Spring Boot",
  "Android", "KivyMD", "ARCore", "MediaPipe", "MNN", "TensorFlow Lite",
  "TensorFlow", "PyTorch", "Keras", "Scikit-learn", "OpenCV", "YOLO",
  "Hugging Face", "Transformers", "BERT", "NLP", "Computer Vision",
  "Deep Learning", "Machine Learning", "Artificial Intelligence", "LLM",
  "RAG", "OCR", "Object Detection", "Face Recognition", "CNN", "ResNet",
  "Data Structures", "Algorithms", "DBMS", "MySQL", "PostgreSQL", "MongoDB",
  "REST APIs", "Git", "GitHub", "Docker", "Kubernetes", "AWS", "GCP", "Azure",
  "CI/CD", "Linux", "TailwindCSS", "HTML", "CSS", "Figma", "Agile", "Scrum",
  "Unit Testing", "System Design", "Microservices", "Data Analytics",
  "Pandas", "NumPy", "Power BI", "Tableau", "Excel", "FinTech", "Payments",
  "UPI", "USSD", "Fraud Detection", "Backtesting", "Accessibility",
  "Text-to-Speech", "Inference", "Model Deployment", "API Development",
];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "AI/ML": ["machine learning", "deep learning", "artificial intelligence", "ai", "ml", "model", "training", "neural", "tensorflow", "pytorch", "scikit-learn", "inference", "prediction"],
  "Computer Vision": ["computer vision", "image", "video", "yolo", "opencv", "object detection", "face recognition", "camera", "vision", "ocr", "segmentation", "cnn"],
  NLP: ["nlp", "natural language", "text", "bert", "transformers", "language model", "llm", "sentiment", "ner", "named entity", "speech", "chatbot", "rag"],
  Android: ["android", "kotlin", "mobile app", "jetpack", "ussd", "play store", "mobile development"],
  "Full-Stack": ["full-stack", "full stack", "react", "node.js", "frontend", "backend", "web application", "rest api", "next.js", "flask", "fastapi", "javascript", "typescript"],
  FinTech: ["fintech", "payment", "upi", "banking", "fraud", "transaction", "finance", "trading", "stock", "investment"],
  Data: ["data", "analytics", "sql", "pandas", "dashboard", "visualization", "statistics", "etl", "power bi", "tableau", "dataset"],
  Cloud: ["aws", "cloud", "docker", "kubernetes", "deployment", "ec2", "ci/cd", "devops", "azure", "gcp", "serverless"],
  "On-Device AI": ["on-device", "edge", "offline", "tensorFlow lite", "tflite", "mediapipe", "mnn", "embedded", "inference on device", "privacy-first"],
  Frontend: ["frontend", "front-end", "ui", "ux", "react", "css", "html", "responsive", "figma", "tailwind"],
  Backend: ["backend", "back-end", "api", "server", "database", "microservices", "fastapi", "flask", "node.js", "system design", "postgresql", "mysql"],
};

export const DOMAINS = Object.keys(DOMAIN_KEYWORDS);

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsTerm(text: string, term: string): boolean {
  const t = term.toLowerCase();
  const hay = text.toLowerCase();
  if (/^[a-z#+.]+$/.test(t) && t.length <= 3) {
    return new RegExp(`(^|[^a-z0-9])${esc(t)}([^a-z0-9]|$)`).test(hay);
  }
  return hay.includes(t);
}

export function extractKeywords(jdText: string): string[] {
  const found: string[] = [];
  for (const skill of SKILL_DICTIONARY) {
    if (containsTerm(jdText, skill)) found.push(skill);
  }
  return found;
}

export function detectDomains(jdText: string): {
  primary: string;
  secondary: string | null;
  scores: Record<string, number>;
} {
  const scores: Record<string, number> = {};
  for (const [domain, kws] of Object.entries(DOMAIN_KEYWORDS)) {
    let s = 0;
    for (const kw of kws) if (containsTerm(jdText, kw)) s++;
    scores[domain] = s;
  }
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const primary = sorted[0] && sorted[0][1] > 0 ? sorted[0][0] : "AI/ML";
  const secondary =
    sorted[1] && sorted[1][1] > 0 && sorted[1][0] !== primary
      ? sorted[1][0]
      : null;
  return { primary, secondary, scores };
}

/** All skills the user can truthfully claim (profile + project tags). */
export function supportedSkillPool(
  profile: Profile,
  projects: Project[]
): string[] {
  const pool = new Set<string>();
  for (const g of profile.skillGroups) for (const i of g.items) pool.add(i);
  for (const c of profile.coursework) pool.add(c);
  for (const p of projects) for (const t of p.tags) pool.add(t);
  return [...pool];
}

export function skillSupported(
  skill: string,
  pool: string[]
): boolean {
  return pool.some(
    (p) =>
      p.toLowerCase() === skill.toLowerCase() ||
      containsTerm(p, skill) ||
      containsTerm(skill, p)
  );
}

export function rankProjects(
  projects: Project[],
  primary: string,
  secondary: string | null,
  keywords: string[]
): RankedProject[] {
  const ranked = projects.map((project) => {
    let score = 0;
    const reasons: string[] = [];
    const matchedKeywords: string[] = [];

    if (project.domains.includes(primary)) {
      score += 50;
      reasons.push(`Matches the ${primary} domain`);
    }
    if (secondary && project.domains.includes(secondary)) {
      score += 20;
      reasons.push(`Also fits ${secondary}`);
    }
    const haystack = `${project.title} ${project.description} ${project.tags.join(" ")}`;
    for (const kw of keywords) {
      if (containsTerm(haystack, kw)) {
        score += 10;
        matchedKeywords.push(kw);
      }
    }
    if (matchedKeywords.length > 0) {
      reasons.push(
        `Uses ${matchedKeywords.slice(0, 4).join(", ")} from the job description`
      );
    }
    if (project.highlight) {
      score += 5;
      reasons.push(project.highlight);
    }
    return { project, score, reasons, matchedKeywords };
  });
  return ranked.sort((a, b) => b.score - a.score);
}

export function analyzeJobRules(
  jdText: string,
  profile: Profile,
  projects: Project[]
): Analysis {
  const { primary, secondary } = detectDomains(jdText);
  const keywords = extractKeywords(jdText);
  // must-have ≈ keywords appearing in the first 40% of the JD or repeated
  const head = jdText.slice(0, Math.ceil(jdText.length * 0.4));
  const mustHave = keywords.filter(
    (k) => containsTerm(head, k) || (jdText.toLowerCase().split(k.toLowerCase()).length - 1) >= 2
  );
  return {
    domainPrimary: primary,
    domainSecondary: secondary,
    keywords,
    mustHave: mustHave.length ? mustHave : keywords.slice(0, 6),
    rankedProjects: rankProjects(projects, primary, secondary, keywords),
    engine: "rules",
  };
}

/* ── Tailored resume construction (truthful only) ───────────────────── */

export function orderSkills(
  profile: Profile,
  keywords: string[]
): string[] {
  const flat: string[] = [];
  for (const g of profile.skillGroups) flat.push(...g.items);
  const kwLower = keywords.map((k) => k.toLowerCase());
  const score = (s: string) =>
    kwLower.some((k) => k === s.toLowerCase() || containsTerm(s, k)) ? 0 : 1;
  return [...flat].sort((a, b) => score(a) - score(b));
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Split prose into sentences, keeping the terminal punctuation. */
export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const parts = clean.match(/[^.!?]+[.!?]+["')\]]*\s*/g);
  if (!parts) return [clean];
  return parts.map((s) => s.trim()).filter(Boolean);
}

/**
 * HARD summary cap: a generated summary is SHORT — never more than
 * `maxSentences` (default 4) sentences. Applied to every summary right
 * before an application is saved (rule composer, LLM rewrite and
 * Auto-Fix alike), so no path can persist a long paragraph.
 */
export function trimSummary(summary: string, maxSentences = 4): string {
  const clean = summary.replace(/\s+/g, " ").trim();
  const sentences = splitSentences(clean);
  if (sentences.length <= maxSentences) return clean;
  return sentences.slice(0, maxSentences).join(" ");
}

/**
 * Fresh professional summary composed for ONE application: the role, the
 * detected domain, the JD keywords this user can truthfully claim, and the
 * projects selected for this JD lead it — so a Computer Vision application
 * reads differently from an Android one. The profile's static summary is
 * never copied into a generated resume. Truthful only: every keyword and
 * project passed in must come from the user's real profile/library.
 * SHORT by design: 4 sentences, roughly 55–75 words — and `trimSummary`
 * hard-caps every summary at 4 sentences before an application is saved.
 */
export function buildSummary(
  profile: Profile,
  role: string,
  primary: string,
  topSkills: string[],
  topProjectTitles: string[],
  opts?: { keywords?: string[]; secondary?: string | null }
): string {
  const headline = profile.title.split("•")[0].trim();
  const cleanRole = role?.trim() ?? "";
  const rolePart =
    cleanRole && cleanRole !== "Auto-Fixed Resume"
      ? `, applying for the ${cleanRole} role`
      : "";
  const secondaryPart = opts?.secondary ? ` and ${opts.secondary}` : "";
  const s1 = `${headline} specialising in ${primary}${secondaryPart}${rolePart}.`;

  const projects = topProjectTitles.filter(Boolean).slice(0, 3);
  const s2 = projects.length
    ? `Hands-on experience building production-grade software end to end, proven through projects such as ${joinList(projects)}.`
    : `Hands-on experience building production-grade software and intelligent systems end to end.`;

  const strengths = (
    opts?.keywords?.length ? opts.keywords : topSkills
  ).slice(0, 5);
  const s3 = strengths.length
    ? `Core strengths for this role: ${strengths.join(", ")} — matched directly to the job requirements.`
    : "";

  const s4 = `Proven track record of shipping complete, working products end to end.`;
  return [s1, s2, s3, s4].filter(Boolean).join(" ");
}

export function buildResumeText(
  profile: Profile,
  app: Pick<
    Application,
    "summary" | "skills" | "projects" | "role"
  >
): string {
  const lines: string[] = [];
  lines.push(profile.name.toUpperCase());
  lines.push(
    `${profile.phone} | ${profile.email} | ${profile.github} | ${profile.linkedin} | ${profile.portfolio}`
  );
  lines.push("");
  lines.push("PROFESSIONAL SUMMARY");
  lines.push(app.summary);
  lines.push("");
  lines.push("TECHNICAL SKILLS");
  lines.push(app.skills.join(", "));
  lines.push("");
  lines.push("PROJECTS");
  for (const p of app.projects) {
    lines.push(`${p.title} (${p.tech})`);
    for (const b of p.bullets) lines.push(`• ${b}`);
    if (p.github) lines.push(`GitHub: ${p.github}`);
  }
  lines.push("");
  lines.push("EDUCATION");
  for (const e of profile.education) {
    lines.push(`${e.title} — ${e.org} (${e.period}) — ${e.detail}`);
  }
  lines.push("");
  lines.push("CERTIFICATIONS");
  for (const c of profile.certifications) lines.push(`• ${c}`);
  return lines.join("\n");
}

export function tailorRules(input: {
  company: string;
  role: string;
  jdText: string;
  profile: Profile;
  projects: Project[];
  selectedProjectIds?: string[];
  analysis?: Analysis;
}): Omit<Application, "id" | "createdAt" | "status"> {
  const { profile, projects } = input;
  const analysis =
    input.analysis ?? analyzeJobRules(input.jdText, profile, projects);

  const selected = input.selectedProjectIds?.length
    ? analysis.rankedProjects.filter((r) =>
        input.selectedProjectIds!.includes(r.project.id)
      )
    : analysis.rankedProjects.filter((r) => r.score > 0).slice(0, 4);
  const chosen = (selected.length ? selected : analysis.rankedProjects.slice(0, 3));

  const skills = orderSkills(profile, analysis.keywords);
  const pool = supportedSkillPool(profile, projects);
  const gaps = analysis.keywords.filter((k) => !skillSupported(k, pool));

  const tailoredProjects = chosen.map((r) => ({
    projectId: r.project.id,
    title: r.project.title,
    tech: r.project.tags.slice(0, 6).join(", "),
    bullets: r.project.bullets,
    github: r.project.github,
  }));

  // JD keywords the user can truthfully claim — these lead the summary.
  const matchedSupported = analysis.keywords.filter((k) =>
    skillSupported(k, pool)
  );
  // The summary names the selected projects that match the most JD
  // keywords first (ties keep rank order), so the project that best
  // evidences this JD leads the summary — e.g. TurantPay for an
  // Android/payments JD, not just the highest domain score.
  const summaryTitles = [...chosen]
    .sort(
      (a, b) =>
        b.matchedKeywords.length - a.matchedKeywords.length || b.score - a.score
    )
    .map((r) => r.project.title);
  const summary = buildSummary(
    profile,
    input.role,
    analysis.domainPrimary,
    skills,
    summaryTitles,
    { keywords: matchedSupported, secondary: analysis.domainSecondary }
  );

  const partial = {
    summary,
    skills,
    projects: tailoredProjects,
    role: input.role,
  };
  return {
    company: input.company,
    role: input.role,
    domainPrimary: analysis.domainPrimary,
    domainSecondary: analysis.domainSecondary,
    jdText: input.jdText,
    summary,
    skills,
    projects: tailoredProjects,
    gaps,
    atsScore: 0, // computed by caller with the ATS engine on the final text
    text: buildResumeText(profile, partial),
  };
}
