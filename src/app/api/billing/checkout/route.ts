import type { NextRequest } from "next/server";

import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { razorpayCredentials, siteUrl, stripeCredentials, vipPrice } from "@/lib/env";
import { razorpayPlanIds, signActivationToken, stripePriceId } from "@/lib/billing";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/ratelimit";
import type { Currency } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SANDBOX_TOKEN_TTL_MS = 15 * 60 * 1000;

interface CheckoutPayload {
  currency?: unknown;
  provider?: unknown;
}

/**
 * POST /api/billing/checkout
 *
 * Creates a VIP Pro subscription through the configured provider:
 *   razorpay — subscription against RAZORPAY_PLAN_ID_INR / _USD, returning hosted checkout
 *   stripe   — Billing Checkout Session against STRIPE_PRICE_VIP_ID
 *   sandbox  — signed activation link used when neither provider is configured
 *
 * Every path writes a `subscriptions` row so revenue attribution does not depend on the
 * provider dashboard.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Sign in before starting a VIP Pro subscription.", code: "unauthenticated" }, { status: 401 });
  }

  const decision = await enforceRateLimit("billing_checkout", user.id, user.isPro);
  if (!decision.allowed) {
    return Response.json(
      { ok: false, error: "Too many checkout attempts. Retry after the reset window.", code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }

  let payload: CheckoutPayload = {};
  try {
    payload = (await request.json()) as CheckoutPayload;
  } catch {
    payload = {};
  }

  const currency: Currency = payload.currency === "USD" ? "USD" : "INR";
  const pricing = vipPrice();
  const amountMinor = currency === "USD" ? pricing.usdMinor : pricing.inrMinor;
  const razorpay = razorpayCredentials();
  const stripe = stripeCredentials();

  try {
    if (currency === "INR" && !razorpay) {
      return Response.json(
        {
          ok: true,
          provider: "razorpay",
          checkoutUrl: "https://razorpay.me/@likhiths",
          amountMinor: pricing.inrMinor,
          currency: "INR",
          mode: "live",
        },
        { headers: rateLimitHeaders(decision) },
      );
    }

    if (razorpay) {
      const plans = razorpayPlanIds();
      const planId = currency === "USD" ? plans.usd : plans.inr;

      if (planId) {
        const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${razorpay.keyId}:${razorpay.keySecret}`).toString("base64")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan_id: planId,
            total_count: 12,
            quantity: 1,
            customer_notify: 1,
            notes: { userId: user.id, email: user.email, plan: "vip_pro" },
          }),
        });

        if (!response.ok) {
          const detail = await response.text();
          console.error("[api/billing/checkout] razorpay subscription failed", { detail: detail.slice(0, 200) });
          return Response.json(
            { ok: false, error: "Razorpay rejected the subscription creation request.", code: "provider_error", detail: detail.slice(0, 300) },
            { status: 502, headers: rateLimitHeaders(decision) },
          );
        }

        const subscription = (await response.json()) as { id: string; short_url?: string };
        await db
          .insert(subscriptions)
          .values({
            userId: user.id,
            provider: "razorpay",
            planTier: "vip_pro",
            subscriptionId: subscription.id,
            status: "created",
            amountMinor,
            currency,
          })
          .onConflictDoNothing({ target: [subscriptions.provider, subscriptions.subscriptionId] });

        return Response.json(
          {
            ok: true,
            provider: "razorpay",
            subscriptionId: subscription.id,
            checkoutUrl: subscription.short_url ?? null,
            amountMinor,
            currency,
            keyId: razorpay.keyId,
          },
          { headers: rateLimitHeaders(decision) },
        );
      }

      // No recurring plan configured: fall back to a one-time payment link for the VIP month.
      const linkResponse = await fetch("https://api.razorpay.com/v1/payment_links", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${razorpay.keyId}:${razorpay.keySecret}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amountMinor,
          currency,
          accept_partial: false,
          description: "DealSniper AI VIP Pro - 30 day alert pass",
          customer: { email: user.email, name: user.fullName ?? user.email },
          notify: { email: true },
          reminder_enable: true,
          callback_url: `${siteUrl()}/dashboard?upgraded=1`,
          callback_method: "get",
          notes: { userId: user.id, plan: "vip_pro" },
        }),
      });

      if (!linkResponse.ok) {
        const detail = await linkResponse.text();
        return Response.json(
          { ok: false, error: "Razorpay rejected the payment link request.", code: "provider_error", detail: detail.slice(0, 300) },
          { status: 502, headers: rateLimitHeaders(decision) },
        );
      }

      const link = (await linkResponse.json()) as { id: string; short_url: string };
      await db
        .insert(subscriptions)
        .values({
          userId: user.id,
          provider: "razorpay",
          planTier: "vip_pro",
          subscriptionId: link.id,
          status: "created",
          amountMinor,
          currency,
        })
        .onConflictDoNothing({ target: [subscriptions.provider, subscriptions.subscriptionId] });

      return Response.json(
        {
          ok: true,
          provider: "razorpay",
          subscriptionId: link.id,
          checkoutUrl: link.short_url,
          amountMinor,
          currency,
          keyId: razorpay.keyId,
        },
        { headers: rateLimitHeaders(decision) },
      );
    }

    if (stripe) {
      const priceId = stripePriceId();
      if (!priceId) {
        return Response.json(
          {
            ok: false,
            error: "STRIPE_SECRET_KEY is set but STRIPE_PRICE_VIP_ID is missing, so the subscription price cannot be resolved.",
            code: "configuration_incomplete",
          },
          { status: 501 },
        );
      }

      const body = new URLSearchParams();
      body.set("mode", "subscription");
      body.set("line_items[0][price]", priceId);
      body.set("line_items[0][quantity]", "1");
      body.set("success_url", `${siteUrl()}/dashboard?upgraded=1`);
      body.set("cancel_url", `${siteUrl()}/?checkout=cancelled`);
      body.set("client_reference_id", user.id);
      body.set("customer_email", user.email);
      body.set("metadata[userId]", user.id);
      body.set("metadata[plan]", "vip_pro");

      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripe.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const detail = await response.text();
        return Response.json(
          { ok: false, error: "Stripe rejected the checkout session request.", code: "provider_error", detail: detail.slice(0, 300) },
          { status: 502, headers: rateLimitHeaders(decision) },
        );
      }

      const session = (await response.json()) as { id: string; url: string };
      await db
        .insert(subscriptions)
        .values({
          userId: user.id,
          provider: "stripe",
          planTier: "vip_pro",
          subscriptionId: session.id,
          status: "created",
          amountMinor: pricing.usdMinor,
          currency: "USD",
        })
        .onConflictDoNothing({ target: [subscriptions.provider, subscriptions.subscriptionId] });

      return Response.json(
        {
          ok: true,
          provider: "stripe",
          subscriptionId: session.id,
          checkoutUrl: session.url,
          amountMinor: pricing.usdMinor,
          currency: "USD",
        },
        { headers: rateLimitHeaders(decision) },
      );
    }

    // Sandbox path: no payment provider configured.
    const subscriptionId = `sandbox_${Date.now().toString(36)}_${user.id.slice(0, 8)}`;
    try {
      await db
        .insert(subscriptions)
        .values({
          userId: user.id,
          provider: "sandbox",
          planTier: "vip_pro",
          subscriptionId,
          status: "created",
          amountMinor,
          currency,
        })
        .onConflictDoNothing({ target: [subscriptions.provider, subscriptions.subscriptionId] });
    } catch {
      // In-memory / offline mode fallback
    }

    const token = signActivationToken({
      userId: user.id,
      planTier: "vip_pro",
      provider: "sandbox",
      expiresAtMs: Date.now() + SANDBOX_TOKEN_TTL_MS,
    });

    return Response.json(
      {
        ok: true,
        provider: "sandbox",
        subscriptionId,
        checkoutUrl: `/api/billing/sandbox-activate?token=${encodeURIComponent(token)}&subscription=${encodeURIComponent(subscriptionId)}`,
        amountMinor,
        currency,
        note: "Neither RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET nor STRIPE_SECRET_KEY is configured. This activation is labelled provider=sandbox and must not be counted as collected revenue.",
      },
      { headers: rateLimitHeaders(decision) },
    );
  } catch (error) {
    console.error("[api/billing/checkout] failure", { userId: user.id, error: String(error) });
    return Response.json({ ok: false, error: "Checkout could not be started.", code: "internal_error" }, { status: 500 });
  }
}
