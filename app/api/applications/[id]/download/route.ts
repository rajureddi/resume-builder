import { withStudioData } from "@/lib/requestDb";
import { NextRequest, NextResponse } from "next/server";
import { getApplication, getProfile } from "@/lib/db";
import {
  buildDocxBuffer,
  buildPdfBuffer,
  resumeFileStem,
  resumeTxt,
} from "@/lib/resumeFiles";

type Ctx = { params: Promise<{ id: string }> };

// Real file downloads for one saved resume, generated from that resume's
// own browser-supplied content. POST { studioData, format } supports pdf,
// docx and txt. Every format is a direct attachment
// download — PDF included (built server-side with pdf-lib, never the
// browser print flow).
async function handlePOST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const format = typeof body?.format === "string" ? body.format.toLowerCase() : "txt";

  const [application, profile] = await Promise.all([
    getApplication(id),
    getProfile(),
  ]);
  if (!application) {
    return NextResponse.json(
      { ok: false, error: "Resume not found" },
      { status: 404 }
    );
  }
  const stem = resumeFileStem(profile, application);

  if (format === "pdf") {
    const buf = await buildPdfBuffer(profile, application);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${stem}.pdf"`,
        "Content-Length": String(buf.length),
      },
    });
  }
  if (format === "docx") {
    const buf = await buildDocxBuffer(profile, application);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${stem}.docx"`,
        "Content-Length": String(buf.length),
      },
    });
  }
  if (format === "txt") {
    return new NextResponse(resumeTxt(application), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${stem}.txt"`,
      },
    });
  }
  return NextResponse.json(
    { ok: false, error: "format must be pdf, docx or txt" },
    { status: 400 }
  );
}

export const POST = withStudioData(handlePOST, { requireSnapshot: true });

export async function GET() {
  return NextResponse.json({ error: "Download this resume from the browser using POST with its local data." }, { status: 405 });
}
