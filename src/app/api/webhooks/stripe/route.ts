import type { NextRequest } from "next/server";

import { applySubscriptionEvent, verifyStripeSignature } from "@/lib/billing";
import { stripeCredentials } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StripeObject {
  id?: string;
  object?: string;
  status?: string;
  customer?: string;
  subscription?: string | { id?: string };
  customer_email?: string;
  amount_total?: number;
  currency?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
  current_period_end?: number;
  items?: { data?: { price?: { id?: string } }[] };
}

interface StripeEvent {
  id?: string;
  type?: string;
  data?: { object?: StripeObject };
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const INACTIVE_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired", "past_due"]);

/**
 * POST /api/webhooks/stripe
 *
 * International billing path. Verifies the `stripe-signature` header over the raw body
 * with a five minute replay tolerance, then maps the event to VIP Pro activation or
 * revocation. Handles checkout.session.completed, customer.subscription.created/updated/
 * deleted and invoice.payment_failed.
 */
export async function POST(request: NextRequest) {
  const credentials = stripeCredentials();
  if (!credentials) {
    return Response.json(
      { ok: false, error: "STRIPE_SECRET_KEY is not configured, so Stripe webhooks are disabled.", code: "provider_not_configured" },
      { status: 503 },
    );
  }
  if (!credentials.webhookSecret) {
    return Response.json(
      { ok: false, error: "STRIPE_WEBHOOK_SECRET is not configured, so the payload signature cannot be validated.", code: "webhook_secret_missing" },
      { status: 503 },
    );
  }

  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return Response.json({ ok: false, error: "stripe-signature header is required.", code: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  const verification = verifyStripeSignature(rawBody, signatureHeader, credentials.webhookSecret);
  if (!verification.valid) {
    console.warn("[webhooks/stripe] signature validation failed", { reason: verification.reason });
    return Response.json({ ok: false, error: verification.reason, code: "invalid_signature" }, { status: 401 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch (error) {
    return Response.json({ ok: false, error: `Payload is not valid JSON: ${String(error)}`, code: "invalid_payload" }, { status: 400 });
  }

  const object = event.data?.object;
  const eventType = event.type ?? "unknown";

  if (!object) {
    return Response.json({ ok: true, ignored: true, event: eventType, detail: "event carried no data object" });
  }

  const isCheckoutEvent = eventType === "checkout.session.completed";
  const checkoutSubscriptionId =
    typeof object.subscription === "string" ? object.subscription : object.subscription?.id ?? null;
  const subscriptionId = isCheckoutEvent ? checkoutSubscriptionId ?? object.id ?? null : object.id ?? null;
  if (!subscriptionId) {
    return Response.json({ ok: true, ignored: true, event: eventType, detail: "event carried no subscription or session identifier" });
  }

  const objectStatus = (object.status ?? "").toLowerCase();
  const isActivation =
    isCheckoutEvent || (eventType.startsWith("customer.subscription") && ACTIVE_STATUSES.has(objectStatus)) || eventType === "invoice.paid";
  const isRevocation = INACTIVE_STATUSES.has(objectStatus) || eventType === "customer.subscription.deleted" || eventType === "invoice.payment_failed";

  const status: Parameters<typeof applySubscriptionEvent>[0]["status"] = isActivation
    ? "active"
    : isRevocation
      ? objectStatus === "past_due"
        ? "past_due"
        : "cancelled"
      : "created";

  const result = await applySubscriptionEvent({
    provider: "stripe",
    subscriptionId,
    paymentId: object.customer ?? null,
    status,
    planTier: isActivation ? "vip_pro" : "free",
    ...(typeof object.amount_total === "number" ? { amountMinor: object.amount_total } : {}),
    currency: (object.currency ?? "usd").toUpperCase() === "INR" ? "INR" : "USD",
    userId: object.metadata?.userId ?? object.client_reference_id ?? null,
    email: object.customer_email ?? object.metadata?.email ?? null,
    currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000) : null,
    rawEvent: event as unknown as Record<string, unknown>,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.detail, code: "apply_failed" }, { status: 422 });
  }

  return Response.json({
    ok: true,
    event: eventType,
    subscriptionId,
    status,
    isPro: result.isPro,
    userId: result.userId,
  });
}

/** GET /api/webhooks/stripe — configuration probe used by the operations panel. */
export async function GET() {
  return Response.json({
    ok: true,
    provider: "stripe",
    secretConfigured: stripeCredentials() !== null,
    handledEvents: [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
    ],
  });
}
