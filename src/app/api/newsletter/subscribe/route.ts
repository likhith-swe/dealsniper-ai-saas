import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";
import { clientIpFromHeaders, hashIp } from "@/lib/affiliate";
import { getCurrentUser } from "@/lib/auth/current-user";
import { syncSubscriberToCrm } from "@/lib/notify";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * POST /api/newsletter/subscribe
 *
 * Lead capture for the Daily 10 Glitch Drops digest (07:30 IST send). Validates the
 * address, upserts the subscriber with an unsubscribe token, syncs the contact to
 * Loops.so or Resend, and returns the placement details used by the sponsorship deck.
 */
export async function POST(request: NextRequest) {
  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const user = await getCurrentUser();
  const decision = await enforceRateLimit("newsletter_subscribe", user?.id ?? `ip:${ipHash}`, user?.isPro === true);
  if (!decision.allowed) {
    return Response.json(
      { ok: false, error: "Subscription attempts are limited to 5 per 10 minutes per caller.", code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }

  let body: { email?: unknown; sourcePage?: unknown; interestTags?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; sourcePage?: unknown; interestTags?: unknown };
  } catch (error) {
    return Response.json(
      { ok: false, error: `Request body must be valid JSON (${String(error)})`, code: "invalid_body" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 200) {
    return Response.json({ ok: false, error: "A valid email address is required.", code: "invalid_email" }, { status: 400 });
  }

  const sourcePage = typeof body.sourcePage === "string" && body.sourcePage.trim().length > 0
    ? body.sourcePage.trim().slice(0, 80)
    : "home_modal";
  const interestTags = Array.isArray(body.interestTags)
    ? body.interestTags.filter((tag): tag is string => typeof tag === "string").slice(0, 8).map((tag) => tag.slice(0, 32))
    : [];

  try {
    const existing = await db
      .select({ id: newsletterSubscribers.id, status: newsletterSubscribers.status })
      .from(newsletterSubscribers)
      .where(eq(newsletterSubscribers.email, email))
      .limit(1);

    const unsubscribeToken = randomUUID().replace(/-/g, "");
    const crm = await syncSubscriberToCrm({ email, source: sourcePage, interestTags });

    if (existing.length > 0) {
      await db
        .update(newsletterSubscribers)
        .set({
          status: crm.status === "synced" ? "active" : "pending",
          sourcePage,
          interestTags,
          crmProvider: crm.provider,
          crmSyncedAt: crm.status === "synced" ? new Date() : null,
        })
        .where(eq(newsletterSubscribers.id, existing[0].id));

      return Response.json(
        {
          ok: true,
          alreadySubscribed: true,
          email,
          sendTime: "07:30 IST daily",
          crm: { provider: crm.provider, status: crm.status, detail: crm.detail },
        },
        { headers: rateLimitHeaders(decision) },
      );
    }

    const inserted = await db
      .insert(newsletterSubscribers)
      .values({
        email,
        sourcePage,
        status: crm.status === "synced" ? "active" : "pending",
        interestTags,
        crmProvider: crm.provider,
        crmSyncedAt: crm.status === "synced" ? new Date() : null,
        unsubscribeToken,
      })
      .returning({ id: newsletterSubscribers.id, subscribedAt: newsletterSubscribers.subscribedAt });

    return Response.json(
      {
        ok: true,
        alreadySubscribed: false,
        email,
        subscriberId: inserted[0]?.id ?? null,
        sendTime: "07:30 IST daily",
        sponsorSlotRate: "USD 50-90 CPM, single sponsor per send",
        crm: { provider: crm.provider, status: crm.status, detail: crm.detail },
      },
      { status: 201, headers: rateLimitHeaders(decision) },
    );
  } catch (error) {
    console.error("[api/newsletter/subscribe] failure", { email, error: String(error) });
    return Response.json({ ok: false, error: "Subscriber could not be stored.", code: "internal_error" }, { status: 500 });
  }
}

/** GET /api/newsletter/subscribe — list size and CRM split for the sponsorship deck. */
export async function GET() {
  try {
    const rows = await db
      .select({ email: newsletterSubscribers.email, crmProvider: newsletterSubscribers.crmProvider, status: newsletterSubscribers.status })
      .from(newsletterSubscribers);

    const byProvider: Record<string, number> = {};
    for (const row of rows) {
      byProvider[row.crmProvider] = (byProvider[row.crmProvider] ?? 0) + 1;
    }

    return Response.json({
      ok: true,
      total: rows.length,
      active: rows.filter((row) => row.status === "active").length,
      byProvider,
      estimatedDailyImpressions: rows.length,
      sponsorCpmRangeMinor: { low: 5000, high: 9000 },
    });
  } catch (error) {
    console.error("[api/newsletter/subscribe] read failure", { error: String(error) });
    return Response.json({ ok: false, error: "Subscriber metrics unavailable.", code: "internal_error" }, { status: 500 });
  }
}
