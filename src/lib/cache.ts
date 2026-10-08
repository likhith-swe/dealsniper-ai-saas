import { and, eq, gt, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { apiCache } from "@/db/schema";
import { upstashEnv } from "@/lib/env";

export type CacheBackend = "redis" | "postgres";

export interface CacheReadResult<T> {
  hit: boolean;
  value: T | null;
  backend: CacheBackend;
}

/**
 * Two-tier cache. Upstash Redis is used when credentials exist (single-digit
 * millisecond reads, shared across regions). Postgres `api_cache` is the durable
 * fallback so caching still works in a self-hosted or single-node deployment.
 */

async function redisCommand<T>(command: string, body: unknown): Promise<T | null> {
  const env = upstashEnv();
  if (!env) return null;
  try {
    const response = await fetch(`${env.url}/${command}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { result?: T };
    return payload.result ?? null;
  } catch {
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<CacheReadResult<T>> {
  const redisValue = await redisCommand<string>("get", [key]);
  if (redisValue) {
    try {
      return { hit: true, value: JSON.parse(redisValue) as T, backend: "redis" };
    } catch {
      return { hit: false, value: null, backend: "redis" };
    }
  }

  try {
    const rows = await db
      .select({ payload: apiCache.payload })
      .from(apiCache)
      .where(and(eq(apiCache.cacheKey, key), gt(apiCache.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return { hit: false, value: null, backend: "postgres" };
    return { hit: true, value: row.payload as T, backend: "postgres" };
  } catch {
    return { hit: false, value: null, backend: "postgres" };
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const serialized = JSON.stringify(value);
  const redisDone = await redisCommand<string>("set", [key, serialized, "EX", String(ttlSeconds)]);
  if (redisDone) return;

  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await db
      .insert(apiCache)
      .values({ cacheKey: key, payload: value, expiresAt })
      .onConflictDoUpdate({
        target: apiCache.cacheKey,
        set: { payload: value, expiresAt, createdAt: new Date() },
      });
  } catch (error) {
    console.error("[cache] postgres cache write failed", { key, error: String(error) });
  }
}

export async function cacheBust(key: string): Promise<void> {
  await redisCommand<string>("del", [key]);
  try {
    await db.delete(apiCache).where(eq(apiCache.cacheKey, key));
  } catch (error) {
    console.error("[cache] postgres cache delete failed", { key, error: String(error) });
  }
}

/** Removes expired rows. Called from the refresh cron. */
export async function pruneCache(): Promise<number> {
  try {
    const deleted = await db.delete(apiCache).where(lt(apiCache.expiresAt, new Date())).returning({ key: apiCache.cacheKey });
    return deleted.length;
  } catch (error) {
    console.error("[cache] prune failed", { error: String(error) });
    return 0;
  }
}

/**
 * Cache-aside helper. `loader` runs only on a miss; identical concurrent requests in the
 * same process share the in-flight promise to avoid stampeding the upstream API.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<{ value: T; cache: "hit" | "miss"; backend: CacheBackend | "none" }> {
  const cached = await cacheGet<T>(key);
  if (cached.hit && cached.value !== null) {
    return { value: cached.value, cache: "hit", backend: cached.backend };
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) {
    const value = await pending;
    return { value, cache: "hit", backend: "none" };
  }

  const promise = loader()
    .then(async (value) => {
      await cacheSet(key, value, ttlSeconds);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  const value = await promise;
  return { value, cache: "miss", backend: "none" };
}

export async function cacheStats(): Promise<{ entries: number; expiringSoon: number }> {
  try {
    const rows = await db
      .select({
        entries: sql<number>`count(*)::int`,
        expiringSoon: sql<number>`count(*) filter (where ${apiCache.expiresAt} < now() + interval '5 minutes')::int`,
      })
      .from(apiCache);
    const row = rows[0];
    return { entries: row?.entries ?? 0, expiringSoon: row?.expiringSoon ?? 0 };
  } catch {
    return { entries: 0, expiringSoon: 0 };
  }
}
