import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { db } from "@/db";
import { affiliateClicks, deals } from "@/db/schema";
import { clientIpFromHeaders, estimateCartCommission, hashIp, isBotUserAgent, resolveAffiliate } from "@/lib/affiliate";
import { getCurrentUser } from "@/lib/auth/current-user";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/ratelimit";
import type { Marketplace } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ asin: string }>;
}

/**
 * GET /api/go/amazon/[asin]
 *
 * Affiliate click handler. Records the click (user, ASIN, salted IP hash, user agent,
 * referer, campaign, estimated commission) and issues a 302 to the tagged marketplace URL.
 * The Amazon Associates tag survives the redirect, which is what secures the 24 hour
 * commission cookie on the buyer's device.
 *
 * Query parameters:
 *   campaign  attribution sub-id (terminal_card, digest_email, telegram_ping, ...)
 *   market    amazon_in (default) | amazon_com | flipkart
 *   mode      redirect (default) | json (returns the resolved URL for client-side opens)
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { asin: rawAsin } = await context.params;
  const asin = rawAsin.trim().toUpperCase();

  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    return NextResponse.json({ ok: false, error: `"${rawAsin}" is not a valid 10-character ASIN`, code: "invalid_asin" }, { status: 400 });
  }

  const user = await getCurrentUser();
  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const decision = await enforceRateLimit("affiliate_click", user?.id ?? `ip:${ipHash}`, user?.isPro === true);

  if (!decision.allowed) {
    return NextResponse.json(
      { ok: false, error: "Click rate limit reached for this caller.", code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }

  const params = request.nextUrl.searchParams;
  const campaign = (params.get("campaign") ?? "terminal_card").slice(0, 32);
  const marketParam = params.get("market");
  const mode = params.get("mode") === "json" ? "json" : "redirect";

  let marketplace: Marketplace =
    marketParam === "amazon_com" || marketParam === "flipkart" ? (marketParam as Marketplace) : "amazon_in";

  try {
    const rows = await db.select().from(deals).where(eq(deals.asin, asin)).limit(1);
    const deal = rows[0] ?? null;

    if (!marketParam && deal?.marketplace === "amazon_com") {
      marketplace = "amazon_com";
    }

    const category = deal?.category ?? "electronics";
    const priceMinor = deal?.currentPriceMinor ?? 0;

    const resolution = resolveAffiliate({
      asin,
      marketplace,
      category,
      priceMinor,
      campaign,
    });

    const userAgent = request.headers.get("user-agent");
    const bot = isBotUserAgent(userAgent);
    let logged = false;

    if (!bot) {
      try {
        await db.insert(affiliateClicks).values({
          userId: user?.id ?? null,
          dealId: deal?.id ?? null,
          asin,
          partner: resolution.partner,
          marketplace,
          targetUrl: resolution.taggedUrl,
          ipHash,
          userAgent: userAgent?.slice(0, 240) ?? null,
          referer: request.headers.get("referer")?.slice(0, 240) ?? null,
          utmCampaign: campaign,
          estimatedCommissionMinor: estimateCartCommission(category, priceMinor),
        });
        logged = true;
      } catch (error) {
        // A failed analytics write must never block the buyer's journey to checkout.
        console.error("[api/go] click analytics insert failed", { asin, error: String(error) });
      }
    }

    const headers = {
      ...rateLimitHeaders(decision),
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer-when-downgrade",
    };

    if (mode === "json") {
      return NextResponse.json(
        {
          ok: true,
          asin,
          marketplace,
          url: resolution.taggedUrl,
          partner: resolution.partner,
          estimatedCommissionMinor: resolution.estimatedCommissionMinor,
          logged,
          botFiltered: bot,
        },
        { headers },
      );
    }

    const response = NextResponse.redirect(resolution.taggedUrl, 302);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    response.headers.set("X-DealSniper-Click-Logged", logged ? "true" : "false");
    return response;
  } catch (error) {
    console.error("[api/go] affiliate redirect failure", { asin, error: String(error) });
    // Fall back to an untagged canonical URL so the consumer still reaches the product.
    const fallbackHost =
      marketplace === "amazon_com"
        ? "www.amazon.com"
        : marketplace === "flipkart"
          ? "www.flipkart.com"
          : "www.amazon.in";
    return NextResponse.redirect(`https://${fallbackHost}/dp/${asin}`, 302);
  }
}
