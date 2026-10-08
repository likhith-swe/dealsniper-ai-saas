"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, Radio, RefreshCw, SlidersHorizontal } from "lucide-react";

import AlertModal from "@/components/AlertModal";
import DealCard from "@/components/DealCard";
import PriceHistoryModal from "@/components/PriceHistoryModal";
import type { CategoryStat, Deal, DealFeedResponse, DealFilters } from "@/lib/types";

export interface DealGridProps {
  initialDeals: Deal[];
  initialTotal: number;
  categories: CategoryStat[];
  delaySeconds: number;
  dataSource: string;
  searchQuery?: string;
  lockedCategory?: string;
  adEvery?: number;
}

const SORT_OPTIONS: { value: NonNullable<DealFilters["sort"]>; label: string }[] = [
  { value: "score", label: "Deal Score" },
  { value: "discount", label: "Discount depth" },
  { value: "price_asc", label: "Price low to high" },
  { value: "price_desc", label: "Price high to low" },
  { value: "freshness", label: "Most recent sample" },
];

const DISCOUNT_TIERS = [
  { value: 0, label: "Any discount" },
  { value: 30, label: "30% and above" },
  { value: 40, label: "40% and above" },
  { value: 50, label: "50% and above" },
  { value: 60, label: "60% and above" },
];

const PRICE_TIERS = [
  { value: 0, label: "Any price" },
  { value: 500000, label: "Under ₹5,000" },
  { value: 1500000, label: "Under ₹15,000" },
  { value: 3000000, label: "Under ₹30,000" },
  { value: 6000000, label: "Under ₹60,000" },
];

interface FeedState {
  deals: Deal[];
  total: number;
  loading: boolean;
  error: string | null;
  generatedAt: string;
}

/**
 * Live deal terminal grid. Holds the filter state (category, discount depth, price ceiling,
 * sort, search), refetches /api/deals on change with debouncing for the text query, and
 * interleaves native ad containers plus the featured sponsored placement between rows.
 */
export default function DealGrid({
  initialDeals,
  initialTotal,
  categories,
  delaySeconds,
  dataSource,
  searchQuery = "",
  lockedCategory,
  adEvery = 6,
}: DealGridProps) {
  const [category, setCategory] = useState<string>(lockedCategory ?? "");
  const [minDiscount, setMinDiscount] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(0);
  const [sort, setSort] = useState<NonNullable<DealFilters["sort"]>>("score");
  const [search, setSearch] = useState<string>(searchQuery);
  const [hideSponsored, setHideSponsored] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [chartDeal, setChartDeal] = useState<Deal | null>(null);
  const [alertDeal, setAlertDeal] = useState<Deal | null>(null);

  const [state, setState] = useState<FeedState>({
    deals: initialDeals,
    total: initialTotal,
    loading: false,
    error: null,
    generatedAt: new Date().toISOString(),
  });

  // One mount-time sync so a signed-in VIP session receives the zero-delay feed even when
  // the page itself was served from the static cache.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/deals?limit=48&sort=score", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as DealFeedResponse;
        if (cancelled) return;
        setState((previous) => ({
          deals: payload.deals,
          total: payload.meta.total,
          loading: false,
          error: null,
          generatedAt: payload.meta.generatedAt ?? previous.generatedAt,
        }));
      } catch (error) {
        console.warn("[deal-grid] initial session-aware sync failed", String(error));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeFilters = useMemo(
    () => ({ category, minDiscount, maxPrice, sort, search, hideSponsored }),
    [category, minDiscount, maxPrice, sort, search, hideSponsored],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState((previous) => ({ ...previous, loading: true, error: null }));
      const params = new URLSearchParams({ limit: "48", sort: activeFilters.sort });
      if (activeFilters.category) params.set("category", activeFilters.category);
      if (activeFilters.minDiscount > 0) params.set("minDiscount", String(activeFilters.minDiscount));
      if (activeFilters.maxPrice > 0) params.set("maxPrice", String(activeFilters.maxPrice));
      if (activeFilters.search.trim().length > 0) params.set("search", activeFilters.search.trim());
      if (activeFilters.hideSponsored) params.set("hideSponsored", "true");

      try {
        const response = await fetch(`/api/deals?${params.toString()}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`feed responded ${response.status}`);
        const payload = (await response.json()) as DealFeedResponse;
        setState({
          deals: payload.deals,
          total: payload.meta.total,
          loading: false,
          error: null,
          generatedAt: payload.meta.generatedAt,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((previous) => ({ ...previous, loading: false, error: String(error) }));
      }
    }, 280);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeFilters]);

  const sponsored = state.deals.filter((deal) => deal.isSponsored).slice(0, 2);
  const organic = state.deals.filter((deal) => !deal.isSponsored);

  const rows: React.ReactNode[] = [];
  organic.forEach((deal, index) => {
    rows.push(
      <DealCard
        key={deal.id}
        deal={deal}
        onOpenChart={setChartDeal}
        onOpenAlert={setAlertDeal}
        highlight={deal.isGlitch ? "glitch" : "none"}
      />,
    );
    if (adEvery > 0 && (index + 1) % adEvery === 0 && index + 1 < organic.length) {
      rows.push(<AdSlot key={`ad-${deal.id}`} index={index / adEvery} />);
    }
  });

  return (
    <section id="terminal" className="scroll-mt-28">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            Live deal terminal
            <span className="chip chip-deal">
              <span className="live-dot" /> {state.total} tracked
            </span>
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Source: <span className="mono">{dataSource}</span> · {delaySeconds === 0 ? "zero-second publication" : `${Math.round(delaySeconds / 60)} minute publication delay`} ·
            last refresh {new Date(state.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowFilters((open) => !open)} className="btn lg:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
          </button>
          <button
            type="button"
            onClick={() => setState((previous) => ({ ...previous, generatedAt: new Date().toISOString() }))}
            className="btn"
            aria-label="Refresh the feed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${state.loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </header>

      {sponsored.length > 0 ? (
        <div className="mb-4 panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="chip chip-deal">Featured drops</span>
            <p className="text-[13px] text-muted">
              Paid placements from {sponsored.map((deal) => deal.sponsorName ?? deal.brand).join(" and ")}. Ranked independently of Deal Score.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sponsored.map((deal) => (
              <a
                key={deal.id}
                href={`${deal.claimUrl}&campaign=sponsored_slot&market=${deal.marketplace}`}
                target="_blank"
                rel="nofollow sponsored noopener"
                className="btn"
              >
                {deal.brand} · -{deal.discountPercent}%
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className={`${showFilters ? "block" : "hidden"} panel mb-4 p-4 lg:block`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[150px] flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              type="search"
              placeholder="Sony, Keychron, sneakers, B09XS7JWHH"
              className="input mt-1.5"
            />
          </label>

          <label className="min-w-[140px] flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="input mt-1.5"
              disabled={Boolean(lockedCategory)}
            >
              <option value="">All categories</option>
              {categories.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.label} ({entry.dealCount})
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[130px] flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Discount</span>
            <select value={minDiscount} onChange={(event) => setMinDiscount(Number(event.target.value))} className="input mt-1.5">
              {DISCOUNT_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[130px] flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Price ceiling</span>
            <select value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} className="input mt-1.5">
              {PRICE_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[150px] flex-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as NonNullable<DealFilters["sort"]>)}
              className="input mt-1.5"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 pb-2 text-[12px] text-muted">
            <input
              type="checkbox"
              checked={hideSponsored}
              onChange={(event) => setHideSponsored(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#10b981]"
            />
            Hide sponsored
          </label>
        </div>
        <p className="mt-3 flex items-center gap-2 text-[11px] text-faint">
          <Filter className="h-3 w-3" /> {state.total} listings match the current filters. Scores recompute on every ingest cycle.
        </p>
      </div>

      {state.error ? (
        <div className="panel border-danger/40 p-4 text-[13px] text-danger">
          Feed error: {state.error}. Retry in a moment; the ingest cycle keeps running.
        </div>
      ) : null}

      {state.loading && state.deals.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="skeleton h-[420px] rounded-[14px]" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence initial={false}>{rows}</AnimatePresence>
        </div>
      )}

      {state.deals.length === 0 && !state.loading ? (
        <div className="panel p-6 text-[13px] text-muted">
          No listings match these filters. Widen the discount tier or clear the search term — the catalog currently tracks{" "}
          {state.total} products.
        </div>
      ) : null}

      <AlertModal deal={alertDeal} onClose={() => setAlertDeal(null)} />

      <PriceHistoryModal deal={chartDeal} onClose={() => setChartDeal(null)} />
    </section>
  );
}

function AdSlot({ index }: { index: number }) {
  return (
    <aside
      className="panel flex h-full min-h-[420px] flex-col justify-between p-4"
      aria-label="Sponsored ad container"
      data-ad-slot={`inline-${index}`}
    >
      <div>
        <span className="chip">Ad container · inline-{index}</span>
        <h3 className="mt-3 text-[15px] font-semibold text-ink">Reserved inventory for D2C brands</h3>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Native slot rendered between deal rows. Inventory clears at USD 5-15 CPM through EthicalAds or AdSense, and is
          released to direct D2C sponsors at a fixed monthly rate.
        </p>
      </div>
      <div className="mt-4 space-y-2 text-[11px] text-faint">
        <p className="mono">placement: grid inline</p>
        <p className="mono">min height: 420px</p>
        <p className="mono">policy: no auto-refresh, no interstitials</p>
        <a href="/#sponsors" className="btn mt-2 w-full">
          <Radio className="h-3.5 w-3.5" /> Sponsor this slot
        </a>
      </div>
    </aside>
  );
}


