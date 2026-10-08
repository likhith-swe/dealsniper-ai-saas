import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { deals, priceHistory, systemState } from "@/db/schema";
import { FALLBACK_DEALS, buildPriceHistory } from "@/lib/fallback-deals";
import { computeDealScore } from "@/lib/deal-score";
import type { DealInsert } from "@/db/schema";

const SEED_KEY = "catalog_seed:v1";
const ADVISORY_LOCK_KEY = 918273645;

let inProcessSeed: Promise<SeedOutcome> | null = null;

export interface SeedOutcome {
  seeded: boolean;
  dealsInserted: number;
  historyPointsInserted: number;
  dealCount: number;
}

/**
 * Idempotent catalog bootstrap. Runs once per deployment: inserts the verified catalog
 * when `deals` is empty, then marks `system_state.catalog_seed` so concurrent server
 * instances skip the work. A Postgres advisory lock serialises the first writer across
 * processes; every later caller still reports the authoritative row count.
 */
export async function ensureSeeded(): Promise<SeedOutcome> {
  if (inProcessSeed) return inProcessSeed;
  inProcessSeed = seedOnce().catch((error) => {
    inProcessSeed = null;
    console.warn("[seed] Database offline or unseeded, continuing with fallback catalog:", error?.message || error);
    return {
      seeded: false,
      dealsInserted: 0,
      historyPointsInserted: 0,
      dealCount: FALLBACK_DEALS.length,
    };
  });
  return inProcessSeed;
}

async function seedOnce(): Promise<SeedOutcome> {
  const existingCount = await countDeals();

  const marker = await db
    .select({ stateKey: systemState.stateKey })
    .from(systemState)
    .where(eq(systemState.stateKey, SEED_KEY))
    .limit(1);

  if (marker.length > 0 && existingCount > 0) {
    return { seeded: false, dealsInserted: 0, historyPointsInserted: 0, dealCount: existingCount };
  }

  const lock = await db.execute<{ locked: boolean }>(sql`select pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as locked`);
  const locked = lock.rows[0]?.locked === true;
  if (!locked) {
    return { seeded: false, dealsInserted: 0, historyPointsInserted: 0, dealCount: existingCount };
  }

  try {
    const recheck = await countDeals();
    if (recheck > 0) {
      await markSeeded();
      return { seeded: false, dealsInserted: 0, historyPointsInserted: 0, dealCount: recheck };
    }

    const rows: DealInsert[] = FALLBACK_DEALS.map((seed, index) => {
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

      // Stagger the "last checked" timestamp across the catalog so the free-tier
      // 15 minute publication delay is observable instead of hiding the whole feed.
      const lastCheckedAt = new Date(Date.now() - (index * 7 + 26) * 60_000);

      return {
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
        couponCode: seed.couponCode,
        couponExtraPercent: seed.couponExtraPercent,
        dealScore: score.score,
        dealScoreParts: score.parts,
        inStock: true,
        stockLevel: seed.stockLevel,
        priceVelocityPerHourMinor: seed.priceVelocityPerHourMinor,
        ratingX10: seed.ratingX10,
        ratingCount: seed.ratingCount,
        affiliateUrl: `https://www.${seed.marketplace === "amazon_com" ? "amazon.com" : seed.marketplace === "flipkart" ? "flipkart.com" : "amazon.in"}/dp/${seed.asin}`,
        isSponsored: seed.isSponsored,
        sponsorName: seed.sponsorName,
        sponsorCpmMinor: seed.sponsorCpmMinor,
        isGlitch: score.isGlitch,
        lastCheckedAt,
      } satisfies DealInsert;
    });

    const insertedDeals = await db.insert(deals).values(rows).onConflictDoNothing({ target: deals.asin }).returning({
      id: deals.id,
      asin: deals.asin,
    });

    let historyPointsInserted = 0;
    const now = Date.now();
    for (const deal of insertedDeals) {
      const seed = FALLBACK_DEALS.find((entry) => entry.asin === deal.asin);
      if (!seed) continue;
      const points = buildPriceHistory(seed, { days: 90, now });
      if (points.length === 0) continue;
      await db.insert(priceHistory).values(
        points.map((point) => ({
          dealId: deal.id,
          priceMinor: point.p,
          currency: seed.currency,
          source: "verified_catalog",
          recordedAt: new Date(point.t),
        })),
      );
      historyPointsInserted += points.length;
    }

    await markSeeded();
    const dealCount = await countDeals();
    return {
      seeded: true,
      dealsInserted: insertedDeals.length,
      historyPointsInserted,
      dealCount,
    };
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
  }
}

async function markSeeded(): Promise<void> {
  await db
    .insert(systemState)
    .values({
      stateKey: SEED_KEY,
      value: { seededAt: new Date().toISOString(), source: "verified_catalog", items: FALLBACK_DEALS.length },
    })
    .onConflictDoUpdate({
      target: systemState.stateKey,
      set: { value: { seededAt: new Date().toISOString(), source: "verified_catalog", items: FALLBACK_DEALS.length }, updatedAt: new Date() },
    });
}

export async function countDeals(): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`select count(*)::int as count from deals`);
  return result.rows[0]?.count ?? 0;
}

/** Adds any catalog entries that are not yet present (used after growing the catalog). */
export async function syncCatalogAdditions(): Promise<number> {
  const existing = await db.select({ asin: deals.asin }).from(deals);
  const known = new Set(existing.map((row) => row.asin));
  const missing = FALLBACK_DEALS.filter((seed) => !known.has(seed.asin));
  if (missing.length === 0) return 0;

  await db.insert(deals).values(
    missing.map((seed) => {
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
      return {
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
        couponCode: seed.couponCode,
        couponExtraPercent: seed.couponExtraPercent,
        dealScore: score.score,
        dealScoreParts: score.parts,
        inStock: true,
        stockLevel: seed.stockLevel,
        priceVelocityPerHourMinor: seed.priceVelocityPerHourMinor,
        ratingX10: seed.ratingX10,
        ratingCount: seed.ratingCount,
        affiliateUrl: `https://www.amazon.in/dp/${seed.asin}`,
        isSponsored: seed.isSponsored,
        sponsorName: seed.sponsorName,
        sponsorCpmMinor: seed.sponsorCpmMinor,
        isGlitch: score.isGlitch,
      } satisfies DealInsert;
    }),
  ).onConflictDoNothing({ target: deals.asin });

  return missing.length;
}
