import type { NextRequest } from "next/server";

import { applySubscriptionEvent, verifyRazorpaySignature } from "@/lib/billing";
import { razorpayCredentials } from "@/lib/env";
import type { PlanTier } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RazorpayEntity {
  id?: string;
  status?: string;
  customer_id?: string;
  email?: string;
  amount?: number;
  currency?: string;
  current_end?: number;
  notes?: Record<string, string>;
}

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    subscription?: { entity?: RazorpayEntity };
    payment?: { entity?: RazorpayEntity };
  };
}

const PRO_STATUSES = new Set(["active", "authenticated", "charged"]);
const DOWNGRADE_STATUSES = new Set(["cancelled", "completed", "halted", "expired", "paused"]);

/**
 * POST /api/webhooks/razorpay
 *
 * Validates the HMAC SHA256 signature over the raw request body, then activates or
 * revokes VIP Pro for the matching profile. The subscription entity id, payment id,
 * amount, currency and next billing date are persisted on every event so reconciliation
 * does not require the Razorpay dashboard.
 *
 * Events handled: subscription.activated, subscription.authenticated, subscription.charged,
 * subscription.pending, subscription.halted, subscription.cancelled, subscription.completed,
 * payment.captured, payment.failed.
 */
export async function POST(request: NextRequest) {
  const credentials = razorpayCredentials();
  if (!credentials) {
    return Response.json(
      {
        ok: false,
        error: "Subscription webhooks are disabled: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not configured.",
        code: "provider_not_configured",
      },
      { status: 503 },
    );
  }
  if (!credentials.webhookSecret) {
    return Response.json(
      {
        ok: false,
        error: "RAZORPAY_WEBHOOK_SECRET is not configured, so the webhook payload signature cannot be validated.",
        code: "webhook_secret_missing",
      },
      { status: 503 },
    );
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return Response.json({ ok: false, error: "x-razorpay-signature header is required.", code: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  if (!verifyRazorpaySignature(rawBody, signature, credentials.webhookSecret)) {
    console.warn("[webhooks/razorpay] signature validation failed", {
      signaturePrefix: signature.slice(0, 12),
      bodyLength: rawBody.length,
    });
    return Response.json({ ok: false, error: "Signature validation failed.", code: "invalid_signature" }, { status: 401 });
  }

  let event: RazorpayWebhookPayload;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookPayload;
  } catch (error) {
    return Response.json({ ok: false, error: `Payload is not valid JSON: ${String(error)}`, code: "invalid_payload" }, { status: 400 });
  }

  const subscriptionEntity = event.payload?.subscription?.entity;
  const paymentEntity = event.payload?.payment?.entity;
  const subscriptionId = subscriptionEntity?.id ?? paymentEntity?.notes?.subscription_id ?? null;
  const eventName = event.event ?? "unknown";

  if (!subscriptionId) {
    // Acknowledge events that carry no subscription reference so Razorpay does not retry.
    return Response.json({ ok: true, ignored: true, event: eventName, detail: "event carried no subscription identifier" });
  }

  const providerStatus = (subscriptionEntity?.status ?? paymentEntity?.status ?? "created").toLowerCase();
  const isProEvent = PRO_STATUSES.has(providerStatus) || eventName === "payment.captured";
  const isDowngradeEvent = DOWNGRADE_STATUSES.has(providerStatus) || eventName === "payment.failed";

  const status: Parameters<typeof applySubscriptionEvent>[0]["status"] = isProEvent
    ? providerStatus === "authenticated"
      ? "authenticated"
      : providerStatus === "charged"
        ? "charged"
        : "active"
    : isDowngradeEvent
      ? providerStatus === "halted" || providerStatus === "paused"
        ? "past_due"
        : "cancelled"
      : "created";

  const planTier: PlanTier = isProEvent ? "vip_pro" : "free";
  const notes = subscriptionEntity?.notes ?? paymentEntity?.notes ?? {};
  const amountMinor = paymentEntity?.amount ?? subscriptionEntity?.amount ?? undefined;
  const currency = (paymentEntity?.currency ?? subscriptionEntity?.currency ?? "INR").toUpperCase() === "USD" ? "USD" : "INR";
  const currentPeriodEnd = subscriptionEntity?.current_end ? new Date(subscriptionEntity.current_end * 1000) : null;

  const result = await applySubscriptionEvent({
    provider: "razorpay",
    subscriptionId,
    paymentId: paymentEntity?.id ?? null,
    status,
    planTier,
    ...(typeof amountMinor === "number" ? { amountMinor } : {}),
    currency,
    userId: notes.userId ?? null,
    email: notes.email ?? subscriptionEntity?.email ?? null,
    currentPeriodEnd,
    rawEvent: event as unknown as Record<string, unknown>,
  });

  if (!result.ok) {
    console.error("[webhooks/razorpay] event could not be applied", { subscriptionId, event: eventName });
    return Response.json(
      { ok: false, error: result.detail, code: "apply_failed", hint: "Confirm the profile row exists or that notes.userId was set at checkout." },
      { status: 422 },
    );
  }

  return Response.json({
    ok: true,
    event: eventName,
    subscriptionId,
    status,
    isPro: result.isPro,
    userId: result.userId,
  });
}

/** GET /api/webhooks/razorpay — configuration probe used by the operations panel. */
export async function GET() {
  const credentials = razorpayCredentials();
  return Response.json({
    ok: true,
    provider: "razorpay",
    keyConfigured: credentials !== null,
    webhookSecretConfigured: credentials?.webhookSecret !== null && credentials?.webhookSecret !== undefined,
    handledEvents: [...PRO_STATUSES, ...DOWNGRADE_STATUSES, "payment.captured", "payment.failed"],
  });
}
