import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, expectedToken, passwordMatches } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as {
    password?: string;
  };
  if (!password || !passwordMatches(password)) {
    return NextResponse.json(
      { ok: false, error: "Wrong password. Try again." },
      { status: 401 }
    );
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
