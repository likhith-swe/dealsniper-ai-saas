import type { NextRequest } from "next/server";

import { clientIpFromHeaders, hashIp } from "@/lib/affiliate";
import { getCurrentUser } from "@/lib/auth/current-user";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/ratelimit";
import { ensureSeeded } from "@/lib/seed";
import { listDeals } from "@/lib/queries";
import { freeDelaySeconds, rapidApiKey, vipDelaySeconds } from "@/lib/env";
import type { DealFeedResponse, DealFilters } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SORT_VALUES = new Set<DealFilters["sort"]>(["score", "discount", "price_asc", "price_desc", "freshness"]);

function parseNumber(value: string | null, fallback: number | undefined): number | undefined {
  if (value === null || value.trim().length === 0) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * GET /api/deals
 *
 * Query parameters: category, minDiscount, minPrice (minor units), maxPrice (minor units),
 * search, sort, limit, currency-aware field names match the terminal's filter bar.
 *
 * Free callers receive the feed with the configured publication delay applied (15 minutes
 * by default): listings whose latest price sample is newer than the delay window are
 * withheld. VIP Pro callers receive the feed with zero delay.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const isPro = user?.isPro === true;
    const ipHash = hashIp(clientIpFromHeaders(request.headers));
    const decision = await enforceRateLimit("deal_feed", user?.id ?? `ip:${ipHash}`, isPro);

    if (!decision.allowed) {
      return Response.json(
        { ok: false, error: "Too many feed requests. Retry after the reset window.", code: "rate_limited" },
        { status: 429, headers: rateLimitHeaders(decision) },
      );
    }

    const params = request.nextUrl.searchParams;
    const sortParam = params.get("sort");
    const sort = sortParam && SORT_VALUES.has(sortParam as DealFilters["sort"]) ? (sortParam as DealFilters["sort"]) : "score";

    const filters: DealFilters = {
      ...(params.get("category") ? { category: String(params.get("category")) } : {}),
      ...(parseNumber(params.get("minDiscount"), undefined) !== undefined
        ? { minDiscount: parseNumber(params.get("minDiscount"), undefined) }
        : {}),
      ...(parseNumber(params.get("minPrice"), undefined) !== undefined
        ? { minPriceMinor: parseNumber(params.get("minPrice"), undefined) }
        : {}),
      ...(parseNumber(params.get("maxPrice"), undefined) !== undefined
        ? { maxPriceMinor: parseNumber(params.get("maxPrice"), undefined) }
        : {}),
      ...(params.get("search") ? { search: String(params.get("search")).slice(0, 80) } : {}),
      ...(params.get("limit") ? { limit: parseNumber(params.get("limit"), 48) } : {}),
      ...(params.get("hideSponsored") === "true" ? { includeSponsored: false } : {}),
      sort,
    };

    const seedOutcome = await ensureSeeded();
    const delaySeconds = isPro ? vipDelaySeconds() : freeDelaySeconds();
    const { deals, total, delayedCount } = await listDeals({
      ...filters,
      withholdRecentMs: delaySeconds > 0 ? delaySeconds * 1000 : 0,
    });

    const payload: DealFeedResponse = {
      ok: true,
      deals,
      meta: {
        total,
        returned: deals.length,
        generatedAt: new Date().toISOString(),
        dataSource: rapidApiKey() ? "hybrid" : "verified_catalog",
        delaySeconds,
        currency: "INR",
        appliedFilters: filters,
      },
    };

    return Response.json(
      {
        ...payload,
        meta: {
          ...payload.meta,
          catalogSeeded: seedOutcome.seeded,
          pricesDelayed: delayedCount,
          delayNote:
            delaySeconds > 0
              ? `${delayedCount} of ${deals.length} listings carry the pre-cycle sample. VIP Pro removes the ${Math.round(delaySeconds / 60)} minute delay.`
              : "Live samples for every listing.",
        },
      },
      {
        headers: {
          ...rateLimitHeaders(decision),
          "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
          "X-DealSniper-Tier": isPro ? "vip_pro" : "free",
        },
      },
    );
  } catch (error) {
    console.error("[api/deals] feed failure", { error: String(error) });
    return Response.json(
      { ok: false, error: "Deal feed unavailable. The price pipeline reported an internal error.", code: "internal_error" },
      { status: 500 },
    );
  }
}
