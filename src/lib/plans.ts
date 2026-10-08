/**
 * Client-safe plan copy. Kept out of `lib/billing.ts` so browser bundles never pull in the
 * Postgres driver that the billing module uses server side.
 */
export interface PlanBenefit {
  title: string;
  free: string;
  pro: string;
}

export const VIP_BENEFITS: PlanBenefit[] = [
  {
    title: "Feed delay",
    free: "15 minutes behind the price event",
    pro: "Zero-second publication of every sample",
  },
  {
    title: "Alert channels",
    free: "Email digest, 3 triggers",
    pro: "Telegram and WhatsApp webhooks, unlimited triggers",
  },
  {
    title: "Arbitrage tools",
    free: "Deal Score and 90-day chart",
    pro: "Resale margin calculator with fee and shipping modelling",
  },
  {
    title: "Glitch Drops",
    free: "Weekly summary",
    pro: "Daily 10 Glitch Drops at 07:30 IST before public posting",
  },
  {
    title: "Price velocity telemetry",
    free: "Last 7 days",
    pro: "Full 180-day sample history and stock drain rate",
  },
];

export const PLAN_LABELS = {
  free: { name: "Free terminal", priceInrMinor: 0, priceUsdMinor: 0 },
  vip_pro: { name: "VIP Pro", priceInrMinor: 29900, priceUsdMinor: 700 },
} as const;
