import { desc, eq } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import IngestControl from "@/components/IngestControl";
import PricingCtaButton from "@/components/PricingCtaButton";
import { db } from "@/db";
import { alertEvents, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import { cronSecret, freeDelaySeconds, razorpayCredentials, stripeCredentials, vipDelaySeconds, vipPrice } from "@/lib/env";
import { getClickAnalytics, listUserAlerts } from "@/lib/queries";
import { getIngestStatus } from "@/lib/ingest";
import { rateLimitBackend } from "@/lib/ratelimit";
import { rapidApiStatus } from "@/lib/rapidapi";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Subscription state, alert triggers, affiliate click economics and ingest telemetry for a DealSniper AI account.",
  robots: { index: false, follow: false },
};

/**
 * Subscriber dashboard: plan state, delivery delay, affiliate click economics, trigger list,
 * alert dispatch history, subscription rows and platform ingest telemetry.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard&error=session_required");

  const [alerts, analytics, planRows, dispatchRows, ingest] = await Promise.all([
    listUserAlerts(user.id),
    getClickAnalytics(user.id, 30),
    db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).orderBy(desc(subscriptions.createdAt)).limit(5),
    db
      .select({
        id: alertEvents.id,
        channel: alertEvents.channel,
        status: alertEvents.status,
        detail: alertEvents.detail,
        createdAt: alertEvents.createdAt,
        dealId: alertEvents.dealId,
      })
      .from(alertEvents)
      .where(eq(alertEvents.userId, user.id))
      .orderBy(desc(alertEvents.createdAt))
      .limit(8),
    getIngestStatus(),
  ]);

  const pricing = vipPrice();
  const delay = user.isPro ? vipDelaySeconds() : freeDelaySeconds();

  return (
    <div className="pt-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className={`chip ${user.isPro ? "chip-vip" : "chip-deal"}`}>{user.isPro ? "VIP Pro" : "Free plan"}</span>
          <h1 className="mt-3 text-[26px] font-semibold tracking-tight">
            {user.fullName ? `${user.fullName}'s terminal` : user.email}
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            Publication delay: <span className="mono text-ink">{delay === 0 ? "0 seconds" : `${Math.round(delay / 60)} minutes`}</span> · auth
            provider <span className="mono text-ink">{user.provider}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/alerts" className="btn">
            Manage triggers
          </Link>
          {user.isPro ? null : <PricingCtaButton label="Upgrade to VIP Pro" primary />}
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-4">
        <Stat label="Active triggers" value={`${alerts.filter((alert) => alert.isActive).length}${user.isPro ? "" : " / 3"}`} />
        <Stat label="Alert matches" value={String(alerts.reduce((total, alert) => total + alert.matchCount, 0))} />
        <Stat label="Clicks recorded (30d)" value={String(analytics.total)} />
        <Stat
          label="Commission modelled (30d)"
          value={formatMoney(analytics.estimatedCommissionMinor, "INR", { compact: true })}
          tone="deal"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel p-5">
          <h2 className="text-[15px] font-semibold">Trigger inventory</h2>
          {alerts.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">
              No triggers configured.{" "}
              <Link href="/alerts" className="text-deal underline decoration-dotted">
                Create one
              </Link>{" "}
              to start matching drops.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-white/[0.08] text-[12px]">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-[13px] text-ink">{alert.keyword}</p>
                    <p className="mono mt-1 text-[11px] text-faint">
                      {alert.notifyChannel} · {alert.destination} · min {alert.minDiscountPercent}% ·{" "}
                      {alert.targetPriceMinor ? formatMoney(alert.targetPriceMinor, alert.currency === "USD" ? "USD" : "INR") : "any drop"}
                    </p>
                  </div>
                  <span className={`chip ${alert.isActive ? "chip-deal" : ""}`}>{alert.isActive ? "active" : "paused"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="text-[15px] font-semibold">Recent dispatches</h2>
          {dispatchRows.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">No alerts have fired yet. Matches appear here with channel and delivery status.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-[12px]">
              {dispatchRows.map((row) => (
                <li key={row.id} className="panel-2 px-3 py-2">
                  <p className="flex items-center justify-between gap-2">
                    <span className="chip">{row.channel}</span>
                    <span className={`mono text-[11px] ${row.status === "delivered" ? "text-deal" : row.status === "failed" ? "text-alert" : "text-muted"}`}>
                      {row.status}
                    </span>
                  </p>
                  <p className="mono mt-1 text-[11px] text-faint">
                    {formatRelativeTime(row.createdAt.toISOString())} · {row.detail ?? "no provider detail"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-[15px] font-semibold">Subscription records</h2>
          {planRows.length === 0 ? (
            <p className="mt-3 text-[13px] text-muted">
              No payment records. VIP Pro is {formatMoney(pricing.inrMinor, "INR")}/month in India and{" "}
              {formatMoney(pricing.usdMinor, "USD")}/month internationally.
            </p>
          ) : (
            <table className="mt-3 w-full text-left text-[12px]">
              <thead>
                <tr className="text-faint">
                  <th className="pb-2">Provider</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Amount</th>
                  <th className="pb-2">Period end</th>
                </tr>
              </thead>
              <tbody className="mono text-ink">
                {planRows.map((row) => (
                  <tr key={row.id} className="border-t border-white/[0.08]">
                    <td className="py-2">{row.provider}</td>
                    <td className="py-2">{row.status}</td>
                    <td className="py-2">{formatMoney(row.amountMinor, row.currency === "USD" ? "USD" : "INR")}</td>
                    <td className="py-2">{row.currentPeriodEnd ? row.currentPeriodEnd.toISOString().slice(0, 10) : "open"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-[11px] text-faint">
            Billing providers: Razorpay {razorpayCredentials() ? "configured" : "not configured"} · Stripe{" "}
            {stripeCredentials() ? "configured" : "not configured"}.
          </p>
        </section>

        <section className="panel p-5">
          <h2 className="text-[15px] font-semibold">Platform telemetry</h2>
          <dl className="mt-3 space-y-2 text-[12px]">
            <Row label="Listings tracked" value={String(ingest.dealCount)} />
            <Row label="Ingest cycles run" value={String(ingest.runCount)} />
            <Row label="Clicks (platform, 24h)" value={String(ingest.clickVolume24h)} />
            <Row label="VIP subscribers" value={String(ingest.proSubscribers)} />
            <Row label="Active triggers (platform)" value={String(ingest.alertSubscribers)} />
            <Row label="Sample sources" value={String(ingest.liveCatalogSources)} />
            <Row label="Rate limiter backend" value={rateLimitBackend()} />
            <Row
              label="RapidAPI"
              value={rapidApiStatus().configured ? `configured · ${rapidApiStatus().cacheTtlSeconds}s cache` : "verified catalog only"}
            />
            <Row label="Last dispatch" value={ingest.lastEventAt ? formatRelativeTime(ingest.lastEventAt) : "none"} />
          </dl>
        </section>
      </div>

      <div className="mt-4">
        <IngestControl cronSecretConfigured={cronSecret() !== null} />
      </div>

      {user.isPro ? (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-deal">
          <Sparkles className="h-3.5 w-3.5" /> VIP Pro is active. Telegram and WhatsApp triggers dispatch on the same ingest cycle as the price
          change.
        </p>
      ) : (
        <p className="mt-4 text-[12px] text-muted">
          Upgrade to remove the {Math.round(delay / 60)} minute publication delay and raise the trigger limit. Cancel any time; access runs to
          the end of the paid period.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "deal" }) {
  return (
    <div className="panel p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className={`mono mt-2 text-[20px] font-semibold ${tone === "deal" ? "text-deal" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="mono font-semibold text-ink">{value}</dd>
    </div>
  );
}
