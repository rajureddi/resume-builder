import { NextRequest, NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/db";
import type { Project } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ ok: true, projects: await listProjects() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Omit<Project, "id"> | null;
  if (!body || !body.title) {
    return NextResponse.json(
      { ok: false, error: "Project needs a title." },
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
  });
  return NextResponse.json({ ok: true, project });
}
