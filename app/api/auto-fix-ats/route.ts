import { NextRequest, NextResponse } from "next/server";
import {
  createApplication,
  createAtsCheck,
  getApplication,
  getAtsCheck,
  getProfile,
  listApplications,
  listProjects,
} from "@/lib/db";
import { prepareAutoFix } from "@/lib/fix";

export const maxDuration = 60;

// Auto-Fix v2: adds ALL addable missing items (each with its points),
// applies truthful structural fixes, and CREATES A NEW SAVED RESUME
// (an application that opens in the paper view with working Print/PDF).
// Returns the fix report: before → after, per-fix points summing to the
// delta, remaining true gaps with their points, and the new resume id.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    checkId?: string;
    applicationId?: string;
    resumeText?: string;
    jdText?: string;
    sourceType?: string;
    resumeName?: string;
  };

  let resumeText = body.resumeText ?? "";
  let jdText = body.jdText ?? "";
  let sourceType = body.sourceType ?? "paste";
  let resumeName = body.resumeName ?? "Resume";
  let applicationId: string | null = body.applicationId ?? null;

  if (body.checkId) {
    const stored = await getAtsCheck(body.checkId);
    if (stored) {
      resumeText = stored.resumeText;
      jdText = stored.jdText;
      sourceType = stored.sourceType;
      resumeName = stored.resumeName;
      applicationId = applicationId ?? stored.applicationId ?? null;
    }
  }
  if (!resumeText) {
    return NextResponse.json(
      { ok: false, error: "No resume text to fix." },
      { status: 400 }
    );
  }

  const [profile, projects] = await Promise.all([getProfile(), listProjects()]);

  // Base application to clone: explicit id, else a saved resume whose
  // text matches the checked text exactly.
  let baseApplication = applicationId
    ? await getApplication(applicationId)
    : null;
  if (!baseApplication) {
    const apps = await listApplications();
    baseApplication =
      apps.find((a) => a.text === resumeText) ??
      apps.find((a) => `${a.company} — ${a.role}` === resumeName) ??
      null;
  }

  const { report, applicationPayload, afterResult } = await prepareAutoFix({
    resumeText,
    jdText,
    sourceType,
    resumeName,
    baseApplication,
    profile,
    projects,
  });

  if (!applicationPayload || !afterResult) {
    // Nothing truthful to add/fix — plain answer, no fake improvement,
    // no new resume created.
    return NextResponse.json({
      ok: true,
      improved: false,
      beforeScore: report.beforeScore,
      afterScore: report.afterScore,
      fixes: report.fixes,
      remainingGaps: report.remainingGaps,
      manualSuggestions: report.manualSuggestions,
      message: report.message,
      applicationId: null,
      checkId: null,
    });
  }

  const application = await createApplication(applicationPayload);
  const check = await createAtsCheck({
    ...afterResult,
    resumeName: `${application.company} — ${application.role}`,
    sourceType: "saved",
    jdText,
    resumeText: applicationPayload.text,
    aiNotes: null,
    applicationId: application.id,
  });

  return NextResponse.json({
    ok: true,
    improved: report.improved,
    beforeScore: report.beforeScore,
    afterScore: report.afterScore,
    fixes: report.fixes,
    remainingGaps: report.remainingGaps,
    manualSuggestions: report.manualSuggestions,
    message: report.message,
    applicationId: application.id,
    application,
    checkId: check.id,
    check,
  });
}
