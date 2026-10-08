import { createHash } from "node:crypto";

import { AFFILIATE_TAGS, IP_HASH_SALT } from "@/lib/env";
import { estimatedCommissionMinor } from "@/lib/deal-score";
import type { AffiliateResolution, Marketplace } from "@/lib/types";

export interface AffiliateRequest {
  asin: string;
  marketplace: Marketplace;
  category: string;
  priceMinor: number;
  /** Sub-id component so each surface (card, digest, telegram) is attributable. */
  campaign?: string;
}

const MARKETPLACE_HOSTS: Record<Marketplace, string> = {
  amazon_in: "www.amazon.in",
  amazon_com: "www.amazon.com",
  flipkart: "www.flipkart.com",
};

/**
 * Builds the final outbound URL with the associate tag, link code and attribution
 * sub-id attached. The 24 hour Amazon cookie window means a single click also captures
 * commission on unrelated items added to the cart in the same session, so `campaign`
 * is preserved for post-hoc revenue attribution per traffic surface.
 */
export function buildAffiliateUrl(request: AffiliateRequest): string {
  const asin = request.asin.trim().toUpperCase();
  const host = MARKETPLACE_HOSTS[request.marketplace] ?? MARKETPLACE_HOSTS.amazon_in;
  const campaign = (request.campaign ?? "terminal").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "terminal";
  const subId = `${campaign}-${Date.now().toString(36).slice(-4)}`;

  if (request.marketplace === "flipkart") {
    const url = new URL(`https://${host}/product/${asin}`);
    url.searchParams.set("affid", AFFILIATE_TAGS.flipkart);
    url.searchParams.set("affExtParam1", subId);
    return url.toString();
  }

  const tag = request.marketplace === "amazon_com" ? AFFILIATE_TAGS.amazon_com : AFFILIATE_TAGS.amazon_in;
  const url = new URL(`https://${host}/dp/${asin}`);
  url.searchParams.set("tag", tag);
  url.searchParams.set("linkCode", "ogi");
  url.searchParams.set("language", request.marketplace === "amazon_com" ? "en_US" : "en_IN");
  url.searchParams.set("ref_", `as_li_ss_tl_${subId}`);
  return url.toString();
}

export function resolveAffiliate(request: AffiliateRequest): AffiliateResolution {
  const taggedUrl = buildAffiliateUrl(request);
  return {
    ok: true,
    asin: request.asin.trim().toUpperCase(),
    marketplace: request.marketplace,
    targetUrl: taggedUrl,
    partner: request.marketplace === "flipkart" ? "flipkart" : "amazon",
    taggedUrl,
    estimatedCommissionMinor: estimatedCommissionMinor(request.category, request.priceMinor),
  };
}

/** Salted, truncated SHA-256 so click analytics never stores a raw IP address. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${IP_HASH_SALT}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Extracts the caller IP from proxy headers. `x-forwarded-for` is a comma separated
 * chain; the left-most entry is the client. Falls back to `x-real-ip`, then a stable
 * placeholder so the hash column always has a value.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  return "0.0.0.0";
}

/**
 * Bot filter for click analytics. Headless preview crawlers, monitoring agents and
 * link expanders inflate click counts without producing commission, so they are
 * excluded from recorded click analytics and from the newsletter metric.
 */
const BOT_PATTERN =
  /(bot|crawler|spider|crawl|slurp|headless|chrome-lighthouse|whatsapp|telegrambot|facebookexternalhit|bingpreview|preview|semrush|ahrefs|curl|wget|python-requests)/i;

export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_PATTERN.test(userAgent);
}

export function detectMarketplaceFromAsin(asin: string): Marketplace {
  return asin.trim().toUpperCase().startsWith("B0") ? "amazon_in" : "amazon_com";
}

/** Commission estimate for a cart value at the category's affiliate rate. */
export function estimateCartCommission(category: string, cartValueMinor: number): number {
  return estimatedCommissionMinor(category, cartValueMinor);
}

export function amazonAssociateDisclosure(): string {
  return "DealSniper AI participates in the Amazon Associates programme and the Flipkart Affiliate programme. Qualifying purchases made through Claim Deal links may earn a commission at no additional cost to the buyer.";
}
