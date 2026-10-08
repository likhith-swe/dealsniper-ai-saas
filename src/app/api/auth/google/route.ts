import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { supabaseEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/auth/google?next=/dashboard
 *
 * Starts Google OAuth through Supabase when credentials exist. Without them the route
 * redirects to the sign-in page with an actionable error instead of failing silently.
 */
export async function GET(request: NextRequest) {
  const nextParam = request.nextUrl.searchParams.get("next");
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam.slice(0, 120) : "/dashboard";
  const env = supabaseEnv();

  if (!env) {
    return NextResponse.redirect(
      new URL("/login?error=google_not_configured", request.nextUrl.origin),
      303,
    );
  }

  const callbackUrl = new URL("/auth/callback", request.nextUrl.origin);
  callbackUrl.searchParams.set("next", nextPath);

  const authorizeUrl = new URL(`${env.url}/auth/v1/authorize`);
  authorizeUrl.searchParams.set("provider", "google");
  authorizeUrl.searchParams.set("redirect_to", callbackUrl.toString());
  authorizeUrl.searchParams.set("scopes", "email profile");
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authorizeUrl, 303);
}
