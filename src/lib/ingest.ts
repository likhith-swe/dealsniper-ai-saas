import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  alertEvents,
  affiliateClicks,
  deals,
  priceHistory,
  profiles,
  systemState,
  userAlerts,
} from "@/db/schema";
import type { DealRow, UserAlertRow } from "@/db/schema";
import { pruneCache } from "@/lib/cache";
import { computeDealScore } from "@/lib/deal-score";
import { pruneExpiredSessions } from "@/lib/auth/session";
import { buildAffiliateUrl } from "@/lib/affiliate";
import { cronSecret, rapidApiKey } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { dispatchAlert } from "@/lib/notify";
import { fetchProductByAsin, rapidApiStatus } from "@/lib/rapidapi";
import { countDeals, syncCatalogAdditions } from "@/lib/seed";
import type { Currency } from "@/lib/types";

const RUN_COUNTER_KEY = "ingest:counter:v1";
const MAX_ALERT_DISPATCHES_PER_CYCLE = 20;
const ALERT_REPEAT_GUARD_HOURS = 6;

export interface IngestSummary {
  ranAt: string;
  mode: "live" | "simulated" | "hybrid";
  runCount: number;
  catalogAdditions: number;
  dealCount: number;
  dealsProcessed: number;
  priceChanges: number;
  newLows: number;
  outOfStock: number;
  historyPoints: number;
  alertsEvaluated: number;
  alertsMatched: number;
  alertsDelivered: number;
  alertsQueued: number;
  alertsFailed: number;
  cacheEntriesPruned: number;
  sessionsPruned: number;
  durationMs: number;
  rapidApiConfigured: boolean;
  upstreamErrors: number;
}

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function nextRunCount(): Promise<number> {
  const rows = await db
    .insert(systemState)
    .values({ stateKey: RUN_COUNTER_KEY, value: { runs: 1 } })
    .onConflictDoUpdate({
      target: systemState.stateKey,
      set: {
        value: sql`jsonb_set(${systemState.value}, '{runs}', to_jsonb(coalesce((${systemState.value} ->> 'runs')::int, 0) + 1))`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: systemState.value });

  const value = rows[0]?.value as { runs?: number } | undefined;
  return value?.runs ?? 1;
}

interface PriceSample {
  priceMinor: number;
  stockLevel: number;
  inStock: boolean;
  priceVelocityPerHourMinor: number;
  source: "rapidapi" | "simulated";
}

/**
 * Derives the next price sample. When RAPIDAPI_KEY is configured the live product
 * endpoint supplies price and availability; otherwise a deterministic market model
 * advances the listing so the terminal, the alert pipeline and the analytics tables all
 * keep producing realistic, reproducible data in a self-hosted deployment.
 */
function simulateSample(deal: DealRow, runCount: number): PriceSample {
  const random = mulberry32(hashSeed(`${deal.asin}:${runCount}`));
  const roll = random();
  const floor = Math.max(
    deal.currency === "USD" ? 499 : 49900,
    Math.round(deal.lowestEverMinor * 0.92),
  );
  const ceiling = Math.round(deal.originalPriceMinor * 0.98);

  let priceMinor = deal.currentPriceMinor;
  if (roll < 0.09) {
    // Inventory bounce: price corrects upward but stays below list.
    priceMinor = Math.round(deal.currentPriceMinor * (1 + 0.02 + random() * 0.05));
  } else if (roll < 0.34) {
    // Second leg down: deeper markdown on 25% of cycles.
    priceMinor = Math.round(deal.currentPriceMinor * (1 - 0.01 - random() * 0.04));
  } else {
    // Mean drift.
    priceMinor = Math.round(deal.currentPriceMinor * (1 + (random() - 0.5) * 0.008));
  }

  priceMinor = Math.min(ceiling, Math.max(floor, priceMinor));
  priceMinor = deal.currency === "INR" ? Math.round(priceMinor / 100) * 100 : Math.max(100, priceMinor);

  const stockDrain = Math.round(2 + random() * 11);
  let stockLevel = Math.max(0, deal.stockLevel - stockDrain);
  if (random() < 0.07) stockLevel = Math.round(60 + random() * 40);

  const velocity = Math.round((priceMinor - deal.currentPriceMinor) * 0.6 + deal.priceVelocityPerHourMinor * 0.4);

  return {
    priceMinor,
    stockLevel,
    inStock: stockLevel > 0,
    priceVelocityPerHourMinor: velocity,
    source: "simulated",
  };
}

export interface IngestOptions {
  limit?: number;
  /** Skips all writes and returns the computed plan; used by the operations panel. */
  dryRun?: boolean;
}

export async function runIngestCycle(options: IngestOptions = {}): Promise<IngestSummary> {
  const started = Date.now();
  const runCount = await nextRunCount();
  const catalogAdditions = options.dryRun ? 0 : await syncCatalogAdditions();
  const limit = Math.min(Math.max(options.limit ?? 60, 1), 200);

  const rows = await db.select().from(deals).orderBy(desc(deals.dealScore)).limit(limit);
  const rapidApiConfigured = rapidApiKey() !== null;

  let dealsProcessed = 0;
  let priceChanges = 0;
  let newLows = 0;
  let outOfStock = 0;
  let historyPoints = 0;
  let upstreamErrors = 0;
  let liveSamples = 0;
  let simulatedSamples = 0;

  for (const deal of rows) {
    let sample: PriceSample;
    if (rapidApiConfigured) {
      const upstream = await fetchProductByAsin(deal.asin, deal.marketplace === "amazon_com" ? "amazon_com" : "amazon_in");
      if (upstream.ok) {
        liveSamples += 1;
        sample = {
          priceMinor: upstream.data.currentPriceMinor,
          stockLevel: upstream.data.inStock ? Math.max(1, upstream.data.stockLevel) : 0,
          inStock: upstream.data.inStock,
          priceVelocityPerHourMinor: upstream.data.currentPriceMinor - deal.currentPriceMinor,
          source: "rapidapi",
        };
      } else {
        upstreamErrors += 1;
        simulatedSamples += 1;
        sample = simulateSample(deal, runCount);
      }
    } else {
      simulatedSamples += 1;
      sample = simulateSample(deal, runCount);
    }

    dealsProcessed += 1;
    const priceChanged = sample.priceMinor !== deal.currentPriceMinor;
    if (priceChanged) priceChanges += 1;
    if (sample.priceMinor < deal.lowestEverMinor) newLows += 1;
    if (!sample.inStock) outOfStock += 1;

    const score = computeDealScore({
      currency: deal.currency === "USD" ? "USD" : "INR",
      originalPriceMinor: deal.originalPriceMinor,
      currentPriceMinor: sample.priceMinor,
      ninetyDayAvgMinor: deal.ninetyDayAvgMinor,
      lowestEverMinor: Math.min(deal.lowestEverMinor, sample.priceMinor),
      couponCode: deal.couponCode,
      couponExtraPercent: deal.couponExtraPercent,
      stockLevel: sample.stockLevel,
      previousStockLevel: deal.stockLevel,
      priceVelocityPerHourMinor: sample.priceVelocityPerHourMinor,
      ratingX10: deal.ratingX10,
      ratingCount: deal.ratingCount,
      inStock: sample.inStock,
    });

    if (options.dryRun) continue;

    await db
      .update(deals)
      .set({
        currentPriceMinor: sample.priceMinor,
        lowestEverMinor: Math.min(deal.lowestEverMinor, sample.priceMinor),
        discountPercent: score.discountPercent,
        dealScore: score.score,
        dealScoreParts: score.parts,
        isGlitch: score.isGlitch,
        stockLevel: sample.stockLevel,
        inStock: sample.inStock,
        priceVelocityPerHourMinor: sample.priceVelocityPerHourMinor,
        lastCheckedAt: new Date(),
      })
      .where(eq(deals.id, deal.id));

    if (priceChanged) {
      await db.insert(priceHistory).values({
        dealId: deal.id,
        priceMinor: sample.priceMinor,
        currency: deal.currency,
        source: sample.source,
        recordedAt: new Date(),
      });
      historyPoints += 1;
    }

    // Recompute the trailing 90-day average from stored samples so the deviation signal
    // stays anchored to observed data rather than the seed value.
    const baseline = await db
      .select({
        avg90: sql<number>`coalesce(round(avg(${priceHistory.priceMinor}))::int, ${deal.ninetyDayAvgMinor})`,
      })
      .from(priceHistory)
      .where(and(eq(priceHistory.dealId, deal.id), gte(priceHistory.recordedAt, new Date(Date.now() - 90 * 86_400_000))));
    const avg90 = baseline[0]?.avg90;
    if (typeof avg90 === "number" && avg90 > 0) {
      await db.update(deals).set({ ninetyDayAvgMinor: avg90 }).where(eq(deals.id, deal.id));
    }
  }

  const alertOutcome = options.dryRun
    ? { evaluated: 0, matched: 0, delivered: 0, queued: 0, failed: 0 }
    : await evaluateAlerts();

  const cacheEntriesPruned = options.dryRun ? 0 : await pruneCache();
  const sessionsPruned = options.dryRun ? 0 : await pruneExpiredSessions();
  const dealCount = await countDeals();

  const mode: IngestSummary["mode"] =
    liveSamples > 0 && simulatedSamples > 0 ? "hybrid" : liveSamples > 0 ? "live" : "simulated";

  return {
    ranAt: new Date().toISOString(),
    mode,
    runCount,
    catalogAdditions,
    dealCount,
    dealsProcessed,
    priceChanges,
    newLows,
    outOfStock,
    historyPoints,
    alertsEvaluated: alertOutcome.evaluated,
    alertsMatched: alertOutcome.matched,
    alertsDelivered: alertOutcome.delivered,
    alertsQueued: alertOutcome.queued,
    alertsFailed: alertOutcome.failed,
    cacheEntriesPruned,
    sessionsPruned,
    durationMs: Date.now() - started,
    rapidApiConfigured,
    upstreamErrors,
  };
}

interface AlertOutcome {
  evaluated: number;
  matched: number;
  delivered: number;
  queued: number;
  failed: number;
}

/**
 * Alert evaluation. For each active alert the best matching listing is selected (highest
 * Deal Score among listings that satisfy the keyword, category, target price and minimum
 * discount constraints). A repeat guard prevents re-notifying the same listing within six
 * hours so a subscriber receives one message per genuine price event.
 */
async function evaluateAlerts(): Promise<AlertOutcome> {
  const active = await db.select().from(userAlerts).where(eq(userAlerts.isActive, true)).limit(500);
  const outcome: AlertOutcome = { evaluated: active.length, matched: 0, delivered: 0, queued: 0, failed: 0 };
  if (active.length === 0) return outcome;

  let dispatches = 0;
  for (const alert of active) {
    if (dispatches >= MAX_ALERT_DISPATCHES_PER_CYCLE) break;

    const match = await findBestMatch(alert);
    if (!match) continue;
    outcome.matched += 1;

    const recent = await db
      .select({ id: alertEvents.id })
      .from(alertEvents)
      .where(
        and(
          eq(alertEvents.alertId, alert.id),
          eq(alertEvents.dealId, match.id),
          gte(alertEvents.createdAt, new Date(Date.now() - ALERT_REPEAT_GUARD_HOURS * 3_600_000)),
        ),
      )
      .limit(1);
    if (recent.length > 0) continue;

    const currency: Currency = match.currency === "USD" ? "USD" : "INR";
    const claimUrl = buildAffiliateUrl({
      asin: match.asin,
      marketplace: match.marketplace === "amazon_com" ? "amazon_com" : "amazon_in",
      category: match.category,
      priceMinor: match.currentPriceMinor,
      campaign: "alert_dispatch",
    });

    const result = await dispatchAlert({
      alertId: alert.id,
      userId: alert.userId,
      dealId: match.id,
      keyword: alert.keyword,
      notifyChannel: alert.notifyChannel === "telegram" ? "telegram" : alert.notifyChannel === "whatsapp" ? "whatsapp" : "email",
      destination: alert.destination,
      dealTitle: match.title,
      currentPriceLabel: formatMoney(match.currentPriceMinor, currency),
      targetPriceLabel:
        alert.targetPriceMinor && alert.targetPriceMinor > 0
          ? formatMoney(alert.targetPriceMinor, alert.currency === "USD" ? "USD" : "INR")
          : null,
      discountPercent: match.discountPercent,
      claimUrl,
    });

    dispatches += 1;
    if (result.status === "delivered") outcome.delivered += 1;
    else if (result.status === "queued") outcome.queued += 1;
    else if (result.status === "failed") outcome.failed += 1;

    await db.insert(alertEvents).values({
      alertId: alert.id,
      userId: alert.userId,
      dealId: match.id,
      channel: result.channel,
      status: result.status,
      latencyMs: result.latencyMs,
      detail: result.detail,
      payload: {
        asin: match.asin,
        priceMinor: match.currentPriceMinor,
        discountPercent: match.discountPercent,
        dealScore: match.dealScore,
        claimUrl,
      },
    });

    await db
      .update(userAlerts)
      .set({ matchCount: alert.matchCount + 1, lastTriggeredAt: new Date() })
      .where(eq(userAlerts.id, alert.id));
  }

  return outcome;
}

async function findBestMatch(alert: UserAlertRow): Promise<DealRow | null> {
  const conditions = [];
  const keyword = alert.keyword.trim();
  if (keyword.length > 0) {
    const term = `%${keyword}%`;
    conditions.push(or(ilike(deals.title, term), ilike(deals.brand, term), ilike(deals.category, term)));
  }
  if (alert.category) {
    conditions.push(eq(deals.category, alert.category));
  }
  if (alert.minDiscountPercent > 0) {
    conditions.push(gte(deals.discountPercent, alert.minDiscountPercent));
  }
  if (alert.targetPriceMinor && alert.targetPriceMinor > 0) {
    conditions.push(lte(deals.currentPriceMinor, alert.targetPriceMinor));
  }

  const where = conditions.length > 0 ? and(...conditions, eq(deals.inStock, true)) : undefined;
  const rows = await db.select().from(deals).where(where).orderBy(desc(deals.dealScore)).limit(1);
  return rows[0] ?? null;
}

/** Aggregate view used by the operations panel and the health endpoint. */
export async function getIngestStatus(): Promise<{
  runCount: number;
  dealCount: number;
  liveCatalogSources: number;
  rapidApi: ReturnType<typeof rapidApiStatus>;
  clickVolume24h: number;
  proSubscribers: number;
  alertSubscribers: number;
  lastEventAt: string | null;
}> {
  const counter = await db
    .select({ value: systemState.value })
    .from(systemState)
    .where(eq(systemState.stateKey, RUN_COUNTER_KEY))
    .limit(1);

  const [clicks] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(affiliateClicks)
    .where(gte(affiliateClicks.clickedAt, new Date(Date.now() - 86_400_000)));

  const [pro] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(profiles)
    .where(eq(profiles.isPro, true));

  const [alertCount] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(userAlerts)
    .where(eq(userAlerts.isActive, true));

  const [lastEvent] = await db
    .select({ createdAt: alertEvents.createdAt })
    .from(alertEvents)
    .orderBy(desc(alertEvents.createdAt))
    .limit(1);

  const [sources] = await db
    .select({ total: sql<number>`count(distinct ${priceHistory.source})::int` })
    .from(priceHistory);

  return {
    runCount: (counter[0]?.value as { runs?: number } | undefined)?.runs ?? 0,
    dealCount: await countDeals(),
    liveCatalogSources: sources?.total ?? 0,
    rapidApi: rapidApiStatus(),
    clickVolume24h: clicks?.total ?? 0,
    proSubscribers: pro?.total ?? 0,
    alertSubscribers: alertCount?.total ?? 0,
    lastEventAt: lastEvent?.createdAt?.toISOString() ?? null,
  };
}

export function verifyCronAuthorization(headerValue: string | null): { authorized: boolean; mode: "secret" | "open" } {
  const secret = cronSecret();
  if (!secret) return { authorized: true, mode: "open" };
  if (!headerValue) return { authorized: false, mode: "secret" };
  const token = headerValue.replace(/^Bearer\s+/i, "").trim();
  return { authorized: token === secret, mode: "secret" };
}
