import { NextRequest, NextResponse } from "next/server";
import { createAtsCheck, getProfile, listProjects } from "@/lib/db";
import { checkAtsEngine, classifyMissingKeywords } from "@/lib/ats";

// NOTE: this route makes ZERO LLM calls. The ATS score is fully
// deterministic — same resume + same JD always returns the same score.
// Missing keywords are classified (addable vs true gap, with points)
// from the user's own profile/project evidence — also rule-based.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    resumeText?: string;
    jdText?: string;
    sourceType?: string;
    resumeName?: string;
    applicationId?: string;
  };
  if (!body.resumeText || body.resumeText.trim().length < 20) {
    return NextResponse.json(
      { ok: false, error: "Add a resume first — upload a file, pick a saved resume, or paste the text." },
      { status: 400 }
    );
  }
  const result = checkAtsEngine({
    resumeText: body.resumeText,
    jdText: body.jdText ?? "",
    sourceType: body.sourceType ?? "paste",
  });
  const [profile, projects] = await Promise.all([getProfile(), listProjects()]);
  const missingItems = classifyMissingKeywords({
    resumeText: body.resumeText,
    jdText: body.jdText ?? "",
    result,
    profile,
    projects,
  });
  const check = await createAtsCheck({
    ...result,
    resumeName: body.resumeName ?? "Untitled resume",
    sourceType: body.sourceType ?? "paste",
    jdText: body.jdText ?? "",
    resumeText: body.resumeText,
    aiNotes: null,
    missingItems,
    applicationId: body.applicationId ?? null,
  });
  return NextResponse.json({ ok: true, check });
}
