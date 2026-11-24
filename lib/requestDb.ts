import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest, NextResponse } from "next/server";
import { seedProfile, seedProjects } from "./seed";
import type { Application, AtsCheck, Profile, Project, ProjectIdea } from "./types";

export interface StudioData {
  profile: Profile;
  projects: Project[];
  projectIdeas: ProjectIdea[];
  applications: Application[];
  atsChecks: AtsCheck[];
}

const requestStore = new AsyncLocalStorage<StudioData>();

export function createStudioData(input?: unknown): StudioData {
  if (input === undefined || input === null) {
    return { profile: structuredClone(seedProfile), projects: structuredClone(seedProjects), projectIdeas: [], applications: [], atsChecks: [] };
  }
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid browser data snapshot.");
  const data = input as Record<string, unknown>;
  if (!data.profile || typeof data.profile !== "object" || Array.isArray(data.profile)) throw new Error("Invalid browser profile.");
  const profile = data.profile as Record<string, unknown>;
  for (const field of ["name", "title", "phone", "email", "github", "linkedin", "portfolio", "summary"]) {
    if (typeof profile[field] !== "string") throw new Error("Invalid browser profile.");
  }
  for (const field of ["education", "skillGroups", "certifications", "coursework"]) {
    if (!Array.isArray(profile[field])) throw new Error("Invalid browser profile.");
  }
  for (const field of ["projects", "projectIdeas", "applications", "atsChecks"] as const) {
    if (!Array.isArray(data[field]) || !(data[field] as unknown[]).every(item => item && typeof item === "object" && !Array.isArray(item) && typeof (item as { id?: unknown }).id === "string")) {
      throw new Error(`Invalid browser ${field}.`);
    }
  }
  // Only the studio data fields enter this request's memory. Credentials have
  // their own request parameter and are never included in the data store.
  return structuredClone({ profile: data.profile, projects: data.projects, projectIdeas: data.projectIdeas, applications: data.applications, atsChecks: data.atsChecks }) as StudioData;
}

export function getStudioData(): StudioData {
  const data = requestStore.getStore();
  if (!data) throw new Error("Browser data must be supplied in a request context.");
  return data;
}

export function runWithStudioData<T>(input: unknown, callback: () => T): T {
  return requestStore.run(createStudioData(input), callback);
}

export function withStudioData<Args extends unknown[]>(handler: (...args: Args) => Promise<Response>, options?: { requireSnapshot?: boolean }) {
  return async (...args: Args): Promise<Response> => {
    const request = args[0] as NextRequest | undefined;
    const body = request && !["GET", "HEAD"].includes(request.method)
      ? await request.clone().json().catch(() => null) : null;
    const hasSnapshot = body && typeof body === "object" && Object.hasOwn(body, "studioData");
    // Nested test/computation calls can share their explicit surrounding
    // context. In production there is no ambient state between requests.
    if (!hasSnapshot && requestStore.getStore()) return handler(...args);
    if (!hasSnapshot && options?.requireSnapshot) {
      return NextResponse.json({ ok: false, error: "Send this browser's saved resume data with the request." }, { status: 400 });
    }
    let data: StudioData;
    try { data = createStudioData(hasSnapshot ? body.studioData : undefined); }
    catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid browser data." }, { status: 400 });
    }
    if (hasSnapshot && request) {
      const { studioData: _snapshot, ...payload } = body;
      args[0] = new NextRequest(request, { body: JSON.stringify(payload) }) as Args[0];
    }
    return requestStore.run(data, () => handler(...args));
  };
}
