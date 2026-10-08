import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { authSessions, authTokens, authUsers, profiles } from "@/db/schema";
import { SESSION_TTL_DAYS, sessionSecret } from "@/lib/env";
import type { SessionUser } from "@/lib/types";

// In-memory fallback stores for unseeded or offline environments
const globalAuth = globalThis as typeof globalThis & {
  __dsFallbackUsers?: Map<string, { id: string; email: string; fullName: string | null; isPro: boolean }>;
  __dsFallbackTokens?: Map<string, { userId: string; email: string; expiresAt: Date }>;
  __dsFallbackSessions?: Map<string, { userId: string; secret: string; expiresAt: Date }>;
};

if (!globalAuth.__dsFallbackUsers) globalAuth.__dsFallbackUsers = new Map();
if (!globalAuth.__dsFallbackTokens) globalAuth.__dsFallbackTokens = new Map();
if (!globalAuth.__dsFallbackSessions) globalAuth.__dsFallbackSessions = new Map();

export const fallbackUsers = globalAuth.__dsFallbackUsers;
export const fallbackTokens = globalAuth.__dsFallbackTokens;
export const fallbackSessions = globalAuth.__dsFallbackSessions;

export interface SessionCookiePayload {
  sessionId: string;
  secret: string;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(`${sessionSecret()}:${secret}`).digest("hex");
}

export function serializeSessionCookie(payload: SessionCookiePayload): string {
  return `${payload.sessionId}.${payload.secret}`;
}

export function parseSessionCookie(raw: string | undefined | null): SessionCookiePayload | null {
  if (!raw) return null;
  const separator = raw.indexOf(".");
  if (separator <= 0) return null;
  const sessionId = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || secret.length < 16) return null;
  return { sessionId, secret };
}

export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashSecret(raw) };
}

export function hashToken(raw: string): string {
  return hashSecret(raw);
}

export function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export interface MagicLinkRecord {
  id: string;
  email: string;
  token: string;
  expiresAt: Date;
}

/** Issues a single-use magic link token valid for 15 minutes. */
export async function issueMagicLink(
  email: string,
  options: { purpose?: string; ttlSeconds?: number } = {},
): Promise<MagicLinkRecord> {
  const normalizedEmail = email.trim().toLowerCase();
  const ttlSeconds = options.ttlSeconds ?? 900;

  const user = await upsertAuthUser(normalizedEmail, "magic_link");
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  try {
    await db.insert(authTokens).values({
      userId: user.id,
      tokenHash: token.hash,
      purpose: options.purpose ?? "magic_link",
      expiresAt,
    });

    // Housekeeping: drop tokens that expired more than a day ago.
    await db
      .delete(authTokens)
      .where(sql`${authTokens.expiresAt} < now() - interval '1 day'`);
  } catch (error) {
    console.warn("[auth] Storing magic link token in fallback memory store:", (error as Error)?.message || error);
    fallbackTokens.set(token.hash, { userId: user.id, email: normalizedEmail, expiresAt });
  }

  return { id: user.id, email: normalizedEmail, token: token.raw, expiresAt };
}

export async function upsertAuthUser(
  email: string,
  provider: string,
  options: { id?: string; fullName?: string | null; avatarUrl?: string | null } = {},
): Promise<{ id: string; email: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    const inserted = await db
      .insert(authUsers)
      .values({
        ...(options.id ? { id: options.id } : {}),
        email: normalizedEmail,
        provider,
        lastSignInAt: new Date(),
      })
      .onConflictDoUpdate({
        target: authUsers.email,
        set: { provider, lastSignInAt: new Date() },
      })
      .returning({ id: authUsers.id, email: authUsers.email });

    const user = inserted[0];
    if (user) {
      await db
        .insert(profiles)
        .values({
          id: user.id,
          email: normalizedEmail,
          fullName: options.fullName ?? null,
          avatarUrl: options.avatarUrl ?? null,
          authProvider: provider,
        })
        .onConflictDoNothing({ target: profiles.email });

      return user;
    }
  } catch (error) {
    console.warn("[auth] Database offline, using in-memory user store:", (error as Error)?.message || error);
  }

  // Fallback in-memory user
  let user = fallbackUsers.get(normalizedEmail);
  if (!user) {
    user = {
      id: options.id ?? randomUUID(),
      email: normalizedEmail,
      fullName: options.fullName ?? null,
      isPro: false,
    };
    fallbackUsers.set(normalizedEmail, user);
  }
  return { id: user.id, email: user.email };
}

/** Consumes a magic link token and returns the authenticated user, or null when invalid. */
export async function consumeMagicLinkToken(rawToken: string): Promise<{ id: string; email: string } | null> {
  const tokenHash = hashToken(rawToken);
  try {
    const rows = await db
      .select({
        tokenId: authTokens.id,
        userId: authTokens.userId,
        expiresAt: authTokens.expiresAt,
        email: authUsers.email,
      })
      .from(authTokens)
      .innerJoin(authUsers, eq(authUsers.id, authTokens.userId))
      .where(and(eq(authTokens.tokenHash, tokenHash), isNull(authTokens.consumedAt)))
      .limit(1);

    const row = rows[0];
    if (row) {
      if (row.expiresAt.getTime() < Date.now()) return null;
      await db.update(authTokens).set({ consumedAt: new Date() }).where(eq(authTokens.id, row.tokenId));
      await db.update(authUsers).set({ lastSignInAt: new Date() }).where(eq(authUsers.id, row.userId));
      return { id: row.userId, email: row.email };
    }
  } catch {
    // Database offline, check fallback memory store
  }

  const memToken = fallbackTokens.get(tokenHash);
  if (memToken) {
    if (memToken.expiresAt.getTime() < Date.now()) {
      fallbackTokens.delete(tokenHash);
      return null;
    }
    fallbackTokens.delete(tokenHash);
    return { id: memToken.userId, email: memToken.email };
  }

  return null;
}

export interface IssuedSession {
  cookieValue: string;
  expiresAt: Date;
}

export async function createSession(
  userId: string,
  context: { userAgent?: string | null; ipHash?: string | null } = {},
): Promise<IssuedSession> {
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  const sessionId = randomUUID();

  try {
    const inserted = await db
      .insert(authSessions)
      .values({
        id: sessionId,
        userId,
        tokenHash: hashSecret(secret),
        userAgent: context.userAgent?.slice(0, 240) ?? null,
        ipHash: context.ipHash ?? null,
        expiresAt,
      })
      .returning({ id: authSessions.id });

    const session = inserted[0];
    if (session) {
      return { cookieValue: serializeSessionCookie({ sessionId: session.id, secret }), expiresAt };
    }
  } catch (error) {
    console.warn("[auth] Storing session in fallback memory store:", (error as Error)?.message || error);
  }

  fallbackSessions.set(sessionId, { userId, secret, expiresAt });
  return { cookieValue: serializeSessionCookie({ sessionId, secret }), expiresAt };
}

export async function resolveSession(rawCookie: string | undefined | null): Promise<SessionUser | null> {
  const parsed = parseSessionCookie(rawCookie);
  if (!parsed) return null;

  try {
    const rows = await db
      .select({
        sessionId: authSessions.id,
        tokenHash: authSessions.tokenHash,
        expiresAt: authSessions.expiresAt,
        userId: profiles.id,
        email: profiles.email,
        fullName: profiles.fullName,
        avatarUrl: profiles.avatarUrl,
        isPro: profiles.isPro,
        planTier: profiles.planTier,
        customAlertsCount: profiles.customAlertsCount,
        authProvider: profiles.authProvider,
      })
      .from(authSessions)
      .innerJoin(profiles, eq(profiles.id, authSessions.userId))
      .where(and(eq(authSessions.id, parsed.sessionId), gt(authSessions.expiresAt, new Date())))
      .limit(1);

    const row = rows[0];
    if (row) {
      if (!safeEqualHex(row.tokenHash, hashSecret(parsed.secret))) {
        console.warn("[auth] session secret mismatch rejected", { sessionId: row.sessionId });
        return null;
      }

      return {
        id: row.userId,
        email: row.email,
        fullName: row.fullName,
        avatarUrl: row.avatarUrl,
        isPro: row.isPro,
        planTier: row.planTier === "vip_pro" ? "vip_pro" : "free",
        customAlertsCount: row.customAlertsCount,
        provider: row.authProvider,
      };
    }
  } catch {
    // Database offline
  }

  const memSession = fallbackSessions.get(parsed.sessionId);
  if (memSession) {
    if (memSession.expiresAt.getTime() < Date.now()) {
      fallbackSessions.delete(parsed.sessionId);
      return null;
    }
    if (memSession.secret !== parsed.secret) return null;
    const user = Array.from(fallbackUsers.values()).find((u) => u.id === memSession.userId);
    return {
      id: memSession.userId,
      email: user?.email ?? "trader@dealsniper.ai",
      fullName: user?.fullName ?? "DealSniper Pro User",
      avatarUrl: null,
      isPro: user?.isPro ?? true,
      planTier: user?.isPro ? "vip_pro" : "free",
      customAlertsCount: 2,
      provider: "magic_link",
    };
  }

  return null;
}

export async function destroySession(rawCookie: string | undefined | null): Promise<void> {
  const parsed = parseSessionCookie(rawCookie);
  if (!parsed) return;
  try {
    await db.delete(authSessions).where(eq(authSessions.id, parsed.sessionId));
  } catch {}
  fallbackSessions.delete(parsed.sessionId);
}

export async function pruneExpiredSessions(): Promise<number> {
  try {
    const removed = await db.delete(authSessions).where(sql`${authSessions.expiresAt} < now()`).returning({ id: authSessions.id });
    return removed.length;
  } catch {
    return 0;
  }
}
