import { NextResponse } from "next/server";
import { testConnection } from "@/lib/llm";

export const maxDuration = 60;

export async function POST() {
  const result = await testConnection();
  return NextResponse.json({ ok: result.ok, message: result.message });
}
