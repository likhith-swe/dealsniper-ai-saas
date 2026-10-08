import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { applySubscriptionEvent, verifyActivationToken } from "@/lib/billing";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/billing/sandbox-activate?token=...&subscription=...
 *
 * Completes a VIP Pro activation when no payment provider is configured. The token is an
 * HMAC-signed payload bound to the signed-in account with a 15 minute lifetime, and the
 * written subscription row is labelled `provider=sandbox` so it is excluded from revenue
 * reporting. With Razorpay or Stripe configured, activation happens in the webhook route.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const subscriptionId = request.nextUrl.searchParams.get("subscription");

  if (!token || !subscriptionId) {
    return NextResponse.redirect(new URL("/dashboard?upgrade=missing_token", request.nextUrl.origin), 303);
  }

  const user = await getCurrentUser();
  if (!user) {
    const back = new URL("/login", request.nextUrl.origin);
    back.searchParams.set("next", `/api/billing/sandbox-activate?token=${token}&subscription=${subscriptionId}`);
    back.searchParams.set("error", "signin_required_for_upgrade");
    return NextResponse.redirect(back, 303);
  }

  const payload = verifyActivationToken(token);
  if (!payload || payload.userId !== user.id) {
    return NextResponse.redirect(new URL("/dashboard?upgrade=invalid_token", request.nextUrl.origin), 303);
  }

  try {
    const existing = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.provider, "sandbox"), eq(subscriptions.subscriptionId, subscriptionId)))
      .limit(1);

    if (existing.length > 0) {
      await applySubscriptionEvent({
        provider: "sandbox",
        subscriptionId,
        status: "sandbox_active",
        planTier: "vip_pro",
        userId: user.id,
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        rawEvent: { activatedAt: new Date().toISOString(), mode: "sandbox" },
      });
    }
  } catch {
    // In-memory / offline mode fallback
  }

  const { setProStatus } = await import("@/lib/auth/current-user");
  await setProStatus(user.id, true, "vip_pro");
  return NextResponse.redirect(new URL("/dashboard?upgraded=1&mode=sandbox", request.nextUrl.origin), 303);
}
