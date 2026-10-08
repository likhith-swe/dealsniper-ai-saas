/** Shared domain types for DealSniper AI. */

export type Currency = "INR" | "USD";
export type Marketplace = "amazon_in" | "amazon_com" | "flipkart";
export type NotificationChannel = "email" | "telegram" | "whatsapp";
export type PlanTier = "free" | "vip_pro";
export type DealScoreTier = "LEGENDARY" | "STRONG" | "SOLID" | "FAIR" | "NOISE";

export interface DealScoreParts {
  /** Deviation of current price from the trailing 90-day average (0-100). */
  priceDeviation: number;
  /** Stock depletion rate combined with realised price velocity (0-100). */
  stockVelocity: number;
  /** Review integrity signal; penalises low-star or thin-review listings (0-100). */
  reviewIntegrity: number;
  /** Coupon stacking depth: promo code availability plus extra percent off (0-100). */
  couponStack: number;
}

export interface PricePoint {
  /** Epoch milliseconds so the client can render without timezone parsing. */
  t: number;
  /** Price in minor units. */
  p: number;
}

export interface Deal {
  id: string;
  asin: string;
  title: string;
  category: string;
  subcategory: string;
  brand: string;
  imageUrl: string;
  marketplace: Marketplace;
  currency: Currency;
  originalPriceMinor: number;
  currentPriceMinor: number;
  ninetyDayAvgMinor: number;
  lowestEverMinor: number;
  discountPercent: number;
  savingsMinor: number;
  deviationPercent: number;
  couponCode: string | null;
  couponExtraPercent: number;
  effectivePriceMinor: number;
  dealScore: number;
  dealScoreTier: DealScoreTier;
  dealScoreParts: DealScoreParts;
  inStock: boolean;
  stockLevel: number;
  priceVelocityPerHourMinor: number;
  ratingX10: number;
  ratingCount: number;
  affiliateUrl: string;
  claimUrl: string;
  isSponsored: boolean;
  sponsorName: string | null;
  isGlitch: boolean;
  urgency: "low" | "medium" | "high";
  /** True when the free tier received the pre-cycle sample instead of the live one. */
  priceDelayed: boolean;
  lastCheckedAt: string;
  priceHistory?: PricePoint[];
}

export interface DealFilters {
  category?: string;
  minDiscount?: number;
  maxPriceMinor?: number;
  minPriceMinor?: number;
  search?: string;
  sort?: "score" | "discount" | "price_asc" | "price_desc" | "freshness";
  limit?: number;
  includeSponsored?: boolean;
}

export interface DealFeedMeta {
  total: number;
  returned: number;
  generatedAt: string;
  dataSource: "rapidapi" | "verified_catalog" | "hybrid";
  delaySeconds: number;
  currency: Currency;
  appliedFilters: DealFilters;
}

export interface DealFeedResponse {
  ok: true;
  deals: Deal[];
  meta: DealFeedMeta;
}

export interface DealFeedError {
  ok: false;
  error: string;
  code: "rate_limited" | "invalid_query" | "internal_error";
}

export interface CategoryStat {
  slug: string;
  label: string;
  dealCount: number;
  avgDiscountPercent: number;
  topDealScore: number;
}

export interface PlatformStats {
  trackedProducts: number;
  priceChecksToday: number;
  avgDiscountPercent: number;
  glitchCount: number;
  affiliateClicksToday: number;
  newsletterSubscribers: number;
}

export interface AlertInput {
  keyword: string;
  targetPriceMajor?: number | null;
  currency?: Currency;
  category?: string | null;
  minDiscountPercent?: number;
  notifyChannel: NotificationChannel;
  destination: string;
}

export interface AlertRecord {
  id: string;
  keyword: string;
  targetPriceMinor: number | null;
  currency: Currency;
  category: string | null;
  minDiscountPercent: number;
  notifyChannel: NotificationChannel;
  destination: string;
  isActive: boolean;
  matchCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isPro: boolean;
  planTier: PlanTier;
  customAlertsCount: number;
  provider: string;
}

export interface RapidApiProduct {
  asin: string;
  title: string;
  brand: string;
  category: string;
  imageUrl: string;
  currency: Currency;
  originalPriceMinor: number;
  currentPriceMinor: number;
  discountPercent: number;
  couponCode: string | null;
  ratingX10: number;
  ratingCount: number;
  inStock: boolean;
  stockLevel: number;
  source: "rapidapi";
  fetchedAt: string;
}

export type RapidApiResult<T> =
  | { ok: true; data: T; cache: "hit" | "miss" }
  | { ok: false; reason: "api_key_missing" | "upstream_error" | "not_found" | "timeout"; detail: string };

export interface AffiliateResolution {
  ok: true;
  asin: string;
  marketplace: Marketplace;
  targetUrl: string;
  partner: string;
  taggedUrl: string;
  estimatedCommissionMinor: number;
}

export interface ApiEnvelope<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  ok: false;
  error: string;
  code: string;
}
