import { NextRequest, NextResponse } from "next/server";
import { getApplication, getProfile } from "@/lib/db";
import { buildResumeLayout } from "@/lib/resumeLayout";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [app, profile] = await Promise.all([getApplication(id), getProfile()]);
  if (!app) return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  return NextResponse.json({ layout: await buildResumeLayout(profile, app) }, { headers: { "Cache-Control": "no-store" } });
}
