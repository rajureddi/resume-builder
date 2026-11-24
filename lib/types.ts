export interface EducationItem {
  title: string;
  org: string;
  period: string;
  detail: string;
}

export interface SkillGroup {
  label: string;
  items: string[];
}

export interface Profile {
  name: string;
  title: string;
  phone: string;
  email: string;
  github: string;
  linkedin: string;
  portfolio: string;
  summary: string;
  education: EducationItem[];
  skillGroups: SkillGroup[];
  certifications: string[];
  coursework: string[];
  experience?: ExperienceItem[];
}

export interface ExperienceItem {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  type: "Full-time" | "Internship" | "Contract" | "Part-time" | "Freelance" | "Volunteer";
  bullets: string[];
  skills: string[];
}

export interface ProjectStackVariant {
  id: string;
  label: string;
  tags: string[];
  domains?: string[];
  description: string;
  bullets: string[];
}

export interface Project {
  id: string;
  title: string;
  year: string;
  description: string;
  tags: string[];
  domains: string[];
  github: string;
  bullets: string[];
  highlight?: string;
  stackVariants?: ProjectStackVariant[];
  templateId?: string;
}

export interface ProjectTemplate extends Omit<Project, "id" | "year" | "github"> {
  id: string;
  level: "Starter" | "Real-world";
  recommendedSkills: string[];
}

export interface TailoredProject {
  projectId: string;
  title: string;
  tech: string;
  bullets: string[];
  github: string;
  variantId?: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  domainPrimary: string;
  domainSecondary: string | null;
  jdText: string;
  summary: string;
  skills: string[];
  projects: TailoredProject[];
  gaps: string[];
  atsScore: number;
  status: string;
  text: string;
  createdAt: string;
  profileSnapshot?: Profile;
  resumeTemplate?: ResumeTemplate;
  additionalSections?: { title: string; lines: string[] }[];
  generationSource?: "ai" | "rules";
  skillGroups?: SkillGroup[];
  interests?: string[];
  skillLayout?: "stacked" | "columns";
  showContactIcons?: boolean;
  showSectionRules?: boolean;
  experience?: ExperienceItem[];
}

export type ResumeTemplate = "classic" | "modern" | "compact";

export interface ResumeLayout {
  width: number;
  height: number;
  template: ResumeTemplate;
  fontFamily: string;
  bodySize: number;
  pages: { items: ResumeDrawing[] }[];
}

export type ResumeDrawing =
  | { kind: "text"; text: string; x: number; y: number; size: number; bold: boolean; italic?: boolean; color: string; width: number; href?: string }
  | { kind: "rule"; x: number; y: number; width: number; color: string }
  | { kind: "icon"; icon: "phone" | "email" | "github" | "linkedin" | "globe"; x: number; y: number; size: number; color: string };

export type CheckStatus = "pass" | "warn" | "fail";

export interface AtsSubCheck {
  id: string;
  label: string;
  status: CheckStatus;
  points: number;
  maxPoints: number;
  evidence: string;
}

export interface AtsCategory {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  checks: AtsSubCheck[];
}

export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  skills: string[];
  educationLines: string[];
  projectLines: string[];
  wordCount: number;
  charCount: number;
}

export interface AtsIssue {
  label: string;
  impact: number;
  fix: string;
}

export interface AtsResult {
  score: number;
  hasJd: boolean;
  categories: AtsCategory[];
  parsed: ParsedResume;
  matchedKeywords: string[];
  missingMustHave: string[];
  missingNiceToHave: string[];
  issues: AtsIssue[];
}

export interface MissingItem {
  keyword: string;
  mustHave: boolean;
  /** Points this missing keyword is costing, from the scoring shares. */
  points: number;
  /** True when the user's profile/projects evidence this skill. */
  addable: boolean;
  /** Where the evidence was found, e.g. "Project: DepthSightAI (tags)". Null for true gaps. */
  evidence: string | null;
  /** Library project that best evidences the keyword (addable only). */
  projectId: string | null;
}

export interface FixEntry {
  label: string;
  points: number;
  kind: "keyword" | "structure";
  keyword?: string;
}

export interface FixReport {
  improved: boolean;
  beforeScore: number;
  afterScore: number;
  fixes: FixEntry[];
  remainingGaps: MissingItem[];
  applicationId: string | null;
  checkId: string | null;
  manualSuggestions: string[];
  message: string;
}

export interface AtsCheck extends AtsResult {
  id: string;
  resumeName: string;
  sourceType: string;
  jdText: string;
  resumeText: string;
  aiNotes: string | null;
  createdAt: string;
  missingItems?: MissingItem[];
  applicationId?: string | null;
}

/**
 * A "build later" project idea, auto-suggested when a JD asks for a theme
 * the project library does not cover. HONESTY RULE: an idea is NOT a real
 * project — it lives in its own store and must never be used as resume
 * content, ATS keyword evidence, or an Auto-Fix addable item. Only after
 * the user converts it into a real project (Projects API) does it count.
 */
export interface ProjectIdea {
  id: string;
  /** Normalised dedupe key, e.g. "recommendation-systems". */
  theme: string;
  title: string;
  description: string;
  /** JD keywords / domain this project would cover once built. */
  keywords: string[];
  domain: string;
  sourceCompany: string;
  sourceRole: string;
  createdAt: string;
}

export interface RankedProject {
  project: Project;
  score: number;
  reasons: string[];
  matchedKeywords: string[];
}

export interface Analysis {
  domainPrimary: string;
  domainSecondary: string | null;
  keywords: string[];
  mustHave: string[];
  rankedProjects: RankedProject[];
  engine: "llm" | "rules";
}

export interface LlmSettingsPublic {
  provider: string;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  maskedKey: string | null;
  statusLabel: string;
  source: "database" | "env" | "none";
  canSave: boolean;
  keyEnvVar?: "LLM_API_KEY" | "GROQ_API_KEY";
}
