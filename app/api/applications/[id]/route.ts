import { NextRequest, NextResponse } from "next/server";
import {
  deleteApplication,
  getApplication,
  updateApplicationStatus,
} from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const application = await getApplication(id);
  if (!application) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, application });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (!status) {
    return NextResponse.json({ ok: false, error: "Status required" }, { status: 400 });
  }
  const application = await updateApplicationStatus(id, status);
  if (!application) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, application });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const removed = await deleteApplication(id);
  return NextResponse.json({ ok: removed });
}
