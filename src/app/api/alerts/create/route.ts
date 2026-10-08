import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { userAlerts } from "@/db/schema";
import { clientIpFromHeaders, hashIp } from "@/lib/affiliate";
import { getCurrentUser, incrementAlertCount } from "@/lib/auth/current-user";
import { freeTierAlertQuota } from "@/lib/env";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/ratelimit";
import type { Currency, NotificationChannel } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHANNELS = new Set<NotificationChannel>(["email", "telegram", "whatsapp"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

interface AlertPayload {
  keyword?: unknown;
  targetPrice?: unknown;
  currency?: unknown;
  category?: unknown;
  minDiscountPercent?: unknown;
  notifyChannel?: unknown;
  destination?: unknown;
  isActive?: unknown;
}

function asString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

/**
 * POST /api/alerts/create
 *
 * Persists a price-drop trigger. Free plans hold three active alerts; VIP Pro holds an
 * unlimited number. Telegram and WhatsApp destinations are validated to their channel
 * format before the row is written so the ingest cycle never attempts an undeliverable
 * dispatch. An identical keyword+channel pair returns the existing row instead of
 * consuming another quota slot.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { ok: false, error: "Sign in to save a price-drop alert.", code: "unauthenticated" },
      { status: 401 },
    );
  }

  const decision = await enforceRateLimit("alert_create", user.id ?? "anonymous", user.isPro);
  if (!decision.allowed) {
    return Response.json(
      { ok: false, error: "Too many alert writes. Retry after the reset window.", code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }

  let payload: AlertPayload;
  try {
    payload = (await request.json()) as AlertPayload;
  } catch (error) {
    return Response.json(
      { ok: false, error: `Request body must be valid JSON (${String(error)})`, code: "invalid_body" },
      { status: 400 },
    );
  }

  const keyword = asString(payload.keyword, 80);
  if (!keyword) {
    return Response.json({ ok: false, error: "keyword is required and must be 1-80 characters", code: "invalid_keyword" }, { status: 400 });
  }

  const channelValue = typeof payload.notifyChannel === "string" ? (payload.notifyChannel as NotificationChannel) : "email";
  const notifyChannel: NotificationChannel = CHANNELS.has(channelValue) ? channelValue : "email";

  const destination = asString(payload.destination, 160) ?? (notifyChannel === "email" ? user.email : "");
  if (notifyChannel === "email" && !EMAIL_PATTERN.test(destination)) {
    return Response.json({ ok: false, error: "A valid email destination is required for email alerts", code: "invalid_destination" }, { status: 400 });
  }
  if (notifyChannel === "telegram" && !/^-?\d{6,20}$/.test(destination)) {
    return Response.json(
      { ok: false, error: "Telegram destination must be a numeric chat id (for example -1001234567890)", code: "invalid_destination" },
      { status: 400 },
    );
  }
  if (notifyChannel === "whatsapp" && destination.replace(/[^0-9]/g, "").length < 10) {
    return Response.json(
      { ok: false, error: "WhatsApp destination must be an E.164 number, e.g. 919876543210", code: "invalid_destination" },
      { status: 400 },
    );
  }

  const rawTarget = payload.targetPrice;
  let targetPriceMinor: number | null = null;
  if (rawTarget !== null && rawTarget !== undefined && rawTarget !== "") {
    const parsed = typeof rawTarget === "number" ? rawTarget : Number.parseFloat(String(rawTarget));
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000_000) {
      return Response.json(
        { ok: false, error: "targetPrice must be a positive number below 10,000,000", code: "invalid_target_price" },
        { status: 400 },
      );
    }
    targetPriceMinor = Math.round(parsed * 100);
  }

  const currency: Currency = payload.currency === "USD" ? "USD" : "INR";
  const category = asString(payload.category, 40);
  const rawDiscount = payload.minDiscountPercent;
  const parsedDiscount = typeof rawDiscount === "number" ? rawDiscount : Number.parseInt(String(rawDiscount ?? "0"), 10);
  const minDiscountPercent = Number.isFinite(parsedDiscount) ? Math.min(Math.max(parsedDiscount, 0), 95) : 0;

  try {
    const existing = await db
      .select({ id: userAlerts.id })
      .from(userAlerts)
      .where(and(eq(userAlerts.userId, user.id), eq(userAlerts.keyword, keyword), eq(userAlerts.notifyChannel, notifyChannel)))
      .limit(1);

    if (existing.length > 0) {
      const updated = await db
        .update(userAlerts)
        .set({
          targetPriceMinor,
          currency,
          category,
          minDiscountPercent,
          destination,
          isActive: true,
        })
        .where(eq(userAlerts.id, existing[0].id))
        .returning();

      return Response.json(
        { ok: true, alert: serialize(updated[0]), created: false, quotaRemaining: null, message: "Existing trigger updated with the new threshold." },
        { headers: rateLimitHeaders(decision) },
      );
    }

    const currentCount = await db
      .select({ id: userAlerts.id })
      .from(userAlerts)
      .where(and(eq(userAlerts.userId, user.id), eq(userAlerts.isActive, true)));

    const quota = user.isPro ? null : freeTierAlertQuota();
    if (quota !== null && currentCount.length >= quota) {
      return Response.json(
        {
          ok: false,
          error: `Free plans include ${quota} active triggers. Upgrade to VIP Pro for unlimited triggers and zero-second Telegram delivery.`,
          code: "quota_exceeded",
          quotaUsed: currentCount.length,
          quota,
        },
        { status: 402, headers: rateLimitHeaders(decision) },
      );
    }

    const inserted = await db
      .insert(userAlerts)
      .values({
        userId: user.id,
        keyword,
        targetPriceMinor,
        currency,
        category,
        minDiscountPercent,
        notifyChannel,
        destination,
        isActive: true,
      })
      .returning();

    await incrementAlertCount(user.id);

    const quotaRemaining = quota === null ? null : Math.max(0, quota - (currentCount.length + 1));

    return Response.json(
      {
        ok: true,
        alert: serialize(inserted[0]),
        created: true,
        quotaRemaining,
        ipHashHint: hashIp(clientIpFromHeaders(request.headers)).slice(0, 8),
        message:
          notifyChannel === "telegram"
            ? "Trigger active. Matching listings dispatch to the Telegram chat id on the next ingest cycle."
            : `Trigger active. Matching listings dispatch to ${destination}.`,
      },
      { status: 201, headers: rateLimitHeaders(decision) },
    );
  } catch (error) {
    console.error("[api/alerts/create] insert failure", { userId: user.id, error: String(error) });
    return Response.json({ ok: false, error: "Alert could not be saved.", code: "internal_error" }, { status: 500 });
  }
}

function serialize(row: typeof userAlerts.$inferSelect | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    keyword: row.keyword,
    targetPriceMinor: row.targetPriceMinor,
    currency: row.currency,
    category: row.category,
    minDiscountPercent: row.minDiscountPercent,
    notifyChannel: row.notifyChannel,
    destination: row.destination,
    isActive: row.isActive,
    matchCount: row.matchCount,
    lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
