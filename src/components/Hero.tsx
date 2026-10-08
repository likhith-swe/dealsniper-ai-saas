"use client";

import { ArrowRight, BellRing, LineChart, Sparkles, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatMoney, formatNumber } from "@/lib/format";
import type { Deal, PlatformStats } from "@/lib/types";

export interface HeroProps {
  stats: PlatformStats;
  topDeal: Deal | null;
  initialQuery?: string;
}

/**
 * Above-the-fold terminal header: value proposition, live coverage metrics, search entry
 * point and the two conversion routes (VIP Pro subscription, Glitch Drops newsletter).
 */
export default function Hero({ stats, topDeal, initialQuery = "" }: HeroProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    router.push(term.length > 0 ? `/?search=${encodeURIComponent(term)}#terminal` : "/#terminal");
  };

  return (
    <section className="grid-backdrop relative overflow-hidden rounded-[18px] border border-white/[0.08] p-6 sm:p-9">
      <div className="relative z-10 grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip chip-deal">
              <span className="live-dot" /> 30-minute ingest cycle
            </span>
            <span className="chip">Amazon India · Amazon US · Flipkart</span>
            <span className="chip chip-glitch">{stats.glitchCount} live glitch candidates</span>
          </div>

          <h1 className="mt-5 max-w-3xl text-[34px] font-semibold leading-[1.08] tracking-tight sm:text-[46px]">
            Every price anomaly on the marketplace, scored against 90 days of its own history.
          </h1>

          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted">
            DealSniper AI records a price sample for every tracked listing, compares it to the trailing 90-day average, weighs the stock
            drain rate and review integrity, then ranks the result on a 0-100 Deal Score. VIP Pro callers see samples the second they land
            and receive matching drops on Telegram or WhatsApp.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-2 sm:flex-row">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a product, brand or ASIN to check its price history"
              aria-label="Search a product, brand or ASIN"
              className="input sm:max-w-md"
            />
            <button type="submit" className="btn btn-primary">
              Check the price history <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>

          <div className="mt-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("dealsniper:open-pricing"))}
              className="btn btn-primary"
            >
              <Sparkles className="h-3.5 w-3.5" /> VIP Pro · instant alerts
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("dealsniper:open-newsletter"))}
              className="btn"
            >
              <BellRing className="h-3.5 w-3.5" /> Daily 10 Glitch Drops · 07:30 IST
            </button>
            <Link href="/alerts" className="btn btn-ghost">
              <Ticket className="h-3.5 w-3.5" /> Build a trigger
            </Link>
          </div>
        </div>

        <div className="panel flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Coverage</span>
              <span className="chip chip-deal">live</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              <Metric label="Listings tracked" value={formatNumber(stats.trackedProducts)} />
              <Metric label="Samples recorded" value={formatNumber(stats.priceChecksToday)} />
              <Metric label="Average discount" value={`${stats.avgDiscountPercent}%`} tone="deal" />
              <Metric label="Affiliate clicks 24h" value={formatNumber(stats.affiliateClicksToday)} />
            </dl>
          </div>

          {topDeal ? (
            <div className="panel-2 mt-5 p-4">
              <div className="flex items-center justify-between">
                <span className="chip chip-deal">top score</span>
                <span className="mono text-[12px] text-muted">
                  score {topDeal.dealScore}/100 · {topDeal.dealScoreTier}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-ink">{topDeal.title}</p>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <span className="mono text-[20px] font-semibold text-deal">{formatMoney(topDeal.currentPriceMinor, topDeal.currency)}</span>
                  <span className="mono ml-2 text-[12px] text-faint line-through">
                    {formatMoney(topDeal.originalPriceMinor, topDeal.currency)}
                  </span>
                </div>
                <span className="chip chip-deal">-{topDeal.discountPercent}%</span>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px] text-faint">
                <LineChart className="h-3 w-3" /> {topDeal.deviationPercent}% below the 90-day average of{" "}
                <span className="mono text-muted">{formatMoney(topDeal.ninetyDayAvgMinor, topDeal.currency)}</span>
              </div>
              <a
                href={`${topDeal.claimUrl}&campaign=hero_top_deal&market=${topDeal.marketplace}`}
                target="_blank"
                rel="nofollow sponsored noopener"
                className="btn btn-primary mt-4 w-full"
              >
                Claim at {formatMoney(topDeal.currentPriceMinor, topDeal.currency)}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "deal" }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className={`mono mt-1 text-[19px] font-semibold ${tone === "deal" ? "text-deal" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
