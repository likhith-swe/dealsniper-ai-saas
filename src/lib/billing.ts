import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { profiles, subscriptions } from "@/db/schema";
import { sessionSecret, stripeCredentials, vipPrice } from "@/lib/env";
import type { PlanTier } from "@/lib/types";

export interface ActivationTokenPayload {
  userId: string;
  planTier: PlanTier;
  provider: string;
  expiresAtMs: number;
}

/**
 * Sandbox activation token. Used only when neither Razorpay nor Stripe credentials exist:
 * the operator can complete the upgrade flow end to end and every row written is labelled
 * provider `sandbox` so revenue reporting never counts it as collected.
 */
export function signActivationToken(payload: ActivationTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyActivationToken(token: string): ActivationTokenPayload | null {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", sessionSecret()).update(body).digest("base64url");

  const provided = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");
  if (provided.length !== computed.length) return null;
  if (!timingSafeEqual(provided, computed)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ActivationTokenPayload;
    if (!payload.userId || !payload.expiresAtMs) return null;
    if (payload.expiresAtMs < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Razorpay signs the raw request body with the webhook secret using HMAC SHA256. */
export function verifyRazorpaySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = Buffer.from(signature, "utf8");
  const computed = Buffer.from(expected, "utf8");
  if (provided.length !== computed.length) return false;
  return timingSafeEqual(provided, computed);
}

/**
 * Stripe signature verification: header format `t=<timestamp>,v1=<signature>`.
 * The signed payload is `${timestamp}.${rawBody}`; requests older than five minutes are
 * rejected to block replay attempts.
 */
export function verifyStripeSignature(rawBody: string, header: string, secret: string, toleranceSeconds = 300): { valid: boolean; reason: string } {
  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) {
    return { valid: false, reason: "signature header is missing the t= or v1= component" };
  }
  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return { valid: false, reason: "signature timestamp is not an integer" };
  }
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > toleranceSeconds) {
    return { valid: false, reason: "signature timestamp is outside the tolerance window" };
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const match = signatures.some((signature) => {
    const provided = Buffer.from(signature, "utf8");
    const computed = Buffer.from(expected, "utf8");
    return provided.length === computed.length && timingSafeEqual(provided, computed);
  });

  return match ? { valid: true, reason: "signature matched" } : { valid: false, reason: "no v1 signature matched" };
}

export interface SubscriptionEventInput {
  provider: "razorpay" | "stripe" | "sandbox";
  subscriptionId: string;
  paymentId?: string | null;
  status: "created" | "active" | "authenticated" | "charged" | "past_due" | "cancelled" | "completed" | "sandbox_active" | "failed";
  planTier?: PlanTier;
  amountMinor?: number;
  currency?: "INR" | "USD";
  userId?: string | null;
  email?: string | null;
  currentPeriodEnd?: Date | null;
  rawEvent?: Record<string, unknown>;
}

export interface SubscriptionEventResult {
  ok: boolean;
  userId: string | null;
  isPro: boolean;
  detail: string;
}

/**
 * Applies a payment provider event to `subscriptions` and `profiles`. Pro status is
 * granted for active/authenticated/charged/sandbox_active states and revoked for
 * cancelled/completed/failed so a lapsed subscriber drops back to the delayed feed.
 */
export async function applySubscriptionEvent(input: SubscriptionEventInput): Promise<SubscriptionEventResult> {
  const resolvedUserId = input.userId ?? (await resolveUserIdByEmail(input.email));
  if (!resolvedUserId) {
    return { ok: false, userId: null, isPro: false, detail: "no profile matched the subscription event" };
  }

  const grantsPro = ["active", "authenticated", "charged", "sandbox_active"].includes(input.status);
  const planTier: PlanTier = grantsPro ? "vip_pro" : "free";
  const pricing = vipPrice();
  const amountMinor = input.amountMinor ?? (input.currency === "USD" ? pricing.usdMinor : pricing.inrMinor);
  const currency = input.currency ?? (input.provider === "sandbox" || input.provider === "razorpay" ? "INR" : "USD");
  const currentPeriodEnd = input.currentPeriodEnd ?? (grantsPro ? new Date(Date.now() + 30 * 86_400_000) : null);

  try {
    await db
      .insert(subscriptions)
      .values({
        userId: resolvedUserId,
        provider: input.provider,
        planTier,
        subscriptionId: input.subscriptionId,
        paymentId: input.paymentId ?? null,
        status: input.status,
        amountMinor,
        currency,
        currentPeriodEnd,
        rawEvents: input.rawEvent ? [input.rawEvent] : [],
      })
      .onConflictDoUpdate({
        target: [subscriptions.provider, subscriptions.subscriptionId],
        set: {
          status: input.status,
          planTier,
          paymentId: input.paymentId ?? null,
          amountMinor,
          currency,
          currentPeriodEnd,
          updatedAt: new Date(),
          rawEvents: input.rawEvent
            ? [input.rawEvent]
            : [],
        },
      });

    await db
      .update(profiles)
      .set({ isPro: grantsPro, planTier, updatedAt: new Date() })
      .where(eq(profiles.id, resolvedUserId));

    return {
      ok: true,
      userId: resolvedUserId,
      isPro: grantsPro,
      detail: `${input.provider}:${input.subscriptionId} applied with status ${input.status}`,
    };
  } catch (error) {
    console.error("[billing] subscription event application failed", {
      provider: input.provider,
      subscriptionId: input.subscriptionId,
      error: String(error),
    });
    return { ok: false, userId: resolvedUserId, isPro: false, detail: `apply failed: ${String(error)}` };
  }
}

async function resolveUserIdByEmail(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0]?.id ?? null;
}

export function stripeConfigured(): boolean {
  return stripeCredentials() !== null;
}

/** Stripe price identifier for the VIP Pro plan; falls back to an inline price payload. */
export function stripePriceId(): string | null {
  const value = process.env.STRIPE_PRICE_VIP_ID;
  return value && value.trim().length > 0 ? value.trim() : null;
}

export function razorpayPlanIds(): { inr: string | null; usd: string | null } {
  const inr = process.env.RAZORPAY_PLAN_ID_INR;
  const usd = process.env.RAZORPAY_PLAN_ID_USD;
  return {
    inr: inr && inr.trim().length > 0 ? inr.trim() : null,
    usd: usd && usd.trim().length > 0 ? usd.trim() : null,
  };
}

export { VIP_BENEFITS } from "@/lib/plans";
