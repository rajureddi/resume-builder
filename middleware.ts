import { NextRequest, NextResponse } from "next/server";

const COOKIE = "rb_session";

async function expectedToken(): Promise<string> {
  const pw = process.env.APP_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? pw;
  const data = new TextEncoder().encode(`${pw}|${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  if (!process.env.APP_PASSWORD) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === "/login" ||
    pathname === "/api/login" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.svg";
  if (isPublic) return NextResponse.next();

  const token = req.cookies.get(COOKIE)?.value;
  if (token && token === (await expectedToken())) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized — log in first" },
      { status: 401 }
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
