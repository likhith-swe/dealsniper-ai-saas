import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { upstashEnv } from "@/lib/env";

export type RateLimitBucket =
  | "deal_feed"
  | "alert_create"
  | "affiliate_click"
  | "newsletter_subscribe"
  | "magic_link"
  | "billing_checkout";

export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
  /** Response header contract for clients. */
  scope: string;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtMs: number;
  backend: "redis" | "memory";
  scope: string;
}

/**
 * Request policies. Free-tier callers get a tighter budget, VIP Pro callers get the
 * higher ceiling, and the alert creation policy additionally enforces the stored
 * per-profile alert quota (3 free / unlimited Pro) inside the route handler.
 */
export const POLICIES: Record<RateLimitBucket, RateLimitPolicy> = {
  deal_feed: { limit: 240, windowSeconds: 60, scope: "feed" },
  alert_create: { limit: 12, windowSeconds: 60, scope: "alert-write" },
  affiliate_click: { limit: 300, windowSeconds: 60, scope: "click" },
  newsletter_subscribe: { limit: 5, windowSeconds: 600, scope: "signup" },
  magic_link: { limit: 5, windowSeconds: 600, scope: "auth" },
  billing_checkout: { limit: 10, windowSeconds: 600, scope: "billing" },
};

export function policyFor(bucket: RateLimitBucket, isPro: boolean): RateLimitPolicy {
  const base = POLICIES[bucket];
  if (!isPro) return base;
  return { ...base, limit: base.limit * 3 };
}

const redisEnv = upstashEnv();
const redis = redisEnv ? new Redis({ url: redisEnv.url, token: redisEnv.token }) : null;

const limiters = new Map<string, Ratelimit>();

function limiterFor(policy: RateLimitPolicy): Ratelimit | null {
  if (!redis) return null;
  const key = `${policy.scope}:${policy.limit}:${policy.windowSeconds}`;
  const existing = limiters.get(key);
  if (existing) return existing;
  const created = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(policy.limit, `${policy.windowSeconds} s`),
    prefix: `dealsniper:rl:${policy.scope}`,
    analytics: false,
  });
  limiters.set(key, created);
  return created;
}

interface MemoryWindow {
  hits: number[];
}

const memoryWindows = new Map<string, MemoryWindow>();

function memoryCheck(key: string, policy: RateLimitPolicy): RateLimitDecision {
  const now = Date.now();
  const windowStart = now - policy.windowSeconds * 1000;
  const existing = memoryWindows.get(key) ?? { hits: [] };
  const hits = existing.hits.filter((timestamp) => timestamp > windowStart);

  if (hits.length >= policy.limit) {
    const oldest = hits[0] ?? now;
    memoryWindows.set(key, { hits });
    return {
      allowed: false,
      limit: policy.limit,
      remaining: 0,
      resetAtMs: oldest + policy.windowSeconds * 1000,
      backend: "memory",
      scope: policy.scope,
    };
  }

  hits.push(now);
  memoryWindows.set(key, { hits });

  // Opportunistic eviction so long-lived processes do not grow unbounded.
  if (memoryWindows.size > 5000) {
    for (const [candidateKey, window] of memoryWindows) {
      if (window.hits.length === 0 || window.hits[window.hits.length - 1] < windowStart) {
        memoryWindows.delete(candidateKey);
      }
    }
  }

  return {
    allowed: true,
    limit: policy.limit,
    remaining: Math.max(0, policy.limit - hits.length),
    resetAtMs: now + policy.windowSeconds * 1000,
    backend: "memory",
    scope: policy.scope,
  };
}

/**
 * Sliding-window enforcement. `identifier` should be a stable caller key: user id when
 * authenticated, otherwise a salted IP hash so raw addresses are never persisted.
 */
export async function enforceRateLimit(
  bucket: RateLimitBucket,
  identifier: string,
  isPro = false,
): Promise<RateLimitDecision> {
  const policy = policyFor(bucket, isPro);
  const key = `${policy.scope}:${identifier}`;
  const limiter = limiterFor(policy);

  if (limiter) {
    try {
      const outcome = await limiter.limit(key);
      return {
        allowed: outcome.success,
        limit: outcome.limit,
        remaining: outcome.remaining,
        resetAtMs: outcome.reset,
        backend: "redis",
        scope: policy.scope,
      };
    } catch (error) {
      console.error("[ratelimit] redis unavailable, falling back to memory window", {
        bucket,
        error: String(error),
      });
    }
  }

  return memoryCheck(key, policy);
}

export function rateLimitHeaders(decision: RateLimitDecision): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAtMs / 1000)),
    "X-RateLimit-Backend": decision.backend,
  };
}

export function rateLimitBackend(): "redis" | "memory" {
  return redis ? "redis" : "memory";
}
