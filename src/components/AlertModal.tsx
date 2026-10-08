"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import Modal from "@/components/Modal";
import { formatMoney } from "@/lib/format";
import type { Deal, NotificationChannel } from "@/lib/types";

interface AlertResponse {
  ok: boolean;
  created?: boolean;
  message?: string;
  quotaRemaining?: number | null;
  error?: string;
  code?: string;
  quota?: number;
  quotaUsed?: number;
}

/**
 * Price-drop trigger form. Prefills keyword and target price from the selected listing,
 * posts to /api/alerts/create, and interprets the three failure modes the API can return:
 * unauthenticated (401), quota exceeded (402) and rate limited (429).
 */
export default function AlertModal({ deal, onClose }: { deal: Deal | null; onClose: () => void }) {
  const [keyword, setKeyword] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [channel, setChannel] = useState<NotificationChannel>("telegram");
  const [destination, setDestination] = useState("");
  const [minDiscount, setMinDiscount] = useState(40);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [quotaWarning, setQuotaWarning] = useState(false);

  useEffect(() => {
    if (!deal) return;
    setKeyword(deal.brand.length > 2 ? deal.brand : deal.category);
    setTargetPrice((deal.currentPriceMinor * 0.9 / 100).toFixed(0));
    setMinDiscount(Math.max(20, Math.min(70, deal.discountPercent)));
    setStatus("idle");
    setFeedback(null);
    setQuotaWarning(false);
  }, [deal]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setFeedback(null);

    try {
      const response = await fetch("/api/alerts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          keyword,
          targetPrice: targetPrice.trim().length > 0 ? Number(targetPrice) : null,
          currency: deal?.currency ?? "INR",
          category: deal?.category ?? null,
          minDiscountPercent: minDiscount,
          notifyChannel: channel,
          destination,
        }),
      });

      const payload = (await response.json()) as AlertResponse;

      if (!response.ok || !payload.ok) {
        setStatus("error");
        if (response.status === 402) {
          setQuotaWarning(true);
          setFeedback(payload.error ?? "Free plan trigger quota reached.");
        } else if (response.status === 401) {
          setFeedback("Sign in to persist this trigger against your account.");
        } else {
          setFeedback(payload.error ?? `Request failed with status ${response.status}`);
        }
        return;
      }

      setStatus("success");
      setFeedback(
        `${payload.created === false ? "Trigger updated" : "Trigger created"}. ${payload.message ?? ""} ${
          payload.quotaRemaining !== null && payload.quotaRemaining !== undefined ? `Quota remaining: ${payload.quotaRemaining}.` : ""
        }`.trim(),
      );
    } catch (error) {
      setStatus("error");
      setFeedback(`Network failure: ${String(error)}`);
    }
  };

  return (
    <Modal
      open={Boolean(deal)}
      onClose={onClose}
      eyebrow="Price-drop trigger"
      title={deal ? `Alert me on ${deal.title.slice(0, 60)}${deal.title.length > 60 ? "..." : ""}` : "Alert me on a product"}
      subtitle="The ingest cycle evaluates every active trigger once per cycle. Telegram and WhatsApp delivery is instant on VIP Pro; email delivery is available on the free plan."
    >
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Keyword or brand</span>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} className="input mt-1.5" required maxLength={80} />
          </label>
          <label>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
              Target price ({deal?.currency ?? "INR"})
            </span>
            <input
              value={targetPrice}
              onChange={(event) => setTargetPrice(event.target.value)}
              className="input mt-1.5"
              inputMode="decimal"
              placeholder="leave empty to trigger on any drop"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Notify channel</span>
            <select value={channel} onChange={(event) => setChannel(event.target.value as NotificationChannel)} className="input mt-1.5">
              <option value="telegram">Telegram chat id</option>
              <option value="whatsapp">WhatsApp number (E.164)</option>
              <option value="email">Email address</option>
            </select>
          </label>
          <label>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
              {channel === "telegram" ? "Chat id (e.g. -1001234567890)" : channel === "whatsapp" ? "Number (e.g. 919876543210)" : "Email"}
            </span>
            <input value={destination} onChange={(event) => setDestination(event.target.value)} className="input mt-1.5" required maxLength={160} />
          </label>
        </div>

        <label>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
            Minimum discount to notify: <span className="mono text-deal">{minDiscount}%</span>
          </span>
          <input
            type="range"
            min={0}
            max={80}
            step={5}
            value={minDiscount}
            onChange={(event) => setMinDiscount(Number(event.target.value))}
            className="mt-2 w-full accent-[#10b981]"
          />
        </label>

        {deal ? (
          <div className="panel-2 p-3 text-[12px] text-muted">
            Reference listing: <span className="mono text-ink">{deal.asin}</span> at{" "}
            <span className="mono text-deal">{formatMoney(deal.currentPriceMinor, deal.currency)}</span>. Target of{" "}
            <span className="mono text-ink">{targetPrice ? formatMoney(Number(targetPrice) * 100, deal.currency) : "any drop"}</span> triggers on the next
            matching sample.
          </div>
        ) : null}

        {feedback ? (
          <p
            className={`rounded-lg border px-3 py-2 text-[12px] ${
              status === "success" ? "border-deal/40 bg-deal/10 text-deal" : "border-alert/40 bg-alert/10 text-alert"
            }`}
          >
            {feedback}
          </p>
        ) : null}

        {quotaWarning ? (
          <div className="panel-2 flex flex-wrap items-center justify-between gap-2 p-3">
            <span className="text-[12px] text-muted">
              VIP Pro removes the trigger limit and pins delivery to a zero-second Telegram webhook.
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                window.dispatchEvent(new CustomEvent("dealsniper:open-pricing"));
              }}
              className="btn btn-primary"
            >
              <Sparkles className="h-3.5 w-3.5" /> Compare VIP Pro
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-4">
          <Link href="/alerts" className="text-[12px] text-muted underline decoration-dotted hover:text-ink">
            Manage all triggers
          </Link>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">
              Close
            </button>
            <button type="submit" disabled={status === "submitting"} className="btn btn-primary">
              {status === "submitting" ? "Saving..." : "Activate trigger"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
