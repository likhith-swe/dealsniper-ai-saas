import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/auth/signout — revokes the session row and clears the cookie. */
export async function POST(request: NextRequest) {
  const rawCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  try {
    await destroySession(rawCookie);
  } catch (error) {
    console.error("[api/auth/signout] session revoke failed", { error: String(error) });
  }

  const wantsJson = request.headers.get("accept")?.includes("application/json") === true;
  if (wantsJson) {
    const response = NextResponse.json({ ok: true, redirectTo: "/" });
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: "", path: "/", maxAge: 0 });
    return response;
  }

  const response = NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
  response.cookies.set({ name: SESSION_COOKIE_NAME, value: "", path: "/", maxAge: 0 });
  return response;
}
