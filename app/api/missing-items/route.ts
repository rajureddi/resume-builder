import { NextRequest, NextResponse } from "next/server";
import { getProfile, listProjects } from "@/lib/db";
import { classifyMissingKeywords } from "@/lib/ats";

// Classifies the missing JD keywords of an already-run check into
// addable (evidenced in the user's profile/projects) vs true gaps,
// each with its points. Used for checks saved before missingItems
// existed; new checks carry the same data from /api/check-ats.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    resumeText?: string;
    jdText?: string;
  };
  if (!body.resumeText || !body.jdText) {
    return NextResponse.json({ ok: true, missingItems: [] });
  }
  const [profile, projects] = await Promise.all([getProfile(), listProjects()]);
  const missingItems = classifyMissingKeywords({
    resumeText: body.resumeText,
    jdText: body.jdText,
    profile,
    projects,
  });
  const addable = missingItems.filter((m) => m.addable);
  const gaps = missingItems.filter((m) => !m.addable);
  return NextResponse.json({
    ok: true,
    missingItems,
    addablePoints: Math.round(addable.reduce((a, m) => a + m.points, 0) * 10) / 10,
    gapPoints: Math.round(gaps.reduce((a, m) => a + m.points, 0) * 10) / 10,
  });
}
