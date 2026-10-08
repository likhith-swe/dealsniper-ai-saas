import { sql } from "drizzle-orm";

import { db } from "@/db";
import { cacheStats } from "@/lib/cache";
import { getIngestStatus } from "@/lib/ingest";
import { rateLimitBackend } from "@/lib/ratelimit";
import { rapidApiStatus } from "@/lib/rapidapi";
import { countDeals, ensureSeeded } from "@/lib/seed";
import { cronSecret, isSupabaseConfigured, magicLinkDeliveryMode, razorpayCredentials, stripeCredentials } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 *
 * Liveness and readiness probe. Confirms database reachability, catalog seeding, cache
 * footprint, rate limiter backend and which integrations hold credentials, so a deploy is
 * verified without inspecting provider dashboards.
 */
export async function GET() {
  const startedAt = Date.now();

  let dbReachable = true;
  try {
    await db.execute(sql`select 1`);
  } catch {
    dbReachable = false;
  }

  try {
    const seed = await ensureSeeded();
    const [cache, ingest] = await Promise.all([cacheStats(), getIngestStatus()]);

    return Response.json({
      ok: true,
      service: "dealsniper-ai",
      latencyMs: Date.now() - startedAt,
      database: {
        reachable: dbReachable,
        dealCount: seed.dealCount,
        seeded: true,
        fallbackMode: !dbReachable,
      },
      cache: { ...cache, backend: process.env.UPSTASH_REDIS_REST_URL ? "redis" : "postgres" },
      rateLimitBackend: rateLimitBackend(),
      ingest,
      integrations: {
        rapidApi: rapidApiStatus(),
        supabaseAuth: isSupabaseConfigured(),
        magicLinkDelivery: magicLinkDeliveryMode(),
        razorpay: razorpayCredentials() !== null,
        razorpayWebhookSecret: razorpayCredentials()?.webhookSecret ? true : false,
        stripe: stripeCredentials() !== null,
        stripeWebhookSecret: stripeCredentials()?.webhookSecret ? true : false,
        telegram: process.env.TELEGRAM_BOT_TOKEN ? true : false,
        whatsappCloud: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
        resend: Boolean(process.env.RESEND_API_KEY),
        loops: Boolean(process.env.LOOPS_API_KEY),
        cronSecret: cronSecret() !== null,
      },
    });
  } catch (error) {
    console.error("[api/health] readiness failure", { error: String(error) });
    return Response.json({ ok: false, stage: "readiness", error: String(error) }, { status: 500 });
  }
}
