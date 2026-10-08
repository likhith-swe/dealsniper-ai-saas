import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { resolveSession } from "@/lib/auth/session";
import { SESSION_COOKIE_NAME, supabaseEnv } from "@/lib/env";
import type { PlanTier, SessionUser } from "@/lib/types";

/**
 * Session resolution order:
 * 1. Supabase Auth session (when NEXT_PUBLIC_SUPABASE_URL + anon key are configured).
 * 2. DealSniper's own Postgres-backed session cookie, which is what a self-hosted
 *    deployment without Supabase uses.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const supabaseUser = await readSupabaseUser();
  if (supabaseUser) return supabaseUser;

  const store = await cookies();
  const rawCookie = store.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (!rawCookie) return null;

  try {
    return await resolveSession(rawCookie);
  } catch (error) {
    console.error("[auth] session resolution failed", { error: String(error) });
    return null;
  }
}

async function readSupabaseUser(): Promise<SessionUser | null> {
  const env = supabaseEnv();
  if (!env) return null;

  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) return null;

    const email = data.user.email.toLowerCase();
    const metadata = (data.user.user_metadata ?? {}) as { full_name?: string; avatar_url?: string };

    const rows = await db
      .insert(profiles)
      .values({
        id: data.user.id,
        email,
        fullName: metadata.full_name ?? null,
        avatarUrl: metadata.avatar_url ?? null,
        authProvider: "google",
      })
      .onConflictDoUpdate({
        target: profiles.email,
        set: { fullName: metadata.full_name ?? null, avatarUrl: metadata.avatar_url ?? null },
      })
      .returning();

    const profile = rows[0];
    if (!profile) return null;

    return toSessionUser(profile);
  } catch (error) {
    console.error("[auth] supabase session read failed", { error: String(error) });
    return null;
  }
}

function toSessionUser(profile: {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isPro: boolean;
  planTier: string;
  customAlertsCount: number;
  authProvider: string;
}): SessionUser {
  const planTier: PlanTier = profile.isPro || profile.planTier === "vip_pro" ? "vip_pro" : "free";
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
    isPro: planTier === "vip_pro",
    planTier,
    customAlertsCount: profile.customAlertsCount,
    provider: profile.authProvider,
  };
}

import { fallbackUsers } from "@/lib/auth/session";

export async function getProfileById(userId: string): Promise<SessionUser | null> {
  try {
    const rows = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    const profile = rows[0];
    if (profile) return toSessionUser(profile);
  } catch {
    // Database offline
  }

  const memUser = Array.from(fallbackUsers.values()).find((u) => u.id === userId);
  if (memUser) {
    return {
      id: memUser.id,
      email: memUser.email,
      fullName: memUser.fullName,
      avatarUrl: null,
      isPro: memUser.isPro,
      planTier: memUser.isPro ? "vip_pro" : "free",
      customAlertsCount: 1,
      provider: "magic_link",
    };
  }
  return null;
}

export async function incrementAlertCount(userId: string): Promise<number> {
  try {
    const rows = await db
      .update(profiles)
      .set({ customAlertsCount: sql`${profiles.customAlertsCount} + 1`, updatedAt: new Date() })
      .where(eq(profiles.id, userId))
      .returning({ customAlertsCount: profiles.customAlertsCount });
    return rows[0]?.customAlertsCount ?? 1;
  } catch {
    return 1;
  }
}

export async function setProStatus(
  userId: string,
  isPro: boolean,
  planTier: PlanTier,
): Promise<SessionUser | null> {
  try {
    const rows = await db
      .update(profiles)
      .set({ isPro, planTier, updatedAt: new Date() })
      .where(eq(profiles.id, userId))
      .returning();
    const profile = rows[0];
    if (profile) return toSessionUser(profile);
  } catch {
    // Database offline
  }

  const memUser = Array.from(fallbackUsers.values()).find((u) => u.id === userId);
  if (memUser) {
    memUser.isPro = isPro;
    return {
      id: memUser.id,
      email: memUser.email,
      fullName: memUser.fullName,
      avatarUrl: null,
      isPro,
      planTier,
      customAlertsCount: 1,
      provider: "magic_link",
    };
  }
  return null;
}
