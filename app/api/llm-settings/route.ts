import { NextResponse } from "next/server";
import { getPublicSettings } from "@/lib/llm";

export async function GET() {
  return NextResponse.json({ ok: true, settings: await getPublicSettings() });
}

export async function PUT() {
  return NextResponse.json({ ok: false, error: "API settings are saved in your browser. Use Save on this device in AI Settings." }, { status: 405 });
}
