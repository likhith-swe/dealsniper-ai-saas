"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import Modal from "@/components/Modal";
import PriceChart from "@/components/PriceChart";
import { formatMoney, formatRelativeTime } from "@/lib/format";
import type { Currency, Deal, PricePoint } from "@/lib/types";

interface HistoryResponse {
  ok: boolean;
  currency?: Currency;
  prices?: PricePoint[];
  stats?: { samples: number; averageMinor: number; lowestMinor: number; highestMinor: number; deviationFromAverage: number };
  stockDrain?: { currentLevel: number; priceVelocityPerHourMinor: number; inStock: boolean };
  error?: string;
}

/**
 * 90-day price trend modal. Fetches the sample series for the selected listing, renders the
 * chart, and surfaces the Deal Score component breakdown so a buyer can see why the listing
 * ranked where it did.
 */
export default function PriceHistoryModal({ deal, onClose }: { deal: Deal | null; onClose: () => void }) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<HistoryResponse["stats"] | null>(null);

  useEffect(() => {
    if (!deal) {
      setPoints([]);
      setStats(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch(`/api/deals/${deal.asin}/history?days=90`, { signal: controller.signal, cache: "no-store" });
        const payload = (await response.json()) as HistoryResponse;
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? `history responded ${response.status}`);
        }
        setPoints(payload.prices ?? []);
        setStats(payload.stats ?? null);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(String(caught));
        setPoints(deal.priceHistory ?? []);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [deal]);

  if (!deal) return <Modal open={false} onClose={onClose} title="Price history" children={null} />;

  const parts = deal.dealScoreParts;

  return (
    <Modal
      open={Boolean(deal)}
      onClose={onClose}
      eyebrow={`${deal.marketplace === "amazon_com" ? "amazon.com" : "amazon.in"} · ${deal.asin}`}
      title={deal.title}
      subtitle={`Sample recorded ${formatRelativeTime(deal.lastCheckedAt)}. Scores recompute on every ingest cycle from the same signals shown below.`}
      maxWidth="max-w-3xl"
    >
      {loading ? <div className="skeleton h-[260px] rounded-[12px]" /> : null}

      {error ? (
        <p className="mb-3 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[12px] text-alert">
          History endpoint reported: {error}. Showing cached samples where available.
        </p>
      ) : null}

      {!loading && points.length > 0 ? (
        <PriceChart points={points} currency={deal.currency} originalPriceMinor={deal.originalPriceMinor} currentPriceMinor={deal.currentPriceMinor} />
      ) : null}

      {!loading && points.length === 0 ? (
        <p className="panel-2 px-3 py-4 text-[13px] text-muted">
          No samples recorded for this listing yet. The ingest cycle appends one point per price change, so a chart appears after the first
          movement.
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="panel-2 p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Deal Score breakdown</h3>
          <ul className="mt-3 space-y-2.5 text-[12px]">
            <ScoreRow label="Deviation from 90-day average" weight="40%" value={parts.priceDeviation} note={`${deal.deviationPercent}% below average`} />
            <ScoreRow label="Stock depletion velocity" weight="25%" value={parts.stockVelocity} note={`${deal.stockLevel}% inventory remaining`} />
            <ScoreRow label="Review integrity" weight="20%" value={parts.reviewIntegrity} note={`${(deal.ratingX10 / 10).toFixed(1)} stars, ${deal.ratingCount.toLocaleString("en-IN")} reviews`} />
            <ScoreRow
              label="Coupon stack"
              weight="15%"
              value={parts.couponStack}
              note={deal.couponCode ? `${deal.couponCode} adds ${deal.couponExtraPercent}% at cart` : "no promo code published"}
            />
          </ul>
          <p className="mt-3 border-t border-white/[0.08] pt-3 text-[12px] text-muted">
            Composite: <span className="mono font-semibold text-deal">{deal.dealScore}/100</span> · grade{" "}
            <span className="mono text-ink">{deal.dealScoreTier}</span>
          </p>
        </div>

        <div className="panel-2 p-4">
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Purchase maths</h3>
          <dl className="mt-3 space-y-2 text-[12px]">
            <Row label="List price" value={formatMoney(deal.originalPriceMinor, deal.currency)} />
            <Row label="90-day average" value={formatMoney(deal.ninetyDayAvgMinor, deal.currency)} />
            <Row label="Lowest recorded" value={formatMoney(stats?.lowestMinor ?? deal.lowestEverMinor, deal.currency)} />
            <Row label="Live price" value={formatMoney(deal.currentPriceMinor, deal.currency)} tone="deal" />
            {deal.couponCode ? (
              <Row label={`After ${deal.couponCode}`} value={formatMoney(deal.effectivePriceMinor, deal.currency)} tone="deal" />
            ) : null}
            <Row label="You save" value={formatMoney(deal.savingsMinor, deal.currency)} tone="deal" />
            <Row label="Samples on record" value={String(stats?.samples ?? points.length)} />
          </dl>
          <a
            href={`${deal.claimUrl}&campaign=history_modal&market=${deal.marketplace}`}
            target="_blank"
            rel="nofollow sponsored noopener"
            className="btn btn-primary mt-4 w-full"
          >
            Claim at {formatMoney(deal.effectivePriceMinor, deal.currency)} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </Modal>
  );
}

function ScoreRow({ label, weight, value, note }: { label: string; weight: string; value: number; note: string }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted">
          {label} <span className="text-faint">({weight})</span>
        </span>
        <span className="mono text-ink">{value.toFixed(0)}</span>
      </div>
      <div className="score-track mt-1.5">
        <div className="score-fill" style={{ width: `${Math.min(100, Math.max(2, value))}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-faint">{note}</p>
    </li>
  );
}

function Row({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "deal" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`mono font-semibold ${tone === "deal" ? "text-deal" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
