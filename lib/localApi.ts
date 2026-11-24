import { browserUid, getBrowserSnapshot, updateBrowserStudioData } from "./browserDb";
import { getLocalPublicSettings } from "./localLlmSettings";
import { checkAtsEngine } from "./ats";
import { buildResumeText } from "./tailor";
import { resumeProfile } from "./resumeContent";
import { validExperience, validSkillGroups, validStrings } from "./profileValidation";
import { validProjectFields } from "./projectValidation";
import type { Application, AtsCheck, Profile, Project, ProjectIdea, ResumeTemplate } from "./types";

type LocalResult = { handled: false } | { handled: true; data: unknown };
const done = (data: unknown): LocalResult => ({ handled: true, data });
const success = (data: Record<string, unknown> = {}) => done({ ok: true, ...data });
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function fail(message: string): never { throw new Error(message); }
const sorted = <T extends { createdAt: string }>(values: T[]) => [...values].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

function updateResume(current: Application, body: Record<string, unknown>, profile: Profile): Application {
  const changes: Partial<Application> = {};
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !["Saved", "Applied", "Interview", "Offer", "Rejected"].includes(body.status)) fail("Invalid status");
    changes.status = body.status;
  }
  if (body.summary !== undefined) {
    if (typeof body.summary !== "string" || body.summary.length > 2000) fail("Summary must be text under 2,000 characters");
    changes.summary = body.summary.trim();
  }
  if (body.skills !== undefined) {
    if (!validStrings(body.skills, 60, 80)) fail("Use up to 60 skills, each under 80 characters");
    changes.skills = [...new Set(body.skills.map(skill => skill.trim()).filter(Boolean))];
  }
  if (body.resumeTemplate !== undefined) {
    if (typeof body.resumeTemplate !== "string" || !["classic", "modern", "compact"].includes(body.resumeTemplate)) fail("Invalid layout");
    changes.resumeTemplate = body.resumeTemplate as ResumeTemplate;
  }
  if (body.skillGroups !== undefined) {
    if (!validSkillGroups(body.skillGroups) || body.skillGroups.length > 10) fail("Invalid skill categories");
    changes.skillGroups = body.skillGroups.map(group => ({ label: group.label.trim(), items: [...new Set(group.items.map(item => item.trim()).filter(Boolean))] }));
    changes.skills = [...new Set(changes.skillGroups.flatMap(group => group.items))];
    if (changes.skills.length > 60) fail("Use up to 60 technical skills");
  }
  if (body.interests !== undefined) {
    if (!validStrings(body.interests, 10, 80)) fail("Invalid interests");
    changes.interests = body.interests.map(item => item.trim()).filter(Boolean);
  }
  if (body.skillLayout !== undefined) {
    if (body.skillLayout !== "stacked" && body.skillLayout !== "columns") fail("Invalid skills layout");
    changes.skillLayout = body.skillLayout;
  }
  for (const key of ["showContactIcons", "showSectionRules"] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") fail("Invalid display setting");
      changes[key] = body[key];
    }
  }
  if (!Object.keys(changes).length) fail("No resume changes received");
  const edited = { ...current, ...changes };
  if (Object.keys(changes).some(key => key !== "status")) {
    edited.profileSnapshot = structuredClone(resumeProfile(current, profile));
    edited.text = buildResumeText(edited.profileSnapshot, edited);
    edited.atsScore = checkAtsEngine({ resumeText: edited.text, jdText: edited.jdText, sourceType: "saved" }).score;
  }
  return edited;
}

export function tryLocalApi(path: string, method: string, json?: unknown): LocalResult {
  if (typeof window === "undefined") return { handled: false };
  const body = object(json);
  if (path === "/api/bootstrap" && method === "GET") {
    const data = getBrowserSnapshot();
    return success({ profile: data.profile, projects: data.projects, llm: getLocalPublicSettings(), authEnabled: false,
      counts: { applications: data.applications.length, atsChecks: data.atsChecks.length, projectIdeas: data.projectIdeas.length } });
  }
  if (path === "/api/profile") {
    if (method === "GET") return success({ profile: getBrowserSnapshot().profile });
    if (method === "PUT") {
      if (!body || typeof body.name !== "string" || !body.name.trim() || typeof body.email !== "string" || !body.email.trim()) fail("Profile needs at least a name and an email.");
      return success({ profile: updateBrowserStudioData(data => {
        const next = { ...data.profile, ...body } as Profile;
        if (!validSkillGroups(next.skillGroups) || !validStrings(next.certifications, 100, 500) || !validStrings(next.coursework, 100, 500) || !Array.isArray(next.education) || !next.education.every(item => item && [item.title, item.org, item.period, item.detail].every(value => typeof value === "string"))) fail("Check your profile lists and education fields.");
        if (next.experience !== undefined && !validExperience(next.experience)) fail("Check your experience fields.");
        for (const key of ["name", "title", "phone", "email", "github", "linkedin", "portfolio", "summary"] as const) if (typeof next[key] !== "string") fail("Profile fields must be text.");
        data.profile = next;
        return next;
      }) });
    }
  }
  if (path === "/api/skills") {
    if (method === "GET") return success({ skillGroups: getBrowserSnapshot().profile.skillGroups });
    if (method === "PUT") {
      if (!body || !validSkillGroups(body.skillGroups)) fail("Use labelled skill categories with up to 100 skills in total.");
      const groups = body.skillGroups.map(group => ({ label: group.label.trim(), items: [...new Set(group.items.map(item => item.trim()).filter(Boolean))] }));
      const profile = updateBrowserStudioData(data => { data.profile.skillGroups = groups; return data.profile; });
      return success({ profile, skillGroups: profile.skillGroups });
    }
  }
  if (path === "/api/experience") {
    if (method === "GET") return success({ experience: getBrowserSnapshot().profile.experience ?? [] });
    if (method === "PUT") {
      if (!body || !validExperience(body.experience)) fail("Add a role, company, valid dates and bullet points for each experience entry.");
      const experience = body.experience.map(item => ({ ...item, title: item.title.trim(), company: item.company.trim(), bullets: item.bullets.map(bullet => bullet.trim()).filter(Boolean), skills: [...new Set(item.skills.map(skill => skill.trim()).filter(Boolean))] }));
      const profile = updateBrowserStudioData(data => { data.profile.experience = experience; return data.profile; });
      return success({ profile, experience: profile.experience });
    }
  }
  if (path === "/api/projects") {
    if (method === "GET") return success({ projects: getBrowserSnapshot().projects });
    if (method === "POST") {
      if (!body || !validProjectFields(body)) fail("Add a project title, valid technology lists and a name for each stack version.");
      const project: Project = { id: browserUid("proj"), title: body.title as string, year: body.year as string ?? "", description: body.description as string ?? "", tags: body.tags as string[] ?? [], domains: body.domains as string[] ?? [], github: body.github as string ?? "", bullets: body.bullets as string[] ?? [], highlight: body.highlight as string | undefined, stackVariants: body.stackVariants as Project["stackVariants"], templateId: body.templateId as string | undefined };
      return success({ project: updateBrowserStudioData(data => { data.projects.unshift(project); return project; }) });
    }
  }
  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const id = decodeURIComponent(projectMatch[1]);
    if (method === "GET") return success({ project: getBrowserSnapshot().projects.find(item => item.id === id) ?? fail("Project not found") });
    if (method === "PUT") {
      if (!body || !validProjectFields(body, true)) fail("Check the project fields and give each stack version a name.");
      return success({ project: updateBrowserStudioData(data => {
        const index = data.projects.findIndex(item => item.id === id);
        if (index < 0) fail("Project not found");
        const allowed = Object.fromEntries(Object.entries(body).filter(([key]) => ["title", "year", "description", "tags", "domains", "github", "bullets", "highlight", "stackVariants", "templateId"].includes(key)));
        data.projects[index] = { ...data.projects[index], ...allowed, id };
        return data.projects[index];
      }) });
    }
    if (method === "DELETE") return done({ ok: updateBrowserStudioData(data => { const count = data.projects.length; data.projects = data.projects.filter(item => item.id !== id); return count !== data.projects.length; }) });
  }
  if (path === "/api/applications" && method === "GET") return success({ applications: sorted(getBrowserSnapshot().applications) });
  const appMatch = path.match(/^\/api\/applications\/([^/]+)$/);
  if (appMatch) {
    const id = decodeURIComponent(appMatch[1]);
    if (method === "GET") return success({ application: getBrowserSnapshot().applications.find(item => item.id === id) ?? fail("Resume not found") });
    if (method === "PATCH") {
      if (!body) fail("Invalid resume changes");
      return success({ application: updateBrowserStudioData(data => {
        const index = data.applications.findIndex(item => item.id === id);
        if (index < 0) fail("Resume not found");
        data.applications[index] = updateResume(data.applications[index], body, data.profile);
        return data.applications[index];
      }) });
    }
    if (method === "DELETE") return done({ ok: updateBrowserStudioData(data => { const count = data.applications.length; data.applications = data.applications.filter(item => item.id !== id); return count !== data.applications.length; }) });
  }
  if (path === "/api/ats-checks" && method === "GET") return success({ checks: sorted(getBrowserSnapshot().atsChecks).map(({ resumeText: _text, jdText, ...rest }) => ({ ...rest, hasJd: jdText.trim().length > 0 })) });
  const checkMatch = path.match(/^\/api\/ats-checks\/([^/]+)$/);
  if (checkMatch) {
    const id = decodeURIComponent(checkMatch[1]);
    if (method === "GET") return success({ check: getBrowserSnapshot().atsChecks.find(item => item.id === id) ?? fail("ATS check not found") });
    if (method === "DELETE") return done({ ok: updateBrowserStudioData(data => { const count = data.atsChecks.length; data.atsChecks = data.atsChecks.filter(item => item.id !== id); return count !== data.atsChecks.length; }) });
  }
  if (path === "/api/project-ideas") {
    if (method === "GET") return success({ ideas: sorted(getBrowserSnapshot().projectIdeas) });
    if (method === "POST" && body && typeof body.jdText === "string" && body.jdText.trim().length >= 30) return { handled: false };
    if (method === "POST") {
      if (!body || typeof body.title !== "string" || !body.title.trim()) fail("Provide a job description to analyse, or a title to add an idea manually.");
      const title = body.title.trim();
      const idea: ProjectIdea = { id: browserUid("idea"), createdAt: new Date().toISOString(), theme: `manual-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, title, description: typeof body.description === "string" ? body.description.trim() : "", keywords: Array.isArray(body.keywords) ? body.keywords.filter((item): item is string => typeof item === "string" && !!item.trim()).map(item => item.trim()) : [], domain: typeof body.domain === "string" ? body.domain.trim() : "", sourceCompany: typeof body.company === "string" ? body.company.trim() : "", sourceRole: typeof body.role === "string" ? body.role.trim() : "" };
      return success({ idea: updateBrowserStudioData(data => { if (data.projectIdeas.some(item => item.theme === idea.theme)) fail("An idea with this theme already exists."); data.projectIdeas.unshift(idea); return idea; }) });
    }
  }
  const ideaMatch = path.match(/^\/api\/project-ideas\/([^/]+)(\/convert)?$/);
  if (ideaMatch) {
    const id = decodeURIComponent(ideaMatch[1]);
    if (ideaMatch[2] && method === "POST") return success({ project: updateBrowserStudioData(data => {
      const idea = data.projectIdeas.find(item => item.id === id) ?? fail("Idea not found.");
      const project: Project = { id: browserUid("proj"), title: idea.title, year: String(new Date().getFullYear()), description: idea.description, tags: [...idea.keywords], domains: idea.domain ? [idea.domain] : [], github: "", bullets: [] };
      data.projects.unshift(project); data.projectIdeas = data.projectIdeas.filter(item => item.id !== id);
      return project;
    }) });
    if (!ideaMatch[2] && method === "DELETE") {
      updateBrowserStudioData(data => { if (!data.projectIdeas.some(item => item.id === id)) fail("Idea not found."); data.projectIdeas = data.projectIdeas.filter(item => item.id !== id); });
      return success();
    }
  }
  return { handled: false };
}

export function needsStudioSnapshot(path: string, method: string): boolean {
  return method === "POST" && (new Set(["/api/analyze-job", "/api/tailor-resume", "/api/check-ats", "/api/missing-items", "/api/auto-fix-ats", "/api/ats-ai-notes", "/api/project-ideas"]).has(path) || /^\/api\/applications\/[^/]+\/(layout|download)$/.test(path));
}

export function studioSnapshotForRequest(path: string, requestJson: unknown) {
  const saved = getBrowserSnapshot();
  const body = object(requestJson);
  const snapshot = { profile: saved.profile, projects: saved.projects, projectIdeas: [] as ProjectIdea[], applications: [] as Application[], atsChecks: [] as AtsCheck[] };
  if (["/api/analyze-job", "/api/tailor-resume", "/api/project-ideas"].includes(path)) snapshot.projectIdeas = saved.projectIdeas;
  if (path === "/api/auto-fix-ats") {
    const check = saved.atsChecks.find(item => item.id === body?.checkId);
    if (check) snapshot.atsChecks = [check];
    const appId = body?.applicationId ?? check?.applicationId;
    const resumeText = check?.resumeText ?? body?.resumeText;
    const resumeName = check?.resumeName ?? body?.resumeName;
    const app = saved.applications.find(item => item.id === appId) ?? saved.applications.find(item => item.text === resumeText) ?? saved.applications.find(item => `${item.company} — ${item.role}` === resumeName);
    if (app) snapshot.applications = [app];
  }
  if (path === "/api/ats-ai-notes") {
    snapshot.projects = [];
    const check = saved.atsChecks.find(item => item.id === body?.checkId);
    if (check) snapshot.atsChecks = [check];
  }
  const exportMatch = path.match(/^\/api\/applications\/([^/]+)\/(layout|download)$/);
  if (exportMatch) {
    snapshot.projects = [];
    snapshot.applications = saved.applications.filter(item => item.id === decodeURIComponent(exportMatch[1]));
  }
  return snapshot;
}

export function persistComputedResult(path: string, payload: unknown, requestJson: unknown): void {
  if (typeof window === "undefined") return;
  const data = object(payload);
  const body = object(requestJson);
  if (!data) return;
  const application = object(data.application) as Application | null;
  const check = object(data.check) as AtsCheck | null;
  const ideas = [data.ideasAdded, data.added].flatMap(value => Array.isArray(value) ? value : []).filter((value): value is ProjectIdea => !!object(value) && typeof value.id === "string" && typeof value.theme === "string");
  const notes = path === "/api/ats-ai-notes" && typeof body?.checkId === "string" && typeof data.aiReview === "string" ? data.aiReview : null;
  if (!application && !check && !ideas.length && notes === null) return;
  updateBrowserStudioData(store => {
    if (application && typeof application.id === "string") { const index = store.applications.findIndex(item => item.id === application.id); if (index < 0) store.applications.unshift(application); else store.applications[index] = application; }
    if (check && typeof check.id === "string") { const index = store.atsChecks.findIndex(item => item.id === check.id); if (index < 0) store.atsChecks.unshift(check); else store.atsChecks[index] = check; }
    for (const idea of ideas) if (!store.projectIdeas.some(item => item.theme === idea.theme)) store.projectIdeas.unshift(idea);
    if (notes !== null) { const saved = store.atsChecks.find(item => item.id === body!.checkId); if (saved) saved.aiNotes = notes; }
  });
}
