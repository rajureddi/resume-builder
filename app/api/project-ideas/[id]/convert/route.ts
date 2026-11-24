import { withStudioData } from "@/lib/requestDb";
import { NextRequest, NextResponse } from "next/server";
import { convertProjectIdea } from "@/lib/db";

// Convert a build-later idea into a REAL project: the project is created
// with the idea's title / description / keywords (as tags) / domain, and
// the idea is removed. From this moment the project is a normal library
// project — eligible for JD ranking, resumes and ATS evidence.
async function handlePOST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await convertProjectIdea(id);
  if (!project) {
    return NextResponse.json(
      { ok: false, error: "Idea not found." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, project });
}

export const POST = withStudioData(handlePOST);
