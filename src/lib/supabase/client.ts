"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client for Google OAuth sign-in. Returns null when the deployment
 * does not configure Supabase, in which case the UI routes users to the built-in
 * magic-link flow backed by Postgres sessions.
 */
export function createSupabaseBrowserClient(): SupabaseClient | null {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  cached = createBrowserClient(url, anonKey);
  return cached;
}

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function signInWithGoogleBrowser(redirectTo: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) {
    return {
      ok: false,
      error: "Google OAuth requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { access_type: "offline", prompt: "consent" } },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
