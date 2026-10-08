"use client";

import { BellPlus, ExternalLink, Flame, LineChart, ShieldCheck, Star } from "lucide-react";
import Link from "next/link";

import Countdown from "@/components/Countdown";
import { formatMoney, formatNumber, formatRelativeTime } from "@/lib/format";
import type { Deal } from "@/lib/types";

export interface DealCardProps {
  deal: Deal;
  onOpenChart: (deal: Deal) => void;
  onOpenAlert: (deal: Deal) => void;
  highlight?: "none" | "sponsored" | "glitch";
}

const TIER_CLASS: Record<Deal["dealScoreTier"], string> = {
  LEGENDARY: "text-deal",
  STRONG: "text-deal",
  SOLID: "text-ink",
  FAIR: "text-muted",
  NOISE: "text-faint",
};

/**
 * High-density deal card: discount badge, Deal Score meter, coupon stack, urgency signal,
 * countdown, rating integrity and the affiliate claim action. The claim link hits
 * /api/go/amazon/[asin] so the click is logged before the buyer leaves for the marketplace.
 */
export default function DealCard({ deal, onOpenChart, onOpenAlert, highlight = "none" }: DealCardProps) {
  const scoreWidth = `${Math.min(100, Math.max(4, deal.dealScore))}%`;
  const urgencyLabel = deal.urgency === "high" ? "Draining fast" : deal.urgency === "medium" ? "Moving" : "Steady";
  const urgencyClass = deal.urgency === "high" ? "text-alert" : deal.urgency === "medium" ? "text-deal" : "text-faint";

  return (
    <article
      className={`deal-card panel flex flex-col overflow-hidden ${
        highlight === "sponsored" ? "border-deal/30" : highlight === "glitch" ? "border-alert/40" : ""
      }`}
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={deal.imageUrl}
          alt={deal.title}
          width={640}
          height={360}
          loading="lazy"
          className="h-[168px] w-full object-cover"
        />
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
          <span className="chip chip-deal">-{deal.discountPercent}%</span>
          {deal.isGlitch ? (
            <span className="chip chip-glitch">
              <Flame className="h-3 w-3" /> glitch
            </span>
          ) : null}
          {deal.isSponsored && deal.sponsorName ? <span className="chip">sponsored · {deal.sponsorName}</span> : null}
        </div>
        <div className="absolute bottom-3 right-3 rounded-lg border border-white/[0.08] bg-[rgba(8,9,14,0.82)] px-2.5 py-1.5 backdrop-blur">
          <div className="flex items-baseline gap-1">
            <span className={`mono text-[15px] font-semibold ${TIER_CLASS[deal.dealScoreTier]}`}>{deal.dealScore}</span>
            <span className="text-[10px] uppercase tracking-[0.12em] text-faint">score</span>
          </div>
          <div className="score-track mt-1 w-[74px]">
            <div className="score-fill" style={{ width: scoreWidth }} />
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-faint">
            <span className="chip">{deal.category}</span>
            <span className="mono">{deal.asin}</span>
            <span className="mono">{deal.marketplace === "amazon_com" ? "amazon.com" : "amazon.in"}</span>
          </div>
          <Link href={`/deal/${deal.asin}`} className="mt-2 block text-[14px] font-medium leading-snug text-ink hover:text-deal">
            {deal.title}
          </Link>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="mono text-[22px] font-semibold text-deal">{formatMoney(deal.currentPriceMinor, deal.currency)}</span>
              <span className="mono text-[12px] text-faint line-through">{formatMoney(deal.originalPriceMinor, deal.currency)}</span>
            </div>
            <p className="mt-1 text-[11px] text-faint">
              <span className="mono text-muted">{deal.deviationPercent}%</span> below the 90-day average of{" "}
              <span className="mono text-muted">{formatMoney(deal.ninetyDayAvgMinor, deal.currency)}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-faint">saves</p>
            <p className="mono text-[13px] font-semibold text-ink">{formatMoney(deal.savingsMinor, deal.currency)}</p>
          </div>
        </div>

        {deal.couponCode ? (
          <div className="panel-2 flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-[11px] text-muted">
              Coupon <span className="mono font-semibold text-deal">{deal.couponCode}</span> adds {deal.couponExtraPercent}% at cart
            </span>
            <span className="mono text-[12px] font-semibold text-deal">{formatMoney(deal.effectivePriceMinor, deal.currency)}</span>
          </div>
        ) : null}

        <dl className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <dt className="text-faint">Rating</dt>
            <dd className="mono mt-0.5 flex items-center gap-1 text-ink">
              <Star className="h-3 w-3 text-deal" /> {(deal.ratingX10 / 10).toFixed(1)}
            </dd>
          </div>
          <div>
            <dt className="text-faint">Reviews</dt>
            <dd className="mono mt-0.5 text-ink">{formatNumber(deal.ratingCount)}</dd>
          </div>
          <div>
            <dt className="text-faint">Stock</dt>
            <dd className={`mono mt-0.5 ${deal.inStock ? "text-ink" : "text-danger"}`}>
              {deal.inStock ? `${deal.stockLevel}% left` : "out of stock"}
            </dd>
          </div>
        </dl>

        <div className="flex items-center justify-between border-t border-white/[0.08] pt-3 text-[11px]">
          <span className={`flex items-center gap-1.5 ${urgencyClass}`}>
            <Flame className="h-3 w-3" /> {urgencyLabel}
          </span>
          <span className="flex items-center gap-1.5 text-faint">
            <ShieldCheck className="h-3 w-3 text-deal" />
            {deal.priceDelayed ? <span className="text-alert">delayed sample</span> : <Countdown />}
          </span>
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <a
            href={`${deal.claimUrl}&market=${deal.marketplace}`}
            target="_blank"
            rel="nofollow sponsored noopener"
            className="btn btn-primary w-full"
          >
            Claim Deal <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onOpenChart(deal)} className="btn">
              <LineChart className="h-3.5 w-3.5" /> 90-day chart
            </button>
            <button type="button" onClick={() => onOpenAlert(deal)} className="btn">
              <BellPlus className="h-3.5 w-3.5" /> Set alert
            </button>
          </div>
          <p className="text-[10px] text-faint">
            Sample recorded {formatRelativeTime(deal.lastCheckedAt)} · affiliate link, price confirmed at checkout
          </p>
        </div>
      </div>
    </article>
  );
}
