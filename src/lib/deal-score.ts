import type { DealScoreParts, DealScoreTier } from "@/lib/types";

export interface DealScoreInput {
  currency: "INR" | "USD";
  originalPriceMinor: number;
  currentPriceMinor: number;
  ninetyDayAvgMinor: number;
  lowestEverMinor: number;
  couponCode: string | null;
  couponExtraPercent: number;
  stockLevel: number;
  previousStockLevel: number;
  priceVelocityPerHourMinor: number;
  ratingX10: number;
  ratingCount: number;
  inStock: boolean;
}

export interface DealScoreResult {
  score: number;
  tier: DealScoreTier;
  parts: DealScoreParts;
  discountPercent: number;
  deviationPercent: number;
  isGlitch: boolean;
  urgency: "low" | "medium" | "high";
  effectivePriceMinor: number;
}

const WEIGHTS: Record<keyof DealScoreParts, number> = {
  priceDeviation: 0.4,
  stockVelocity: 0.25,
  reviewIntegrity: 0.2,
  couponStack: 0.15,
};

function clamp(value: number, min = 0, max = 100): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Deal Score — 0 to 100 composite of four independent signals.
 *
 * priceDeviation (40%): how far below the trailing 90-day average the live price
 *   sits, plus a bonus when the price prints a new 90-day low.
 * stockVelocity  (25%): how fast inventory is being drained; a fast drain at a low
 *   price is the strongest empirical signal that a price error is live.
 * reviewIntegrity(20%): rating quality weighted by review depth. Listings with high
 *   volume but weak ratings indicate manipulated seller-side pricing.
 * couponStack    (15%): promo code presence plus the additional percentage the code
 *   removes at cart, i.e. reversible "glitch stack" room.
 */
export function computeDealScore(input: DealScoreInput): DealScoreResult {
  const original = Math.max(1, input.originalPriceMinor);
  const current = Math.max(1, input.currentPriceMinor);
  const avg = Math.max(1, input.ninetyDayAvgMinor || original);
  const lowest = Math.max(1, input.lowestEverMinor || current);

  const discountPercent = clamp(Math.round(((original - current) / original) * 100), 0, 96);
  const deviationPercent = roundTo(((avg - current) / avg) * 100, 1);
  const effectivePriceMinor = Math.round(
    input.couponExtraPercent > 0 ? current * (1 - input.couponExtraPercent / 100) : current,
  );

  // Signal 1: deviation from the 90-day average, with a 12-point new-low bonus.
  const deviationBase = clamp(deviationPercent * 1.85, 0, 88);
  const newLowBonus = current <= lowest ? 12 : 0;
  const priceDeviation = clamp(deviationBase + newLowBonus);

  // Signal 2: stock depletion velocity measured against the previous ingest sample.
  const previousStock = Math.max(0, input.previousStockLevel);
  const drained = Math.max(0, previousStock - input.stockLevel);
  const depletionRatio = previousStock > 0 ? drained / previousStock : input.stockLevel < 25 ? 0.35 : 0.08;
  const velocityPerHour = Math.abs(input.priceVelocityPerHourMinor) / 100;
  const velocitySignal = clamp((velocityPerHour / Math.max(50, avg / 400)) * 45, 0, 60);
  const stockVelocity = clamp(depletionRatio * 140 + velocitySignal);

  // Signal 3: review integrity. 4.2 stars and 500+ reviews is the healthy baseline.
  const rating = input.ratingX10 / 10;
  const ratingSignal = clamp(((rating - 3) / 1.6) * 70, 0, 70);
  const depthSignal = clamp(Math.log10(Math.max(1, input.ratingCount)) * 7.5, 0, 30);
  const thinListingPenalty = input.ratingCount < 25 ? 15 : 0;
  const lowStarPenalty = rating < 3.5 && input.ratingCount > 400 ? 20 : 0;
  const reviewIntegrity = clamp(ratingSignal + depthSignal - thinListingPenalty - lowStarPenalty);

  // Signal 4: coupon stack. Extra percent off compounds the effective discount.
  const couponSignal = input.couponCode ? 62 : 0;
  const couponStack = clamp(couponSignal + input.couponExtraPercent * 4.2);

  const parts: DealScoreParts = {
    priceDeviation: roundTo(priceDeviation),
    stockVelocity: roundTo(stockVelocity),
    reviewIntegrity: roundTo(reviewIntegrity),
    couponStack: roundTo(couponStack),
  };

  const weighted =
    parts.priceDeviation * WEIGHTS.priceDeviation +
    parts.stockVelocity * WEIGHTS.stockVelocity +
    parts.reviewIntegrity * WEIGHTS.reviewIntegrity +
    parts.couponStack * WEIGHTS.couponStack;

  const outOfStockPenalty = input.inStock ? 0 : 18;
  const score = clamp(Math.round(weighted - outOfStockPenalty), 0, 100);

  return {
    score,
    tier: scoreTier(score),
    parts,
    discountPercent,
    deviationPercent,
    isGlitch: isGlitchSignal(discountPercent, deviationPercent, input.couponExtraPercent, input.inStock),
    urgency: urgencyFrom(stockVelocity, input.stockLevel, discountPercent),
    effectivePriceMinor,
  };
}

export function scoreTier(score: number): DealScoreTier {
  if (score >= 85) return "LEGENDARY";
  if (score >= 70) return "STRONG";
  if (score >= 55) return "SOLID";
  if (score >= 40) return "FAIR";
  return "NOISE";
}

/**
 * A "glitch" candidate is a discount depth that marketplaces rarely publish through
 * standard promotions but that still keeps the listing in stock: >=72% off list, or
 * >=45% below the 90-day average while a coupon adds at least another 10% at cart.
 */
export function isGlitchSignal(
  discountPercent: number,
  deviationPercent: number,
  couponExtraPercent: number,
  inStock: boolean,
): boolean {
  if (!inStock) return false;
  if (discountPercent >= 72) return true;
  return deviationPercent >= 45 && couponExtraPercent >= 10;
}

function urgencyFrom(
  stockVelocity: number,
  stockLevel: number,
  discountPercent: number,
): "low" | "medium" | "high" {
  const pressure = stockVelocity / 100 + (1 - Math.min(stockLevel, 100) / 100) + discountPercent / 200;
  if (pressure >= 1.35) return "high";
  if (pressure >= 0.9) return "medium";
  return "low";
}

/** Blended margin assumption used for click-value analytics: 4% (electronics) to 10% (fashion). */
export function commissionRateFor(category: string): number {
  const CATEGORY_RATES: Record<string, number> = {
    audio: 0.04,
    electronics: 0.04,
    computing: 0.045,
    gaming: 0.05,
    mobile: 0.045,
    home: 0.06,
    kitchen: 0.06,
    fashion: 0.1,
    footwear: 0.1,
    fitness: 0.08,
    books: 0.09,
    beauty: 0.09,
  };
  return CATEGORY_RATES[category] ?? 0.05;
}

export function estimatedCommissionMinor(category: string, priceMinor: number): number {
  return Math.round(priceMinor * commissionRateFor(category));
}
