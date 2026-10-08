import type { NextRequest } from "next/server";

import { clientIpFromHeaders, hashIp } from "@/lib/affiliate";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getClickAnalytics, listUserAlerts } from "@/lib/queries";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/ratelimit";
import { vipPrice } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/alerts — returns the caller's alert triggers plus subscription placement. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Sign in to read your alert triggers.", code: "unauthenticated" }, { status: 401 });
  }

  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const decision = await enforceRateLimit("alert_create", user.id ?? `ip:${ipHash}`, user.isPro);
  if (!decision.allowed) {
    return Response.json(
      { ok: false, error: "Too many alert requests. Retry after the reset window.", code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }

  try {
    const rows = await listUserAlerts(user.id);
    const analytics = await getClickAnalytics(user.id);
    const pricing = vipPrice();

    return Response.json(
      {
        ok: true,
        alerts: rows.map((row) => ({
          id: row.id,
          keyword: row.keyword,
          targetPriceMinor: row.targetPriceMinor,
          currency: row.currency === "USD" ? "USD" : "INR",
          category: row.category,
          minDiscountPercent: row.minDiscountPercent,
          notifyChannel: row.notifyChannel,
          destination: row.destination,
          isActive: row.isActive,
          matchCount: row.matchCount,
          lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        quota: {
          isPro: user.isPro,
          planTier: user.planTier,
          used: rows.length,
          limit: user.isPro ? null : 3,
          vipPriceMinor: pricing.inrMinor,
        },
        analytics,
      },
      { headers: rateLimitHeaders(decision) },
    );
  } catch (error) {
    console.error("[api/alerts] list failure", { userId: user.id, error: String(error) });
    return Response.json({ ok: false, error: "Alert list unavailable.", code: "internal_error" }, { status: 500 });
  }
}
