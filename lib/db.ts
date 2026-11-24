import { neon } from "@neondatabase/serverless";
import { promises as fs } from "fs";
import path from "path";
import { seedProfile, seedProjects } from "./seed";
import type {
  Application,
  AtsCheck,
  Profile,
  Project,
  ProjectIdea,
  ExperienceItem,
  SkillGroup,
} from "./types";

export interface RawLlmSettings {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface DbShape {
  profile: Profile | null;
  projects: Project[];
  projectIdeas: ProjectIdea[];
  applications: Application[];
  atsChecks: AtsCheck[];
  llmSettings: RawLlmSettings | null;
}

const usePg = !!process.env.DATABASE_URL;
let loggedMode = false;

export function canPersistLlmSettings(): boolean {
  return usePg || !process.env.VERCEL;
}

function logMode() {
  if (loggedMode) return;
  loggedMode = true;
  if (usePg) {
    console.log("[db] Using Postgres (DATABASE_URL set)");
  } else {
    console.log(
      "[db] DATABASE_URL not set — using JSON file store (DEMO MODE: data may not persist on Vercel serverless). Set DATABASE_URL (Neon) for real persistence."
    );
  }
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function seedShape(): DbShape {
  return {
    profile: structuredClone(seedProfile),
    projects: structuredClone(seedProjects),
    projectIdeas: [],
    applications: [],
    atsChecks: [],
    llmSettings: null,
  };
}

/* ───────────────────────── JSON file backend ───────────────────────── */

function dataFilePath(): string {
  if (process.env.DATA_FILE) return path.resolve(process.env.DATA_FILE);
  if (process.env.VERCEL) return "/tmp/resume-builder-db.json";
  return path.join(process.cwd(), "data", "db.json");
}

let fileQueue: Promise<unknown> = Promise.resolve();
function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = fileQueue.then(fn, fn);
  fileQueue = run.catch(() => undefined);
  return run;
}

async function loadFromFile(): Promise<DbShape> {
  const file = dataFilePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as DbShape;
    if (!parsed.profile) parsed.profile = structuredClone(seedProfile);
    if (!Array.isArray(parsed.projects) || parsed.projects.length === 0)
      parsed.projects = structuredClone(seedProjects);
    if (!Array.isArray(parsed.applications)) parsed.applications = [];
    if (!Array.isArray(parsed.atsChecks)) parsed.atsChecks = [];
    if (!Array.isArray(parsed.projectIdeas)) parsed.projectIdeas = [];
    return parsed;
  } catch {
    const shape = seedShape();
    await saveToFile(shape);
    return shape;
  }
}

async function saveToFile(shape: DbShape): Promise<void> {
  const file = dataFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(shape, null, 2), "utf8");
}

/* ───────────────────────── Postgres backend ────────────────────────── */

function sqlClient() {
  return neon(process.env.DATABASE_URL as string);
}

let pgReady: Promise<void> | null = null;
function ensurePgTable(): Promise<void> {
  if (!pgReady) {
    const sql = sqlClient();
    pgReady = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS rb_store (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL
      )`;
    })();
  }
  return pgReady;
}

async function loadFromPg(): Promise<DbShape> {
  await ensurePgTable();
  const sql = sqlClient();
  const rows = (await sql`SELECT key, value FROM rb_store`) as {
    key: string;
    value: unknown;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  if (rows.length === 0) {
    const shape = seedShape();
    await saveToPg(shape);
    return shape;
  }
  return {
    profile: (map.get("profile") as Profile) ?? structuredClone(seedProfile),
    projects:
      (map.get("projects") as Project[]) ?? structuredClone(seedProjects),
    projectIdeas: (map.get("projectIdeas") as ProjectIdea[]) ?? [],
    applications: (map.get("applications") as Application[]) ?? [],
    atsChecks: (map.get("atsChecks") as AtsCheck[]) ?? [],
    llmSettings: (map.get("llmSettings") as RawLlmSettings) ?? null,
  };
}

async function saveToPg(shape: DbShape): Promise<void> {
  await ensurePgTable();
  const sql = sqlClient();
  const entries: [string, unknown][] = [
    ["profile", shape.profile],
    ["projects", shape.projects],
    ["projectIdeas", shape.projectIdeas],
    ["applications", shape.applications],
    ["atsChecks", shape.atsChecks],
    ["llmSettings", shape.llmSettings],
  ];
  for (const [key, value] of entries) {
    await sql`INSERT INTO rb_store (key, value) VALUES (${key}, ${JSON.stringify(
      value
    )}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
}

/* ───────────────────────── Unified store ───────────────────────────── */

async function load(): Promise<DbShape> {
  logMode();
  return usePg ? loadFromPg() : withFileLock(loadFromFile);
}

async function update<T>(fn: (shape: DbShape) => T): Promise<T> {
  if (usePg) {
    const shape = await loadFromPg();
    const out = fn(shape);
    await saveToPg(shape);
    return out;
  }
  return withFileLock(async () => {
    const shape = await loadFromFile();
    const out = fn(shape);
    await saveToFile(shape);
    return out;
  });
}

/* ───────────────────────── Public API ──────────────────────────────── */

export async function getProfile(): Promise<Profile> {
  const s = await load();
  return s.profile ?? structuredClone(seedProfile);
}

export async function saveProfile(profile: Profile): Promise<Profile> {
  return update((s) => {
    s.profile = profile;
    return profile;
  });
}

export async function saveExperience(experience: ExperienceItem[]): Promise<Profile> {
  return update(store => { store.profile = { ...(store.profile ?? structuredClone(seedProfile)), experience }; return store.profile; });
}

export async function saveProfileSkills(skillGroups: SkillGroup[]): Promise<Profile> {
  return update(store => { store.profile = { ...(store.profile ?? structuredClone(seedProfile)), skillGroups }; return store.profile; });
}

export async function listProjects(): Promise<Project[]> {
  const s = await load();
  return s.projects;
}

export async function createProject(
  p: Omit<Project, "id">
): Promise<Project> {
  const project: Project = { ...p, id: uid("proj") };
  return update((s) => {
    s.projects = [project, ...s.projects];
    return project;
  });
}

export async function updateProject(
  id: string,
  p: Partial<Project>
): Promise<Project | null> {
  return update((s) => {
    const i = s.projects.findIndex((x) => x.id === id);
    if (i < 0) return null;
    s.projects[i] = { ...s.projects[i], ...p, id };
    return s.projects[i];
  });
}

export async function deleteProject(id: string): Promise<boolean> {
  return update((s) => {
    const before = s.projects.length;
    s.projects = s.projects.filter((x) => x.id !== id);
    return s.projects.length !== before;
  });
}

/* ── Build Later project ideas ────────────────────────────────────────
   Ideas live in their OWN list, deliberately separate from `projects`:
   nothing in the resume builder, ATS engine or Auto-Fix ever reads this
   list, so an idea can never leak into a resume as fake evidence. */

export async function listProjectIdeas(): Promise<ProjectIdea[]> {
  const s = await load();
  return [...s.projectIdeas].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

/** Adds an idea unless one with the same theme already exists (dedupe).
 *  Returns the created idea, or null when it was a duplicate. */
export async function addProjectIdea(
  idea: Omit<ProjectIdea, "id" | "createdAt">
): Promise<ProjectIdea | null> {
  return update((s) => {
    if (s.projectIdeas.some((x) => x.theme === idea.theme)) return null;
    const created: ProjectIdea = {
      ...idea,
      id: uid("idea"),
      createdAt: new Date().toISOString(),
    };
    s.projectIdeas = [created, ...s.projectIdeas];
    return created;
  });
}

export async function getProjectIdea(
  id: string
): Promise<ProjectIdea | null> {
  const s = await load();
  return s.projectIdeas.find((x) => x.id === id) ?? null;
}

export async function deleteProjectIdea(id: string): Promise<boolean> {
  return update((s) => {
    const before = s.projectIdeas.length;
    s.projectIdeas = s.projectIdeas.filter((x) => x.id !== id);
    return s.projectIdeas.length !== before;
  });
}

/** Converts an idea into a REAL project (same shape the Projects API
 *  creates) and removes the idea — atomically, in one store update.
 *  Only from this moment is the content eligible for resumes/ATS. */
export async function convertProjectIdea(
  id: string
): Promise<Project | null> {
  return update((s) => {
    const idea = s.projectIdeas.find((x) => x.id === id);
    if (!idea) return null;
    const project: Project = {
      id: uid("proj"),
      title: idea.title,
      year: String(new Date().getFullYear()),
      description: idea.description,
      tags: [...idea.keywords],
      domains: idea.domain ? [idea.domain] : [],
      github: "",
      bullets: [],
    };
    s.projects = [project, ...s.projects];
    s.projectIdeas = s.projectIdeas.filter((x) => x.id !== id);
    return project;
  });
}

export async function listApplications(): Promise<Application[]> {
  const s = await load();
  return [...s.applications].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export async function createApplication(
  a: Omit<Application, "id" | "createdAt" | "status"> & { status?: string }
): Promise<Application> {
  const app: Application = {
    ...a,
    id: uid("app"),
    status: a.status ?? "Saved",
    createdAt: new Date().toISOString(),
  };
  return update((s) => {
    s.applications = [app, ...s.applications];
    return app;
  });
}

export async function getApplication(id: string): Promise<Application | null> {
  const s = await load();
  return s.applications.find((x) => x.id === id) ?? null;
}

export async function deleteApplication(id: string): Promise<boolean> {
  return update((s) => {
    const before = s.applications.length;
    s.applications = s.applications.filter((x) => x.id !== id);
    return s.applications.length !== before;
  });
}

export async function updateApplicationStatus(
  id: string,
  status: string
): Promise<Application | null> {
  return update((s) => {
    const app = s.applications.find((x) => x.id === id);
    if (!app) return null;
    app.status = status;
    return app;
  });
}

export async function updateApplication(id: string, changes: Partial<Application>): Promise<Application | null> {
  return update(s => {
    const index = s.applications.findIndex(app => app.id === id);
    if (index < 0) return null;
    s.applications[index] = { ...s.applications[index], ...changes, id, createdAt: s.applications[index].createdAt };
    return s.applications[index];
  });
}

export async function listAtsChecks(): Promise<AtsCheck[]> {
  const s = await load();
  return [...s.atsChecks].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
}

export async function createAtsCheck(
  c: Omit<AtsCheck, "id" | "createdAt">
): Promise<AtsCheck> {
  const check: AtsCheck = {
    ...c,
    id: uid("check"),
    createdAt: new Date().toISOString(),
  };
  return update((s) => {
    s.atsChecks = [check, ...s.atsChecks];
    return check;
  });
}

export async function getAtsCheck(id: string): Promise<AtsCheck | null> {
  const s = await load();
  return s.atsChecks.find((x) => x.id === id) ?? null;
}

export async function updateAtsCheckAiNotes(
  id: string,
  notes: string
): Promise<void> {
  await update((s) => {
    const c = s.atsChecks.find((x) => x.id === id);
    if (c) c.aiNotes = notes;
  });
}

export async function deleteAtsCheck(id: string): Promise<boolean> {
  return update((s) => {
    const before = s.atsChecks.length;
    s.atsChecks = s.atsChecks.filter((x) => x.id !== id);
    return s.atsChecks.length !== before;
  });
}

export async function getRawLlmSettings(): Promise<RawLlmSettings | null> {
  const s = await load();
  return s.llmSettings;
}

export async function saveRawLlmSettings(
  settings: RawLlmSettings
): Promise<RawLlmSettings> {
  return update((s) => {
    s.llmSettings = settings;
    return settings;
  });
}
