import { NextRequest, NextResponse } from "next/server";
import { getPublicSettings, saveSettings } from "@/lib/llm";

export async function GET() {
  // Only the masked key ever leaves the server.
  return NextResponse.json({ ok: true, settings: await getPublicSettings() });
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
  if (!body.provider || !body.baseUrl || !body.model) {
    return NextResponse.json(
      { ok: false, error: "Provider, base URL and model are all required." },
      { status: 400 }
    );
  }
  let warning: string | null = null;
  if (
    body.provider === "groq" &&
    body.apiKey &&
    body.apiKey.trim() &&
    !body.apiKey.trim().startsWith("gsk_")
  ) {
    warning =
      "Warning: Groq keys start with gsk_. This key was saved, but Test Connection will likely fail — an xAI/Grok key does not work on Groq.";
  }
  const settings = await saveSettings({
    provider: body.provider,
    baseUrl: body.baseUrl,
    model: body.model,
    apiKey: body.apiKey,
  });
  return NextResponse.json({ ok: true, settings, warning });
}
