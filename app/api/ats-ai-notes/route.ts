import { NextRequest, NextResponse } from "next/server";
import { updateAtsCheckAiNotes } from "@/lib/db";
import { getEffectiveSettings, llmChat, providerLabel } from "@/lib/llm";

export const maxDuration = 60;

// Optional AI judgement notes. Completely separate from the deterministic
// score — the score never waits for, or changes because of, this route.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    checkId?: string;
    resumeText?: string;
    jdText?: string;
    score?: number;
  };
  const settings = await getEffectiveSettings();
  if (!settings.apiKey) {
    return NextResponse.json({
      ok: true,
      aiReview: null,
      message: `No ${providerLabel(settings.provider)} API key saved — add one in Settings → AI Settings to get AI judgement notes. The score above is complete without them.`,
    });
  }
  try {
    const notes = await llmChat({
      messages: [
        {
          role: "system",
          content:
            "You are a senior recruiter reviewing a resume against a job description. Reply in plain text, max 160 words: 3 short sections — Strengths, Weaknesses, Top fixes. Be specific and truthful. Never invent skills the resume does not show.",
        },
        {
          role: "user",
          content: `Deterministic ATS score: ${body.score ?? "n/a"}/100.\n\nJOB DESCRIPTION:\n${(body.jdText ?? "").slice(0, 3000) || "(none provided — general review)"}\n\nRESUME:\n${(body.resumeText ?? "").slice(0, 4000)}`,
        },
      ],
      timeoutMs: 20000,
      maxTokens: 500,
    });
    if (body.checkId) {
      await updateAtsCheckAiNotes(body.checkId, notes.trim());
    }
    return NextResponse.json({ ok: true, aiReview: notes.trim() });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      aiReview: null,
      message:
        e instanceof Error
          ? `AI notes unavailable: ${e.message}`
          : "AI notes unavailable right now. Your score is unaffected.",
    });
  }
}
