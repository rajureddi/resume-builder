import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "No file received. Choose a PDF, DOCX or TXT resume file." },
      { status: 400 }
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "No file received. Choose a PDF, DOCX or TXT resume file." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 8 MB.` },
      { status: 400 }
    );
  }
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = "";

  try {
    if (name.endsWith(".pdf")) {
      const { extractText } = await import("unpdf");
      const result = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      text = typeof result.text === "string" ? result.text : (result.text as string[]).join("\n");
    } else if (name.endsWith(".docx")) {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (name.endsWith(".txt") || name.endsWith(".md")) {
      text = buffer.toString("utf8");
    } else {
      return NextResponse.json(
        { ok: false, error: "That file type is not supported. Upload a PDF, DOCX or TXT file." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({
      ok: false,
      noText: true,
      text: "",
      error:
        "This file could not be read — it may be corrupt or password-protected. Try exporting it again as a PDF.",
    });
  }

  text = text.replace(/\r\n/g, "\n").trim();
  if (text.replace(/\s/g, "").length < 40) {
    return NextResponse.json({
      ok: false,
      noText: true,
      text: "",
      fileName: file.name,
      error:
        "This PDF has no readable text (looks scanned) — ATS will also fail to read it. Export a text-based PDF instead.",
    });
  }

  return NextResponse.json({
    ok: true,
    text,
    fileName: file.name,
    sizeBytes: file.size,
    charCount: text.length,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  });
}
