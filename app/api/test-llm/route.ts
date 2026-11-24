import { NextRequest, NextResponse } from "next/server";
import { getEffectiveSettings, publicSettings, testConnection } from "@/lib/llm";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const settings = await getEffectiveSettings(body?.llmSettings);
  const result = await testConnection(settings);
  return NextResponse.json({ ...result, settings: publicSettings(settings) });
}
