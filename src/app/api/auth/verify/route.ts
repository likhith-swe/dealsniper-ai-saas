import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { clientIpFromHeaders, hashIp } from "@/lib/affiliate";
import { consumeMagicLinkToken, createSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, SESSION_TTL_DAYS } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/auth/verify?token=...&next=/dashboard
 *
 * Consumes a magic-link token, opens a server-side session and sets the signed session
 * cookie. Replayed, expired and unknown tokens redirect to /login with an error code
 * instead of returning a raw 500.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const nextParam = request.nextUrl.searchParams.get("next");
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam.slice(0, 120) : "/dashboard";

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", request.nextUrl.origin), 303);
  }

  try {
    const user = await consumeMagicLinkToken(token);
    if (!user) {
      return NextResponse.redirect(new URL("/login?error=expired_or_used", request.nextUrl.origin), 303);
    }

    const ipHash = hashIp(clientIpFromHeaders(request.headers));
    const session = await createSession(user.id, {
      userAgent: request.headers.get("user-agent"),
      ipHash,
    });

    const response = NextResponse.redirect(new URL(nextPath, request.nextUrl.origin), 303);
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: session.cookieValue,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: session.expiresAt,
      maxAge: SESSION_TTL_DAYS * 86_400,
    });
    return response;
  } catch (error) {
    console.error("[api/auth/verify] failure", { error: String(error) });
    return NextResponse.redirect(new URL("/login?error=verification_failed", request.nextUrl.origin), 303);
  }
}
