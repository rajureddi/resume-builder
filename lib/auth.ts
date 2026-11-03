import { createHash } from "crypto";

export const SESSION_COOKIE = "rb_session";

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

export function expectedToken(): string {
  const pw = process.env.APP_PASSWORD ?? "";
  const secret = process.env.SESSION_SECRET ?? pw;
  return createHash("sha256").update(`${pw}|${secret}`).digest("hex");
}

export function passwordMatches(candidate: string): boolean {
  if (!authEnabled()) return true;
  return candidate === process.env.APP_PASSWORD;
}
