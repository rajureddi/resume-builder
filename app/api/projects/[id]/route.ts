import { NextRequest, NextResponse } from "next/server";
import { deleteProject, updateProject } from "@/lib/db";
import type { Project } from "@/lib/types";
import { validProjectFields } from "@/lib/projectValidation";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Partial<Project> | null;
  if (!body || !validProjectFields(body as Record<string, unknown>, true)) {
    return NextResponse.json({ ok: false, error: "Check the project fields and give each stack version a name." }, { status: 400 });
  }
  const updated = await updateProject(id, body);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, project: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const removed = await deleteProject(id);
  return NextResponse.json({ ok: removed });
}
