import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { supabaseEnv } from "@/lib/env";

/**
 * Server-side Supabase client wired to the Next.js cookie store. Returns null when
 * Supabase credentials are absent so callers fall back to Postgres sessions instead of
 * throwing during render.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  const env = supabaseEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value }));
      },
      setAll(cookiesToSet) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          }
        } catch (error) {
          // Server Components cannot mutate cookies; middleware and route handlers refresh
          // the session instead. This is expected during render of protected pages.
          console.warn("[supabase] cookie write skipped during render", { error: String(error) });
        }
      },
    },
  });
}
