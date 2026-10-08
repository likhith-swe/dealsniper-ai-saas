"use client";

import { useEffect, useState } from "react";

import { formatMoney } from "@/lib/format";
import type { Deal } from "@/lib/types";

interface TickerState {
  deals: Deal[];
  loading: boolean;
  error: string | null;
}

/**
 * Live price ticker. Polls the deal feed every 45 seconds and renders a marquee of the
 * freshest samples so the navigation bar always shows current movement instead of a static
 * marketing claim.
 */
export default function DealTicker({ initialDeals = [] }: { initialDeals?: Deal[] }) {
  const [state, setState] = useState<TickerState>({ deals: initialDeals, loading: initialDeals.length === 0, error: null });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/deals?limit=14&sort=freshness", { cache: "no-store" });
        if (!response.ok) throw new Error(`feed responded ${response.status}`);
        const payload = (await response.json()) as { ok: boolean; deals?: Deal[] };
        if (cancelled) return;
        setState({ deals: payload.deals ?? [], loading: false, error: null });
      } catch (error) {
        if (cancelled) return;
        setState((previous) => ({ ...previous, loading: false, error: String(error) }));
      }
    };

    const interval = window.setInterval(load, 45_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const deals = state.deals;
  if (deals.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-faint">
        <span className="live-dot" />
        <span>{state.loading ? "Sampling marketplaces..." : "Ticker idle"}</span>
      </div>
    );
  }

  const items = [...deals, ...deals];

  return (
    <div className="relative w-full overflow-hidden">
      <div className="marquee gap-6">
        {items.map((deal, index) => (
          <a
            key={`${deal.asin}-${index}`}
            href={`/deal/${deal.asin}`}
            className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted transition-colors hover:text-ink"
          >
            <span className={deal.isGlitch ? "text-alert" : "text-deal"}>{deal.isGlitch ? "GLITCH" : `-${deal.discountPercent}%`}</span>
            <span className="max-w-[220px] truncate text-ink/90">{deal.title}</span>
            <span className="text-deal">{formatMoney(deal.currentPriceMinor, deal.currency)}</span>
            <span className="text-faint">score {deal.dealScore}</span>
            <span className="text-faint">/</span>
          </a>
        ))}
      </div>
    </div>
  );
}
