import { NextResponse } from "next/server";
import { getEffectiveSettings, publicSettings, testConnection } from "@/lib/llm";

export const maxDuration = 60;

export async function POST() {
  const settings = await getEffectiveSettings();
  const result = await testConnection(settings);
  return NextResponse.json({ ...result, settings: publicSettings(settings) });
}
