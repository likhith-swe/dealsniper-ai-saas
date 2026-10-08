"use client";

import { useMemo, useState } from "react";

import { formatMoney } from "@/lib/format";
import type { Currency, PricePoint } from "@/lib/types";

export interface PriceChartProps {
  points: PricePoint[];
  currency: Currency;
  height?: number;
  originalPriceMinor?: number;
  currentPriceMinor?: number;
}

const RANGE_OPTIONS = [7, 30, 90] as const;

interface ChartStats {
  min: number;
  max: number;
  current: number;
  average: number;
  lowest: number;
  volatilityPercent: number;
  deviationFromAverage: number;
}

function computeStats(points: PricePoint[], fallbackCurrent: number): ChartStats {
  if (points.length === 0) {
    return {
      min: fallbackCurrent,
      max: fallbackCurrent,
      current: fallbackCurrent,
      average: fallbackCurrent,
      lowest: fallbackCurrent,
      volatilityPercent: 0,
      deviationFromAverage: 0,
    };
  }
  const prices = points.map((point) => point.p);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const current = prices[prices.length - 1] ?? fallbackCurrent;
  const average = Math.round(prices.reduce((total, price) => total + price, 0) / prices.length);
  const variance = prices.reduce((total, price) => total + (price - average) ** 2, 0) / prices.length;
  const deviation = Math.sqrt(variance);

  return {
    min,
    max,
    current,
    average,
    lowest: min,
    volatilityPercent: average > 0 ? Math.round((deviation / average) * 1000) / 10 : 0,
    deviationFromAverage: average > 0 ? Math.round(((average - current) / average) * 1000) / 10 : 0,
  };
}

/**
 * 90-day price chart rendered as inline SVG. The green line is the recorded sample path,
 * the horizontal dashed rule is the trailing average, the amber marker is the lowest
 * recorded sample and the emerald dot is the live price that closed the series.
 */
export default function PriceChart({
  points,
  currency,
  height = 220,
  originalPriceMinor,
  currentPriceMinor,
}: PriceChartProps) {
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(90);

  const filtered = useMemo(() => {
    if (points.length === 0) return [];
    const cutoff = Date.now() - rangeDays * 86_400_000;
    const withinRange = points.filter((point) => point.t >= cutoff);
    return withinRange.length >= 8 ? withinRange : points;
  }, [points, rangeDays]);

  const fallbackCurrent = currentPriceMinor ?? points[points.length - 1]?.p ?? 0;
  const stats = useMemo(() => computeStats(filtered, fallbackCurrent), [filtered, fallbackCurrent]);

  const width = 760;
  const padding = { top: 18, right: 16, bottom: 26, left: 60 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const upperBound = Math.max(stats.max, originalPriceMinor ?? stats.max) * 1.02;
  const lowerBound = stats.min * 0.965;
  const span = Math.max(1, upperBound - lowerBound);

  const xFor = (index: number) => padding.left + (filtered.length <= 1 ? 0 : (index / (filtered.length - 1)) * plotWidth);
  const yFor = (price: number) => padding.top + plotHeight - ((price - lowerBound) / span) * plotHeight;

  const linePath = filtered.map((point, index) => `${index === 0 ? "M" : "L"}${xFor(index).toFixed(1)},${yFor(point.p).toFixed(1)}`).join(" ");
  const areaPath = filtered.length > 1
    ? `${linePath} L${xFor(filtered.length - 1).toFixed(1)},${(padding.top + plotHeight).toFixed(1)} L${xFor(0).toFixed(1)},${(padding.top + plotHeight).toFixed(1)} Z`
    : "";

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => upperBound - ratio * span);
  const lowestIndex = filtered.reduce((bestIndex, point, index) => (point.p < filtered[bestIndex].p ? index : bestIndex), 0);
  const lowestPoint = filtered[lowestIndex];
  const lastPoint = filtered[filtered.length - 1];

  const firstDate = filtered[0] ? new Date(filtered[0].t) : new Date();
  const lastDate = lastPoint ? new Date(lastPoint.t) : new Date();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRangeDays(option)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                rangeDays === option
                  ? "border-deal/50 bg-deal/12 text-deal"
                  : "border-white/[0.08] bg-white/[0.03] text-muted hover:text-ink"
              }`}
            >
              {option}d
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
          <span className="mono">{filtered.length} samples</span>
          <span className="mono">avg {formatMoney(stats.average, currency)}</span>
          <span className="mono">low {formatMoney(stats.lowest, currency)}</span>
          <span className="mono">σ {stats.volatilityPercent}%</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price history chart" className="w-full">
        <defs>
          <linearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yFor(value)}
              y2={yFor(value)}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text x={padding.left - 8} y={yFor(value) + 4} textAnchor="end" fontSize="10" fill="#6b7480" className="mono">
              {formatMoney(Math.round(value), currency, { compact: true })}
            </text>
          </g>
        ))}

        {areaPath ? <path d={areaPath} fill="url(#priceArea)" /> : null}

        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={yFor(stats.average)}
          y2={yFor(stats.average)}
          stroke="rgba(255,255,255,0.42)"
          strokeDasharray="5 5"
          strokeWidth="1"
        />
        <text x={width - padding.right} y={yFor(stats.average) - 5} textAnchor="end" fontSize="10" fill="#9aa3b2" className="mono">
          90d average
        </text>

        {linePath ? <path d={linePath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /> : null}

        {lowestPoint ? (
          <g>
            <circle cx={xFor(lowestIndex)} cy={yFor(lowestPoint.p)} r="4.5" fill="#f97316" />
            <text x={xFor(lowestIndex)} y={yFor(lowestPoint.p) - 10} textAnchor="middle" fontSize="10" fill="#f97316" className="mono">
              low {formatMoney(lowestPoint.p, currency, { compact: true })}
            </text>
          </g>
        ) : null}

        {lastPoint ? (
          <g>
            <circle cx={xFor(filtered.length - 1)} cy={yFor(lastPoint.p)} r="5.5" fill="#10b981" stroke="#04150f" strokeWidth="2" />
            <text x={xFor(filtered.length - 1) - 6} y={yFor(lastPoint.p) + 18} textAnchor="end" fontSize="11" fill="#10b981" className="mono">
              now {formatMoney(lastPoint.p, currency, { compact: true })}
            </text>
          </g>
        ) : null}

        <text x={padding.left} y={height - 6} fontSize="10" fill="#6b7480">
          {firstDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
        </text>
        <text x={width - padding.right} y={height - 6} textAnchor="end" fontSize="10" fill="#6b7480">
          {lastDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
        </text>
      </svg>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Current" value={formatMoney(stats.current, currency)} tone="deal" />
        <StatTile label={`${rangeDays}-day average`} value={formatMoney(stats.average, currency)} />
        <StatTile label="Lowest recorded" value={formatMoney(stats.lowest, currency)} tone="alert" />
        <StatTile
          label="Below average"
          value={`${stats.deviationFromAverage >= 0 ? "-" : "+"}${Math.abs(stats.deviationFromAverage)}%`}
          tone={stats.deviationFromAverage >= 0 ? "deal" : "muted"}
        />
      </dl>
    </div>
  );
}

function StatTile({ label, value, tone = "muted" }: { label: string; value: string; tone?: "muted" | "deal" | "alert" }) {
  const toneClass = tone === "deal" ? "text-deal" : tone === "alert" ? "text-alert" : "text-ink";
  return (
    <div className="panel-2 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className={`mono mt-1 text-[15px] font-semibold ${toneClass}`}>{value}</dd>
    </div>
  );
}
