import { seedProfile, seedProjects } from "./seed";
import { validExperience, validSkillGroups, validStrings } from "./profileValidation";
import { validProjectFields } from "./projectValidation";
import type { Application, AtsCheck, Profile, Project, ProjectIdea } from "./types";

export const BROWSER_STUDIO_KEY = "resume-studio.data.v1";

export interface BrowserStudioData {
  profile: Profile;
  projects: Project[];
  projectIdeas: ProjectIdea[];
  applications: Application[];
  atsChecks: AtsCheck[];
}

interface StoredStudioData extends BrowserStudioData { version: 1 }

export function createBrowserStudioData(): BrowserStudioData {
  return { profile: structuredClone(seedProfile), projects: structuredClone(seedProjects), projectIdeas: [], applications: [], atsChecks: [] };
}

function isStudioData(value: unknown): value is BrowserStudioData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const profile = data.profile as Partial<Profile> | undefined;
  const record = (item: unknown): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item);
  const text = (item: Record<string, unknown>, keys: string[]) => keys.every(key => typeof item[key] === "string");
  if (!profile || !["name", "title", "phone", "email", "github", "linkedin", "portfolio", "summary"].every(key => typeof (profile as Record<string, unknown>)[key] === "string") ||
    !Array.isArray(profile.education) || !profile.education.every(item => record(item) && text(item, ["title", "org", "period", "detail"])) ||
    !validSkillGroups(profile.skillGroups) || !validStrings(profile.certifications, 100, 500) || !validStrings(profile.coursework, 100, 500) || profile.experience !== undefined && !validExperience(profile.experience)) return false;
  if (!["projects", "projectIdeas", "applications", "atsChecks"].every(key => Array.isArray(data[key]))) return false;
  return (data.projects as unknown[]).every(item => record(item) && text(item, ["id", "title", "year", "description", "github"]) && validProjectFields(item) && Array.isArray(item.tags) && Array.isArray(item.domains) && Array.isArray(item.bullets)) &&
    (data.projectIdeas as unknown[]).every(item => record(item) && text(item, ["id", "theme", "title", "description", "domain", "sourceCompany", "sourceRole", "createdAt"]) && validStrings(item.keywords, 100, 200)) &&
    (data.applications as unknown[]).every(item => record(item) && text(item, ["id", "company", "role", "jdText", "summary", "status", "text", "createdAt", "domainPrimary"]) && validStrings(item.skills, 100, 200) && validStrings(item.gaps, 100, 200) && Array.isArray(item.projects) && typeof item.atsScore === "number") &&
    (data.atsChecks as unknown[]).every(item => record(item) && text(item, ["id", "resumeName", "sourceType", "jdText", "resumeText", "createdAt"]) && typeof item.score === "number" && Array.isArray(item.categories) && Array.isArray(item.matchedKeywords) && Array.isArray(item.missingMustHave) && Array.isArray(item.missingNiceToHave) && Array.isArray(item.issues));
}

function snapshot(data: BrowserStudioData): BrowserStudioData {
  // Copy only the studio fields. Credentials live under a separate browser key.
  return structuredClone({ profile: data.profile, projects: data.projects, projectIdeas: data.projectIdeas, applications: data.applications, atsChecks: data.atsChecks });
}

export function saveBrowserStudioData(data: BrowserStudioData): void {
  if (typeof window === "undefined") throw new Error("Open the app in a browser to save your studio data.");
  if (!isStudioData(data)) throw new Error("The studio data is incomplete and cannot be saved.");
  const stored: StoredStudioData = { version: 1, ...snapshot(data) };
  try { window.localStorage.setItem(BROWSER_STUDIO_KEY, JSON.stringify(stored)); }
  catch { throw new Error("Your browser could not save this change. Free some site storage or export a backup, then try again."); }
}

export function getBrowserSnapshot(): BrowserStudioData {
  if (typeof window === "undefined") return createBrowserStudioData();
  let raw: string | null;
  try { raw = window.localStorage.getItem(BROWSER_STUDIO_KEY); }
  catch { throw new Error("Your browser could not read saved studio data. Allow site storage and reload."); }
  if (raw === null) {
    const initial = createBrowserStudioData();
    saveBrowserStudioData(initial);
    return initial;
  }
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new Error("Your saved studio data could not be read. Restore a valid backup before making changes."); }
  if (!isStudioData(data) || (data as Partial<StoredStudioData>).version !== 1) throw new Error("Your saved studio data has an unsupported format. Restore a valid backup before making changes.");
  // Empty arrays are intentional. Deleted projects must never be seeded again.
  return snapshot(data);
}

export function updateBrowserStudioData<T>(change: (data: BrowserStudioData) => T): T {
  const next = getBrowserSnapshot();
  const result = change(next);
  saveBrowserStudioData(next);
  return structuredClone(result);
}

export function browserUid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function exportBrowserBackup(): string {
  return JSON.stringify({ version: 1, ...getBrowserSnapshot() }, null, 2);
}

export function importBrowserBackup(raw: string): BrowserStudioData {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error("Choose a valid Resume Studio JSON backup."); }
  if (!isStudioData(data) || (data as Partial<StoredStudioData>).version !== 1) throw new Error("This is not a supported Resume Studio backup.");
  const next = snapshot(data);
  saveBrowserStudioData(next);
  return next;
}
