import type {
  Analysis,
  Application,
  Profile,
  Project,
  RankedProject,
} from "./types";
import { contactText, educationText } from "./resumeContent";
import { groupedResumeSkills } from "./resumeSkills";
import { containsTerm, skillSupported } from "./terms";
export { containsTerm, skillSupported } from "./terms";
import { projectForVariant, roleProjectBullets } from "./projectContent";
import { experiencePeriod, experienceTitle, tailorExperience } from "./experience";

/* ── Skill dictionary (canonical terms an ATS looks for) ────────────── */
export const SKILL_DICTIONARY: string[] = [
  "Python", "Java", "JavaScript", "TypeScript", "Kotlin", "C++", "SQL", "Flutter", "Dart", "GraphQL", "Express", "Prisma", "Supabase", "Firebase", "Redis",
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
  "FAISS", "Qdrant", "LangChain", "Chroma", "Ollama", "pgvector", "Sentence Transformers", "XGBoost", "Streamlit", "dbt", "Airflow", "Terraform", "GitHub Actions", "Playwright", "Vitest", "Pytest", "React Query", "Recharts", "Room",
];

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  Flutter: ["flutter", "dart", "widget", "riverpod", "bloc", "supabase"],
  RAG: ["rag", "retrieval augmented", "retrieval-augmented", "vector search", "embeddings", "faiss", "qdrant", "langchain", "pgvector"],
  Database: ["database", "postgresql", "mysql", "sql", "schema", "normalization", "indexes", "query optimization", "transactions"],
  React: ["react", "jsx", "react query", "redux", "next.js", "frontend", "front-end"],
  Testing: ["test automation", "qa", "playwright", "vitest", "pytest", "testing", "selenium"],
  DevOps: ["devops", "terraform", "github actions", "ci/cd", "deployment pipeline", "kubernetes", "docker"],
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
  for (const item of profile.experience ?? []) for (const skill of item.skills) pool.add(skill);
  return [...pool];
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
    const haystack = `${project.title} ${project.description} ${project.tags.join(" ")} ${(project.stackVariants ?? []).map(variant => `${variant.tags.join(" ")} ${variant.description}`).join(" ")}`;
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
  projects: Project[],
  role?: string
): Analysis {
  const { primary, secondary } = detectDomains(`${role ?? ""}\n${jdText}`);
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
  keywords: string[],
  projectSkills: string[] = []
): string[] {
  const flat = [...new Set([...profile.skillGroups.flatMap(g => g.items), ...projectSkills])];
  const kwLower = keywords.map((k) => k.toLowerCase());
  const score = (s: string) =>
    kwLower.some((k) => k === s.toLowerCase() || containsTerm(s, k)) ? 0 : 1;
  const ranked = [...flat].sort((a, b) => score(a) - score(b));
  const relevantCount = ranked.filter(skill => score(skill) === 0).length;
  return ranked.slice(0, Math.max(12, Math.min(18, relevantCount)));
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
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  return [...segmenter.segment(clean)].map(part => part.segment.trim()).filter(Boolean);
}

/**
 * HARD summary cap: a generated summary is SHORT — never more than
 * `maxSentences` (default 4) sentences. Applied to every summary right
 * before an application is saved (rule composer, LLM rewrite and
 * Auto-Fix alike), so no path can persist a long paragraph.
 */
export function trimSummary(summary: string, maxSentences = 3, maxWords = 75): string {
  const clean = summary.replace(/\b(Node|Next|React)\.\s+js\b/gi, "$1.js").replace(/\s+/g, " ").trim();
  const chosen: string[] = [];
  for (const sentence of splitSentences(clean).slice(0, maxSentences)) {
    if ([...chosen, sentence].join(" ").split(/\s+/).length > maxWords) break;
    chosen.push(sentence);
  }
  if (chosen.length) return chosen.join(" ");
  const words = clean.split(/\s+/);
  return words.length <= maxWords ? clean : `${words.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")}.`;
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
  opts?: { keywords?: string[]; secondary?: string | null; projectEvidence?: string[]; experienceCount?: number }
): string {
  const headline = profile.title.split("•")[0].trim();
  const secondaryPart = opts?.secondary ? ` and ${opts.secondary}` : "";
  const strengths = (opts?.keywords?.length ? opts.keywords : topSkills).slice(0, 4);
  const s1 = `${headline} with ${opts?.experienceCount ? "experience" : "hands-on project experience"} in ${primary}${secondaryPart}.`;
  const evidence = opts?.projectEvidence?.find(sentence => sentence.trim());
  const s2 = evidence ? `${evidence.trim().replace(/[.!?]$/, "")}.` : topProjectTitles[0] ? `Project work includes ${topProjectTitles[0]}.` : "";
  const s3 = strengths.length ? `Technical experience includes ${joinList(strengths)}.` : "";
  return trimSummary([s1, s2, s3].filter(Boolean).join(" "));
}

export function buildResumeText(
  profile: Profile,
  app: Pick<
    Application,
    "summary" | "skills" | "projects" | "role" | "additionalSections" | "skillGroups" | "interests" | "experience"
  >
): string {
  const lines: string[] = [];
  lines.push(profile.name.toUpperCase());
  lines.push(contactText(profile));
  lines.push("");
  lines.push("PROFESSIONAL SUMMARY");
  lines.push(app.summary);
  lines.push("");
  lines.push("TECHNICAL SKILLS");
  for (const group of groupedResumeSkills(profile, app)) lines.push(`${group.label}: ${group.items.join(", ")}`);
  if (app.interests?.length) lines.push(`Interests: ${app.interests.join(", ")}`);
  if (app.experience?.length) {
    lines.push("", "WORK EXPERIENCE");
    for (const item of app.experience) {
      lines.push(`${experienceTitle(item)} (${experiencePeriod(item)})`, item.location);
      for (const bullet of item.bullets) lines.push(`• ${bullet}`);
    }
  }
  if (app.projects.length) lines.push("", "PROJECTS");
  for (const p of app.projects) {
    lines.push(p.title);
    if (p.tech) lines.push(p.tech);
    for (const b of p.bullets) lines.push(`• ${b}`);
    if (p.github) lines.push(`GitHub: ${p.github}`);
  }
  for (const section of app.additionalSections ?? []) {
    lines.push("", section.title.toUpperCase(), ...section.lines);
  }
  lines.push("");
  lines.push("EDUCATION");
  for (const e of profile.education) {
    lines.push(educationText(e));
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
  projectVariants?: Record<string, string>;
  selectedSkills?: string[];
  selectedExperienceIds?: string[];
  analysis?: Analysis;
}): Omit<Application, "id" | "createdAt" | "status"> {
  const { profile, projects } = input;
  const analysis = input.analysis ?? analyzeJobRules(input.jdText, profile, projects, input.role);
  const candidates = analysis.rankedProjects;
  const chosen = input.selectedProjectIds !== undefined
    ? input.selectedProjectIds.map(id => candidates.find(candidate => candidate.project.id === id)).filter((candidate): candidate is RankedProject => Boolean(candidate))
    : candidates.filter(candidate => candidate.score > 0).slice(0, 4);
  const chosenProjects = chosen.map(candidate => projectForVariant(candidate.project, input.projectVariants?.[candidate.project.id]));
  const experience = tailorExperience(profile.experience ?? [], analysis.keywords, input.selectedExperienceIds);
  const skills = input.selectedSkills !== undefined ? [...new Set(input.selectedSkills.map(skill => skill.trim()).filter(Boolean))]
    : orderSkills(profile, analysis.keywords, [...chosenProjects.flatMap(project => project.tags), ...experience.flatMap(item => item.skills)]);
  const tailoredProjects = chosenProjects.map(project => ({
    projectId: project.id, title: project.title,
    tech: [...project.tags].sort((a, b) => Number(analysis.keywords.some(keyword => skillSupported(keyword, [b]))) - Number(analysis.keywords.some(keyword => skillSupported(keyword, [a])))).join(", "),
    bullets: roleProjectBullets(project, input.role, analysis.keywords),
    github: project.github, variantId: input.projectVariants?.[project.id] || undefined,
  }));
  const matched = analysis.keywords.filter(keyword => skillSupported(keyword, skills));
  const evidenceSkills = [...chosenProjects.flatMap(project => project.tags), ...experience.flatMap(item => item.skills)];
  const domainSupported = (domain: string) => chosenProjects.some(project => project.domains.includes(domain)) || (DOMAIN_KEYWORDS[domain] ?? []).some(keyword => skillSupported(keyword, evidenceSkills));
  const summaryDomain = domainSupported(analysis.domainPrimary) ? analysis.domainPrimary : chosenProjects[0]?.domains[0] ?? "software development";
  const summary = buildSummary(profile, input.role, summaryDomain, skills, chosenProjects.map(project => project.title), {
    keywords: matched, secondary: analysis.domainSecondary && domainSupported(analysis.domainSecondary) ? analysis.domainSecondary : null, projectEvidence: [...experience.flatMap(item => item.bullets), ...tailoredProjects.flatMap(project => project.bullets)], experienceCount: experience.length,
  });
  const payload: Omit<Application, "id" | "createdAt" | "status"> = {
    company: input.company, role: input.role, domainPrimary: analysis.domainPrimary, domainSecondary: analysis.domainSecondary,
    jdText: input.jdText, profileSnapshot: structuredClone(profile), resumeTemplate: "compact", generationSource: "rules",
    summary, skills, projects: tailoredProjects, experience,
    gaps: analysis.keywords.filter(keyword => !skillSupported(keyword, skills)), atsScore: 0, text: "",
  };
  payload.text = buildResumeText(profile, payload);
  return payload;
}
