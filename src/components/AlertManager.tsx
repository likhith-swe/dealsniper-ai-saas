"use client";

import { BellRing, PauseCircle, PlayCircle, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";

import { formatMoney, formatRelativeTime } from "@/lib/format";
import type { AlertRecord, NotificationChannel } from "@/lib/types";

export interface AlertManagerProps {
  initialAlerts: AlertRecord[];
  isPro: boolean;
  quota: number | null;
  email: string;
  onQuotaExceededNote?: string;
}

interface CreateResponse {
  ok: boolean;
  alert?: AlertRecord | null;
  created?: boolean;
  message?: string;
  quotaRemaining?: number | null;
  error?: string;
}

/**
 * Full-page trigger manager: creates, pauses, resumes and deletes price-drop alerts, and
 * shows delivery statistics per trigger (match count, last fired). Quota limits are shown
 * before submission so free accounts know how many slots remain.
 */
export default function AlertManager({ initialAlerts, isPro, quota, email }: AlertManagerProps) {
  const [alerts, setAlerts] = useState<AlertRecord[]>(initialAlerts);
  const [keyword, setKeyword] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [channel, setChannel] = useState<NotificationChannel>("telegram");
  const [destination, setDestination] = useState("");
  const [minDiscount, setMinDiscount] = useState(40);
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "success">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const usedCount = alerts.filter((alert) => alert.isActive).length;
  const quotaFull = quota !== null && usedCount >= quota;

  const createAlert = async (event: React.FormEvent<HTMLFormElement>) => {
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
          currency: "INR",
          minDiscountPercent: minDiscount,
          notifyChannel: channel,
          destination: destination.trim().length > 0 ? destination : email,
        }),
      });
      const payload = (await response.json()) as CreateResponse;

      if (!response.ok || !payload.ok) {
        setStatus("error");
        setFeedback(payload.error ?? `Request failed with status ${response.status}`);
        return;
      }

      setStatus("success");
      setFeedback(payload.message ?? "Trigger saved.");

      const refresh = await fetch("/api/alerts", { cache: "no-store" });
      if (refresh.ok) {
        const body = (await refresh.json()) as { ok: boolean; alerts?: AlertRecord[] };
        if (body.ok && body.alerts) setAlerts(body.alerts);
      }
      setKeyword("");
      setTargetPrice("");
    } catch (error) {
      setStatus("error");
      setFeedback(`Network failure: ${String(error)}`);
    }
  };

  const toggleAlert = async (alert: AlertRecord) => {
    try {
      const response = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ isActive: !alert.isActive }),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      setAlerts((previous) => previous.map((entry) => (entry.id === alert.id ? { ...entry, isActive: !entry.isActive } : entry)));
    } catch (error) {
      setFeedback(`Could not change the trigger state: ${String(error)}`);
      setStatus("error");
    }
  };

  const deleteAlert = async (alert: AlertRecord) => {
    try {
      const response = await fetch(`/api/alerts/${alert.id}`, { method: "DELETE", headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`status ${response.status}`);
      setAlerts((previous) => previous.filter((entry) => entry.id !== alert.id));
    } catch (error) {
      setFeedback(`Could not delete the trigger: ${String(error)}`);
      setStatus("error");
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <form onSubmit={createAlert} className="panel h-fit p-5">
        <header className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <BellRing className="h-4 w-4 text-deal" /> New trigger
          </h2>
          <span className={`chip ${isPro ? "chip-vip" : ""}`}>
            {isPro ? "unlimited" : `${usedCount}/${quota ?? 3} active`}
          </span>
        </header>

        <div className="mt-4 grid gap-3">
          <label>
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Keyword, brand or ASIN</span>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} required maxLength={80} className="input mt-1.5" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Target price (INR)</span>
              <input
                value={targetPrice}
                onChange={(event) => setTargetPrice(event.target.value)}
                inputMode="decimal"
                placeholder="optional"
                className="input mt-1.5"
              />
            </label>
            <label>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Min discount</span>
              <input
                type="number"
                min={0}
                max={90}
                value={minDiscount}
                onChange={(event) => setMinDiscount(Number(event.target.value))}
                className="input mt-1.5"
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Channel</span>
              <select value={channel} onChange={(event) => setChannel(event.target.value as NotificationChannel)} className="input mt-1.5">
                <option value="telegram">Telegram chat id</option>
                <option value="whatsapp">WhatsApp number</option>
                <option value="email">Email</option>
              </select>
            </label>
            <label>
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Destination</span>
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder={channel === "email" ? email : channel === "telegram" ? "-1001234567890" : "919876543210"}
                className="input mt-1.5"
              />
            </label>
          </div>
        </div>

        {feedback ? (
          <p
            className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${
              status === "error" ? "border-alert/40 bg-alert/10 text-alert" : "border-deal/40 bg-deal/10 text-deal"
            }`}
          >
            {feedback}
          </p>
        ) : null}

        {quotaFull ? (
          <div className="panel-2 mt-3 p-3 text-[12px] text-muted">
            Free accounts hold {quota} active triggers. VIP Pro removes the limit and pins delivery to a zero-second Telegram webhook.
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("dealsniper:open-pricing"))}
              className="btn btn-primary mt-3 w-full"
            >
              <Sparkles className="h-3.5 w-3.5" /> Compare VIP Pro
            </button>
          </div>
        ) : null}

        <button type="submit" disabled={status === "submitting" || quotaFull} className="btn btn-primary mt-4 w-full">
          {status === "submitting" ? "Saving..." : "Activate trigger"}
        </button>
      </form>

      <section className="panel p-5">
        <header className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Active triggers</h2>
          <span className="mono text-[12px] text-muted">{alerts.length} configured</span>
        </header>

        {alerts.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted">
            No triggers yet. Create one on the left, or open a listing in the terminal and use Set alert to prefill the threshold.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.08]">
            {alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-[200px]">
                  <p className="text-[13px] font-medium text-ink">{alert.keyword}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-faint">
                    <span className="chip">{alert.notifyChannel}</span>
                    <span className="mono">{alert.destination}</span>
                    <span className="mono">
                      target {alert.targetPriceMinor ? formatMoney(alert.targetPriceMinor, alert.currency) : "any drop"}
                    </span>
                    <span className="mono">min {alert.minDiscountPercent}%</span>
                    <span className="mono">{alert.matchCount} matches</span>
                    {alert.lastTriggeredAt ? <span className="mono">fired {formatRelativeTime(alert.lastTriggeredAt)}</span> : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleAlert(alert)} className="btn" aria-label={alert.isActive ? "Pause trigger" : "Resume trigger"}>
                    {alert.isActive ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                    {alert.isActive ? "Pause" : "Resume"}
                  </button>
                  <button type="button" onClick={() => deleteAlert(alert)} className="btn" aria-label="Delete trigger">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 border-t border-white/[0.08] pt-4 text-[11px] leading-relaxed text-faint">
          Triggers are evaluated on every ingest cycle. A repeat guard suppresses the same listing for six hours so one price event
          produces one message.
        </p>
      </section>
    </div>
  );
}
