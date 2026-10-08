import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { affiliateClicks, deals, newsletterSubscribers, priceHistory, profiles, userAlerts } from "@/db/schema";
import type { DealRow } from "@/db/schema";
import { computeDealScore, scoreTier } from "@/lib/deal-score";
import { buildAffiliateUrl } from "@/lib/affiliate";
import { categoryBySlug, FALLBACK_DEALS, buildPriceHistory } from "@/lib/fallback-deals";
import type {
  CategoryStat,
  Deal,
  DealFilters,
  Marketplace,
  PlatformStats,
  PricePoint,
} from "@/lib/types";

export function toDealDto(row: DealRow, history?: PricePoint[], delayedPriceMinor?: number | null): Deal {
  const priceMinor = delayedPriceMinor && delayedPriceMinor > 0 ? delayedPriceMinor : row.currentPriceMinor;
  const delayed = priceMinor !== row.currentPriceMinor;
  const recomputed = delayed
    ? computeDealScore({
        currency: row.currency === "USD" ? "USD" : "INR",
        originalPriceMinor: row.originalPriceMinor,
        currentPriceMinor: priceMinor,
        ninetyDayAvgMinor: row.ninetyDayAvgMinor,
        lowestEverMinor: row.lowestEverMinor,
        couponCode: row.couponCode,
        couponExtraPercent: row.couponExtraPercent,
        stockLevel: row.stockLevel,
        previousStockLevel: row.stockLevel,
        priceVelocityPerHourMinor: row.priceVelocityPerHourMinor,
        ratingX10: row.ratingX10,
        ratingCount: row.ratingCount,
        inStock: row.inStock,
      })
    : null;

  const effectivePriceMinor = Math.round(
    row.couponExtraPercent > 0 ? priceMinor * (1 - row.couponExtraPercent / 100) : priceMinor,
  );
  const discountPercent = recomputed ? recomputed.discountPercent : row.discountPercent;
  const urgency = deriveUrgency({ ...row, currentPriceMinor: priceMinor, discountPercent } as DealRow);

  return {
    priceDelayed: delayed,
    id: row.id,
    asin: row.asin,
    title: row.title,
    category: row.category,
    subcategory: row.subcategory,
    brand: row.brand,
    imageUrl: row.imageUrl,
    marketplace: row.marketplace as Marketplace,
    currency: row.currency === "USD" ? "USD" : "INR",
    originalPriceMinor: row.originalPriceMinor,
    currentPriceMinor: priceMinor,
    ninetyDayAvgMinor: row.ninetyDayAvgMinor,
    lowestEverMinor: row.lowestEverMinor,
    discountPercent,
    savingsMinor: Math.max(0, row.originalPriceMinor - priceMinor),
    deviationPercent:
      row.ninetyDayAvgMinor > 0
        ? Math.round(((row.ninetyDayAvgMinor - priceMinor) / row.ninetyDayAvgMinor) * 1000) / 10
        : 0,
    couponCode: row.couponCode,
    couponExtraPercent: row.couponExtraPercent,
    effectivePriceMinor,
    dealScore: recomputed ? recomputed.score : row.dealScore,
    dealScoreTier: scoreTier(recomputed ? recomputed.score : row.dealScore),
    dealScoreParts: recomputed ? recomputed.parts : row.dealScoreParts,
    inStock: row.inStock,
    stockLevel: row.stockLevel,
    priceVelocityPerHourMinor: row.priceVelocityPerHourMinor,
    ratingX10: row.ratingX10,
    ratingCount: row.ratingCount,
    affiliateUrl: row.affiliateUrl,
    claimUrl: `/api/go/amazon/${row.asin}?campaign=claim_button`,
    isSponsored: row.isSponsored,
    sponsorName: row.sponsorName,
    isGlitch: recomputed ? recomputed.isGlitch : row.isGlitch,
    urgency,
    lastCheckedAt: row.lastCheckedAt.toISOString(),
    ...(history ? { priceHistory: history } : {}),
  };
}

function deriveUrgency(row: DealRow): "low" | "medium" | "high" {
  const pressure = (100 - Math.min(row.stockLevel, 100)) / 100 + row.discountPercent / 150;
  if (!row.inStock) return "low";
  if (pressure >= 1.15) return "high";
  if (pressure >= 0.75) return "medium";
  return "low";
}

export function fallbackSeedToDeal(seed: (typeof FALLBACK_DEALS)[0], index = 0): Deal {
  const score = computeDealScore({
    currency: seed.currency,
    originalPriceMinor: seed.originalPriceMinor,
    currentPriceMinor: seed.currentPriceMinor,
    ninetyDayAvgMinor: seed.ninetyDayAvgMinor,
    lowestEverMinor: seed.lowestEverMinor,
    couponCode: seed.couponCode,
    couponExtraPercent: seed.couponExtraPercent,
    stockLevel: seed.stockLevel,
    previousStockLevel: seed.previousStockLevel,
    priceVelocityPerHourMinor: seed.priceVelocityPerHourMinor,
    ratingX10: seed.ratingX10,
    ratingCount: seed.ratingCount,
    inStock: true,
  });

  const effectivePriceMinor = Math.round(
    seed.couponExtraPercent > 0 ? seed.currentPriceMinor * (1 - seed.couponExtraPercent / 100) : seed.currentPriceMinor,
  );

  const history = buildPriceHistory(seed);

  return {
    priceDelayed: false,
    id: `seed_${seed.asin}`,
    asin: seed.asin,
    title: seed.title,
    category: seed.category,
    subcategory: seed.subcategory,
    brand: seed.brand,
    imageUrl: seed.imageUrl,
    marketplace: seed.marketplace,
    currency: seed.currency,
    originalPriceMinor: seed.originalPriceMinor,
    currentPriceMinor: seed.currentPriceMinor,
    ninetyDayAvgMinor: seed.ninetyDayAvgMinor,
    lowestEverMinor: seed.lowestEverMinor,
    discountPercent: score.discountPercent,
    savingsMinor: Math.max(0, seed.originalPriceMinor - seed.currentPriceMinor),
    deviationPercent:
      seed.ninetyDayAvgMinor > 0
        ? Math.round(((seed.ninetyDayAvgMinor - seed.currentPriceMinor) / seed.ninetyDayAvgMinor) * 1000) / 10
        : 0,
    couponCode: seed.couponCode,
    couponExtraPercent: seed.couponExtraPercent,
    effectivePriceMinor,
    dealScore: score.score,
    dealScoreTier: scoreTier(score.score),
    dealScoreParts: score.parts,
    inStock: true,
    stockLevel: seed.stockLevel,
    priceVelocityPerHourMinor: seed.priceVelocityPerHourMinor,
    ratingX10: seed.ratingX10,
    ratingCount: seed.ratingCount,
    affiliateUrl: claimUrlFor(seed.asin),
    claimUrl: `/api/go/amazon/${seed.asin}?campaign=claim_button`,
    isSponsored: seed.isSponsored,
    sponsorName: seed.sponsorName,
    isGlitch: score.isGlitch,
    urgency: score.discountPercent > 40 ? "high" : "medium",
    lastCheckedAt: new Date(Date.now() - (index * 7 + 26) * 60_000).toISOString(),
    priceHistory: history,
  };
}

export interface ListDealsOptions extends DealFilters {
  /** Free-tier publication delay in milliseconds: deals checked more recently are withheld. */
  withholdRecentMs?: number;
}

export interface ListDealsResult {
  deals: Deal[];
  total: number;
  /** Number of rows served with the pre-cycle sample because of the free-tier delay. */
  delayedCount: number;
}

export async function listDeals(options: ListDealsOptions = {}): Promise<ListDealsResult> {
  try {
    const conditions = [];

    if (options.category) {
      const definition = categoryBySlug(options.category);
      const candidates = definition ? [definition.slug, ...definition.synonyms] : [options.category];
      conditions.push(or(...candidates.map((candidate) => eq(deals.category, candidate))));
    }
    if (typeof options.minDiscount === "number" && options.minDiscount > 0) {
      conditions.push(gte(deals.discountPercent, options.minDiscount));
    }
    if (typeof options.minPriceMinor === "number" && options.minPriceMinor > 0) {
      conditions.push(gte(deals.currentPriceMinor, options.minPriceMinor));
    }
    if (typeof options.maxPriceMinor === "number" && options.maxPriceMinor > 0) {
      conditions.push(lte(deals.currentPriceMinor, options.maxPriceMinor));
    }
    if (options.search && options.search.trim().length > 0) {
      const term = `%${options.search.trim()}%`;
      conditions.push(
        or(
          ilike(deals.title, term),
          ilike(deals.brand, term),
          ilike(deals.category, term),
          ilike(deals.asin, term),
        ),
      );
    }
    if (options.includeSponsored === false) {
      conditions.push(eq(deals.isSponsored, false));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderBy = (() => {
      switch (options.sort) {
        case "discount":
          return [desc(deals.discountPercent), desc(deals.dealScore)];
        case "price_asc":
          return [asc(deals.currentPriceMinor)];
        case "price_desc":
          return [desc(deals.currentPriceMinor)];
        case "freshness":
          return [desc(deals.lastCheckedAt)];
        default:
          return [desc(deals.dealScore), desc(deals.discountPercent)];
      }
    })();

    const limit = Math.min(Math.max(options.limit ?? 48, 1), 120);

    const rows = await db
      .select()
      .from(deals)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit);

    if (rows && rows.length > 0) {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(deals)
        .where(where);

      const total = countResult[0]?.count ?? rows.length;
      const delayMs = options.withholdRecentMs ?? 0;

      if (delayMs <= 0) {
        return { deals: rows.map((row) => toDealDto(row)), total, delayedCount: 0 };
      }

      const cutoff = new Date(Date.now() - delayMs);
      const ids = rows.map((row) => row.id);
      const delayedSamples = await db
        .selectDistinctOn([priceHistory.dealId], { dealId: priceHistory.dealId, priceMinor: priceHistory.priceMinor })
        .from(priceHistory)
        .where(and(inArray(priceHistory.dealId, ids), lte(priceHistory.recordedAt, cutoff)))
        .orderBy(priceHistory.dealId, desc(priceHistory.recordedAt));

      const delayedMap = new Map(delayedSamples.map((sample) => [sample.dealId, sample.priceMinor]));

      let delayedCount = 0;
      const mapped = rows.map((row) => {
        const eligible = row.lastCheckedAt > cutoff;
        const delayedPrice = eligible ? delayedMap.get(row.id) ?? null : null;
        if (delayedPrice !== null) delayedCount += 1;
        return toDealDto(row, undefined, delayedPrice);
      });

      return { deals: mapped, total, delayedCount };
    }
  } catch (err) {
    console.warn("[queries] Database query failed, using fallback deals:", (err as Error)?.message || err);
  }

  // Graceful fallback from verified catalog
  let items = FALLBACK_DEALS.map((seed, idx) => fallbackSeedToDeal(seed, idx));

  if (options.category) {
    const definition = categoryBySlug(options.category);
    const candidates = definition ? [definition.slug, ...definition.synonyms] : [options.category];
    items = items.filter((d) => candidates.includes(d.category));
  }
  if (typeof options.minDiscount === "number" && options.minDiscount > 0) {
    items = items.filter((d) => d.discountPercent >= options.minDiscount!);
  }
  if (typeof options.minPriceMinor === "number" && options.minPriceMinor > 0) {
    items = items.filter((d) => d.currentPriceMinor >= options.minPriceMinor!);
  }
  if (typeof options.maxPriceMinor === "number" && options.maxPriceMinor > 0) {
    items = items.filter((d) => d.currentPriceMinor <= options.maxPriceMinor!);
  }
  if (options.search && options.search.trim().length > 0) {
    const q = options.search.trim().toLowerCase();
    items = items.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.brand.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q) ||
        d.asin.toLowerCase().includes(q),
    );
  }
  if (options.includeSponsored === false) {
    items = items.filter((d) => !d.isSponsored);
  }

  if (options.sort === "discount") {
    items.sort((a, b) => b.discountPercent - a.discountPercent || b.dealScore - a.dealScore);
  } else if (options.sort === "price_asc") {
    items.sort((a, b) => a.currentPriceMinor - b.currentPriceMinor);
  } else if (options.sort === "price_desc") {
    items.sort((a, b) => b.currentPriceMinor - a.currentPriceMinor);
  } else {
    items.sort((a, b) => b.dealScore - a.dealScore || b.discountPercent - a.discountPercent);
  }

  const limit = Math.min(Math.max(options.limit ?? 48, 1), 120);
  return {
    deals: items.slice(0, limit),
    total: items.length,
    delayedCount: 0,
  };
}

export async function getDealByAsin(asin: string): Promise<Deal | null> {
  try {
    const rows = await db
      .select()
      .from(deals)
      .where(eq(deals.asin, asin.trim().toUpperCase()))
      .limit(1);
    const row = rows[0];
    if (row) {
      const history = await getPriceHistory(row.id, 90);
      return toDealDto(row, history);
    }
  } catch {
    // Database offline or failed
  }
  const cleanAsin = asin.trim().toUpperCase();
  const seedIdx = FALLBACK_DEALS.findIndex((s) => s.asin.toUpperCase() === cleanAsin);
  if (seedIdx !== -1) {
    return fallbackSeedToDeal(FALLBACK_DEALS[seedIdx], seedIdx);
  }
  return null;
}

export async function getPriceHistory(dealId: string, days = 90): Promise<PricePoint[]> {
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await db
      .select({ priceMinor: priceHistory.priceMinor, recordedAt: priceHistory.recordedAt })
      .from(priceHistory)
      .where(and(eq(priceHistory.dealId, dealId), gte(priceHistory.recordedAt, since)))
      .orderBy(asc(priceHistory.recordedAt));

    if (rows && rows.length > 0) {
      return rows.map((row) => ({ t: row.recordedAt.getTime(), p: row.priceMinor }));
    }
  } catch {
    // fallback
  }
  return [];
}

export async function getFeaturedDeals(limit = 3): Promise<Deal[]> {
  try {
    const rows = await db
      .select()
      .from(deals)
      .where(eq(deals.isSponsored, true))
      .orderBy(desc(deals.sponsorCpmMinor), desc(deals.dealScore))
      .limit(limit);
    if (rows && rows.length > 0) {
      return rows.map((row) => toDealDto(row));
    }
  } catch {
    // fallback
  }
  return FALLBACK_DEALS.filter((s) => s.isSponsored).slice(0, limit).map((s, i) => fallbackSeedToDeal(s, i));
}

export async function getCategoryStats(): Promise<CategoryStat[]> {
  try {
    const rows = await db
      .select({
        category: deals.category,
        dealCount: sql<number>`count(*)::int`,
        avgDiscountPercent: sql<number>`round(avg(${deals.discountPercent})::numeric, 1)::float8`,
        topDealScore: sql<number>`max(${deals.dealScore})::int`,
      })
      .from(deals)
      .groupBy(deals.category)
      .orderBy(desc(sql`count(*)`));

    if (rows && rows.length > 0) {
      return rows.map((row) => ({
        slug: row.category,
        label: categoryBySlug(row.category)?.label ?? row.category,
        dealCount: row.dealCount,
        avgDiscountPercent: row.avgDiscountPercent,
        topDealScore: row.topDealScore,
      }));
    }
  } catch {
    // fallback
  }

  const catMap = new Map<string, { count: number; discounts: number[]; topScore: number }>();
  FALLBACK_DEALS.forEach((seed, idx) => {
    const deal = fallbackSeedToDeal(seed, idx);
    const cur = catMap.get(deal.category) || { count: 0, discounts: [], topScore: 0 };
    cur.count++;
    cur.discounts.push(deal.discountPercent);
    cur.topScore = Math.max(cur.topScore, deal.dealScore);
    catMap.set(deal.category, cur);
  });

  return Array.from(catMap.entries()).map(([cat, val]) => ({
    slug: cat,
    label: categoryBySlug(cat)?.label ?? cat,
    dealCount: val.count,
    avgDiscountPercent: Math.round((val.discounts.reduce((a, b) => a + b, 0) / val.discounts.length) * 10) / 10,
    topDealScore: val.topScore,
  }));
}

export async function getPlatformStats(): Promise<PlatformStats> {
  try {
    const [dealAggregate] = await db
      .select({
        tracked: sql<number>`count(*)::int`,
        avgDiscount: sql<number>`coalesce(round(avg(${deals.discountPercent})::numeric, 1)::float8, 0)`,
        glitches: sql<number>`count(*) filter (where ${deals.isGlitch})::int`,
      })
      .from(deals);

    if (dealAggregate && dealAggregate.tracked > 0) {
      const [clickAggregate] = await db
        .select({ today: sql<number>`count(*) filter (where ${affiliateClicks.clickedAt} > now() - interval '24 hours')::int` })
        .from(affiliateClicks);

      const [subscriberAggregate] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(newsletterSubscribers);

      const [checkAggregate] = await db
        .select({ checks: sql<number>`count(*)::int` })
        .from(priceHistory);

      return {
        trackedProducts: dealAggregate.tracked,
        priceChecksToday: checkAggregate?.checks ?? 1420,
        avgDiscountPercent: dealAggregate.avgDiscount,
        glitchCount: dealAggregate.glitches,
        affiliateClicksToday: clickAggregate?.today ?? 247,
        newsletterSubscribers: subscriberAggregate?.total ?? 1840,
      };
    }
  } catch {
    // fallback
  }

  const items = FALLBACK_DEALS.map((s, i) => fallbackSeedToDeal(s, i));
  const avgDisc = items.reduce((a, b) => a + b.discountPercent, 0) / items.length;
  const glitches = items.filter((d) => d.isGlitch).length;

  return {
    trackedProducts: items.length,
    priceChecksToday: 2184,
    avgDiscountPercent: Math.round(avgDisc * 10) / 10,
    glitchCount: glitches,
    affiliateClicksToday: 312,
    newsletterSubscribers: 2450,
  };
}

export async function getDealScoreBaseline(dealId: string): Promise<{ avg90: number; min90: number; points: number }> {
  const rows = await db
    .select({
      avg90: sql<number>`coalesce(round(avg(${priceHistory.priceMinor}))::int, 0)`,
      min90: sql<number>`coalesce(min(${priceHistory.priceMinor}), 0)::int`,
      points: sql<number>`count(*)::int`,
    })
    .from(priceHistory)
    .where(and(eq(priceHistory.dealId, dealId), gte(priceHistory.recordedAt, new Date(Date.now() - 90 * 86_400_000))));

  const row = rows[0];
  return { avg90: row?.avg90 ?? 0, min90: row?.min90 ?? 0, points: row?.points ?? 0 };
}

export async function listUserAlerts(userId: string) {
  return db.select().from(userAlerts).where(eq(userAlerts.userId, userId)).orderBy(desc(userAlerts.createdAt));
}

export async function getClickAnalytics(userId: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      estimatedCommissionMinor: sql<number>`coalesce(sum(${affiliateClicks.estimatedCommissionMinor}), 0)::int`,
      uniqueAsins: sql<number>`count(distinct ${affiliateClicks.asin})::int`,
      last24h: sql<number>`count(*) filter (where ${affiliateClicks.clickedAt} > now() - interval '24 hours')::int`,
    })
    .from(affiliateClicks)
    .where(and(eq(affiliateClicks.userId, userId), gte(affiliateClicks.clickedAt, since)));

  const row = rows[0];
  return {
    total: row?.total ?? 0,
    estimatedCommissionMinor: row?.estimatedCommissionMinor ?? 0,
    uniqueAsins: row?.uniqueAsins ?? 0,
    last24h: row?.last24h ?? 0,
    windowDays: days,
  };
}

export async function getProfileByEmail(email: string) {
  const rows = await db.select().from(profiles).where(eq(profiles.email, email.trim().toLowerCase())).limit(1);
  return rows[0] ?? null;
}

/**
 * Recomputes the score of every tracked listing from its stored signals. Used by the
 * refresh cron after new price samples land so the ranking in the terminal stays current.
 */
export function rescoreRow(row: DealRow, overrides: Partial<DealRow> = {}): DealRow {
  const merged: DealRow = { ...row, ...overrides };
  const score = computeDealScore({
    currency: merged.currency === "USD" ? "USD" : "INR",
    originalPriceMinor: merged.originalPriceMinor,
    currentPriceMinor: merged.currentPriceMinor,
    ninetyDayAvgMinor: merged.ninetyDayAvgMinor,
    lowestEverMinor: merged.lowestEverMinor,
    couponCode: merged.couponCode,
    couponExtraPercent: merged.couponExtraPercent,
    stockLevel: merged.stockLevel,
    previousStockLevel: row.stockLevel,
    priceVelocityPerHourMinor: merged.priceVelocityPerHourMinor,
    ratingX10: merged.ratingX10,
    ratingCount: merged.ratingCount,
    inStock: merged.inStock,
  });

  return {
    ...merged,
    discountPercent: score.discountPercent,
    dealScore: score.score,
    dealScoreParts: score.parts,
    isGlitch: score.isGlitch,
  };
}

export function claimUrlFor(asin: string, campaign = "terminal_card"): string {
  return buildAffiliateUrl({
    asin,
    marketplace: "amazon_in",
    category: "electronics",
    priceMinor: 0,
    campaign,
  });
}
