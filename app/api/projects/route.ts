import { withStudioData } from "@/lib/requestDb";
import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/db";
import type { Project } from "@/lib/types";
import { validProjectFields } from "@/lib/projectValidation";

async function handleGET() {
  return NextResponse.json({ ok: true, projects: await listProjects() });
}

async function handlePOST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Omit<Project, "id"> | null;
  if (!body || !validProjectFields(body as unknown as Record<string, unknown>)) {
    return NextResponse.json(
      { ok: false, error: "Add a project title, valid technology lists and a name for each stack version." },
      { status: 400 }
    );
  }
  const project = await createProject({
    title: body.title,
    year: body.year ?? "",
    description: body.description ?? "",
    tags: body.tags ?? [],
    domains: body.domains ?? [],
    github: body.github ?? "",
    bullets: body.bullets ?? [],
    highlight: body.highlight,
    stackVariants: body.stackVariants,
    templateId: body.templateId,
  });
  return NextResponse.json({ ok: true, project });
}

export const GET = withStudioData(handleGET);
export const POST = withStudioData(handlePOST);
