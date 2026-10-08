"use client";

import { motion } from "framer-motion";
import { Check, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import Modal from "@/components/Modal";
import { VIP_BENEFITS } from "@/lib/plans";
import { formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/types";

export interface PricingModalProps {
  open: boolean;
  onClose: () => void;
  authenticated: boolean;
  isPro: boolean;
  priceInrMinor: number;
  priceUsdMinor: number;
  nextPath?: string;
}

interface CheckoutResponse {
  ok: boolean;
  provider?: string;
  checkoutUrl?: string | null;
  subscriptionId?: string;
  amountMinor?: number;
  currency?: Currency;
  note?: string;
  error?: string;
  code?: string;
}

/**
 * Free versus VIP Pro comparison and checkout. Currency selects the billing provider:
 * INR routes through Razorpay, USD through Stripe. When neither provider is configured the
 * sandbox activation link is returned with a visible label so the tier is never mistaken
 * for collected revenue.
 */
export default function PricingModal({
  open,
  onClose,
  authenticated,
  isPro,
  priceInrMinor,
  priceUsdMinor,
  nextPath,
}: PricingModalProps) {
  const [currency, setCurrency] = useState<Currency>("INR");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountMinor = currency === "USD" ? priceUsdMinor : priceInrMinor;

  const startCheckout = async () => {
    if (!authenticated) {
      setError("Sign in first so the subscription can attach to your account.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ currency }),
      });
      const payload = (await response.json()) as CheckoutResponse;

      if (!response.ok || !payload.ok || !payload.checkoutUrl) {
        setError(payload.error ?? `Checkout failed with status ${response.status}`);
        return;
      }

      if (payload.provider === "sandbox") {
        setMessage(payload.note ?? "Sandbox activation created.");
      }
      window.location.assign(payload.checkoutUrl);
    } catch (caught) {
      setError(`Network failure: ${String(caught)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="VIP Pro"
      title="Zero-second alerts, unlimited triggers, arbitrage tooling"
      subtitle={`₹${(priceInrMinor / 100).toFixed(0)}/month for India billing, $${(priceUsdMinor / 100).toFixed(0)}/month internationally. Cancel from the dashboard; access runs to the end of the paid period.`}
      maxWidth="max-w-4xl"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="panel-2 flex flex-col p-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Free terminal</h3>
            <span className="mono text-[13px] text-muted">₹0</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">Full catalog access with the 15-minute publication delay.</p>
          <ul className="mt-4 space-y-3 text-[12px]">
            {VIP_BENEFITS.map((benefit) => (
              <li key={benefit.title} className="flex gap-2">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
                <span>
                  <span className="text-ink">{benefit.title}:</span> <span className="text-muted">{benefit.free}</span>
                </span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard" className="btn mt-5 justify-center">
            Open the free dashboard
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.06 }}
          className="panel relative flex flex-col border-deal/40 p-4"
        >
          <div className="absolute right-4 top-4 chip chip-vip">most chosen</div>
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold">
              <Sparkles className="h-4 w-4 text-deal" /> VIP Pro
            </h3>
            <span className="mono text-[15px] font-semibold text-deal">{formatMoney(amountMinor, currency)}/mo</span>
          </div>
          <p className="mt-1 text-[12px] text-muted">Instant delivery and reseller tooling for buyers who flip.</p>
          <ul className="mt-4 space-y-3 text-[12px]">
            {VIP_BENEFITS.map((benefit) => (
              <li key={benefit.title} className="flex gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-deal" />
                <span>
                  <span className="text-ink">{benefit.title}:</span> <span className="text-muted">{benefit.pro}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex gap-2">
            {(["INR", "USD"] as Currency[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCurrency(option)}
                className={`btn flex-1 ${currency === option ? "btn-primary" : ""}`}
                aria-pressed={currency === option}
              >
                {option === "INR" ? "Razorpay · ₹" : "Stripe · $"}
              </button>
            ))}
          </div>

          <button type="button" onClick={startCheckout} disabled={busy || isPro} className="btn btn-primary mt-3 justify-center">
            {isPro ? "VIP Pro active" : busy ? "Starting checkout..." : `Subscribe at ${formatMoney(amountMinor, currency)}/month`}
          </button>

          {!authenticated ? (
            <p className="mt-3 text-[11px] text-muted">
              An account is required.{" "}
              <Link href={`/login${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""}`} className="text-deal underline decoration-dotted">
                Sign in with a magic link
              </Link>{" "}
              to continue.
            </p>
          ) : null}

          {message ? <p className="mt-3 rounded-lg border border-deal/40 bg-deal/10 px-3 py-2 text-[11px] text-deal">{message}</p> : null}
          {error ? <p className="mt-3 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[11px] text-alert">{error}</p> : null}
        </motion.div>
      </div>

      <div className="panel-2 mt-4 p-4">
        <h4 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Unit economics per VIP subscriber</h4>
        <div className="mt-3 grid gap-3 text-[12px] sm:grid-cols-3">
          <div>
            <p className="text-muted">Subscription revenue</p>
            <p className="mono mt-1 text-[15px] font-semibold text-ink">₹{(priceInrMinor / 100).toFixed(0)}/mo</p>
          </div>
          <div>
            <p className="text-muted">Affiliate contribution</p>
            <p className="mono mt-1 text-[15px] font-semibold text-ink">₹900-₹2,400/yr</p>
          </div>
          <div>
            <p className="text-muted">Daily alert deliveries</p>
            <p className="mono mt-1 text-[15px] font-semibold text-ink">2-7 pings</p>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-faint">
          A VIP subscriber clicks 3-6 times per week at a 10% buy rate and a USD 60 average cart, which returns USD 24-60 monthly in
          affiliate commission alongside the subscription. Delivery cost per Telegram ping stays under one cent.
        </p>
      </div>
    </Modal>
  );
}
