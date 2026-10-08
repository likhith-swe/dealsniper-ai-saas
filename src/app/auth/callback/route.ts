import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { upsertAuthUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /auth/callback?code=...&next=/dashboard
 *
 * Supabase OAuth callback. Exchanges the authorization code for a Supabase session,
 * mirrors the user into `auth_users` and `profiles` (the same rows the
 * `on_auth_user_created` trigger creates in a managed Supabase project), then continues
 * to the requested route.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextParam = request.nextUrl.searchParams.get("next");
  const nextPath = nextParam && nextParam.startsWith("/") ? nextParam.slice(0, 120) : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.nextUrl.origin), 303);
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login?error=google_not_configured", request.nextUrl.origin), 303);
  }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) {
      console.error("[auth/callback] code exchange failed", { error: error?.message });
      return NextResponse.redirect(new URL("/login?error=code_exchange_failed", request.nextUrl.origin), 303);
    }

    const metadata = (data.user.user_metadata ?? {}) as { full_name?: string; avatar_url?: string };
    await upsertAuthUser(data.user.email, "google", {
      id: data.user.id,
      fullName: metadata.full_name ?? null,
      avatarUrl: metadata.avatar_url ?? null,
    });

    return NextResponse.redirect(new URL(nextPath, request.nextUrl.origin), 303);
  } catch (error) {
    console.error("[auth/callback] failure", { error: String(error) });
    return NextResponse.redirect(new URL("/login?error=callback_failed", request.nextUrl.origin), 303);
  }
}
