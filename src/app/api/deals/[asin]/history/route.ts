import { getDealByAsin } from "@/lib/queries";
import { clientIpFromHeaders, hashIp } from "@/lib/affiliate";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ asin: string }>;
}

/**
 * GET /api/deals/[asin]/history?days=90
 *
 * Returns the recorded sample series, trailing statistics and stock-drain telemetry for one
 * listing. Used by the price-history modal and the arbitrage margin panel so the deal feed
 * itself stays small.
 */
export async function GET(request: Request, context: RouteContext) {
  const { asin } = await context.params;
  const normalized = asin.trim().toUpperCase();

  if (!/^[A-Z0-9]{10}$/.test(normalized)) {
    return Response.json({ ok: false, error: `"${asin}" is not a valid 10-character ASIN`, code: "invalid_asin" }, { status: 400 });
  }

  const decision = await enforceRateLimit("deal_feed", `ip:${hashIp(clientIpFromHeaders(request.headers))}`, false);
  if (!decision.allowed) {
    return Response.json(
      { ok: false, error: "Too many history requests. Retry after the reset window.", code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }

  try {
    const deal = await getDealByAsin(normalized);
    if (!deal) {
      return Response.json({ ok: false, error: `No listing tracked for ASIN ${normalized}`, code: "not_found" }, { status: 404 });
    }

    const history = deal.priceHistory ?? [];
    const prices = history.map((point) => point.p);
    const average = prices.length > 0 ? Math.round(prices.reduce((total, price) => total + price, 0) / prices.length) : deal.currentPriceMinor;
    const lowest = prices.length > 0 ? Math.min(...prices) : deal.currentPriceMinor;
    const highest = prices.length > 0 ? Math.max(...prices) : deal.originalPriceMinor;

    return Response.json(
      {
        ok: true,
        asin: normalized,
        currency: deal.currency,
        dealScore: deal.dealScore,
        dealScoreParts: deal.dealScoreParts,
        currentPriceMinor: deal.currentPriceMinor,
        originalPriceMinor: deal.originalPriceMinor,
        prices: history,
        stats: {
          samples: history.length,
          averageMinor: average,
          lowestMinor: lowest,
          highestMinor: highest,
          deviationFromAverage:
            average > 0 ? Math.round(((average - deal.currentPriceMinor) / average) * 1000) / 10 : 0,
        },
        stockDrain: {
          currentLevel: deal.stockLevel,
          priceVelocityPerHourMinor: deal.priceVelocityPerHourMinor,
          inStock: deal.inStock,
        },
      },
      { headers: { ...rateLimitHeaders(decision), "Cache-Control": "private, max-age=120" } },
    );
  } catch (error) {
    console.error("[api/deals/history] failure", { asin: normalized, error: String(error) });
    return Response.json({ ok: false, error: "Price history unavailable.", code: "internal_error" }, { status: 500 });
  }
}
