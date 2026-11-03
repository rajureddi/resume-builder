import { NextResponse } from "next/server";
import { getProfile, listApplications, listAtsChecks, listProjectIdeas, listProjects } from "@/lib/db";
import { getPublicSettings } from "@/lib/llm";

export async function GET() {
  const [profile, projects, applications, atsChecks, projectIdeas, llm] =
    await Promise.all([
      getProfile(),
      listProjects(),
      listApplications(),
      listAtsChecks(),
      listProjectIdeas(),
      getPublicSettings(),
    ]);
  return NextResponse.json({
    ok: true,
    profile,
    projects,
    llm,
    authEnabled: !!process.env.APP_PASSWORD,
    counts: {
      applications: applications.length,
      atsChecks: atsChecks.length,
      projectIdeas: projectIdeas.length,
    },
  });
}
