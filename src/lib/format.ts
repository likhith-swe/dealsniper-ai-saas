import type { Currency } from "@/lib/types";

const CURRENCY_LOCALE: Record<Currency, string> = {
  INR: "en-IN",
  USD: "en-US",
};

/**
 * Formats an integer minor-unit amount (paise / cents) into a display string.
 * `compact` produces the dense terminal style used inside deal cards (₹1.2L, $1.2K).
 */
export function formatMoney(
  minor: number,
  currency: Currency = "INR",
  options: { compact?: boolean; withDecimals?: boolean; showSymbol?: boolean } = {},
): string {
  const { compact = false, showSymbol = true } = options;
  const major = minor / 100;
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency], {
    style: showSymbol ? "currency" : "decimal",
    currency,
    notation: compact && Math.abs(major) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: compact && Math.abs(major) >= 1000 ? 1 : 0,
    minimumFractionDigits: 0,
  }).format(major);
}

export function formatNumber(value: number, locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatRating(ratingX10: number): string {
  return (ratingX10 / 10).toFixed(1);
}

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const deltaSeconds = Math.max(0, Math.round((now - then) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.round(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Countdown label for deal expiry windows (default 8 hour claim window). */
export function formatCountdown(expiresAtMs: number, now: number = Date.now()): string {
  const remaining = Math.max(0, expiresAtMs - now);
  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Compact USD/INR pair for pricing surfaces that bill in both markets. */
export function priceTierLabel(amountMinor: number, currency: Currency): string {
  return `${formatMoney(amountMinor, currency, { withDecimals: false })}/mo`;
}
