import { getStudioData, type StudioData } from "./requestDb";
import { seedProfile } from "./seed";
import type { Application, AtsCheck, Profile, Project, ProjectIdea, ExperienceItem, SkillGroup } from "./types";

// This compatibility API operates only on the current request's browser
// snapshot. The browser persists returned changes; the server never stores data.
export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function load(): Promise<StudioData> {
  return getStudioData();
}

async function update<T>(fn: (shape: StudioData) => T): Promise<T> {
  return fn(getStudioData());
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
