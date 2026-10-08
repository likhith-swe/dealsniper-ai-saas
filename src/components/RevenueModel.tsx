"use client";

import { BadgeIndianRupee, Newspaper, Radio, Sparkles, Ticket } from "lucide-react";
import Link from "next/link";

interface Channel {
  id: string;
  icon: typeof Ticket;
  title: string;
  mechanism: string;
  economics: string;
  implementation: string;
}

const CHANNELS: Channel[] = [
  {
    id: "affiliate",
    icon: Ticket,
    title: "Marketplace affiliate commission",
    mechanism:
      "Every Claim Deal button routes through /api/go/amazon/[asin], which records the click, appends the associate tag and forwards the buyer to checkout. The 24-hour cookie window covers the deal item and everything else in the same cart.",
    economics: "4-10% of cart value. 100 clicks/day at a 10% buy rate and USD 60 average cart returns USD 24-60 per day.",
    implementation: "Click analytics in Postgres, per-category commission modelling, bot filtering on user agent.",
  },
  {
    id: "vip",
    icon: Sparkles,
    title: "VIP Pro subscription",
    mechanism:
      "Free accounts read the feed with a 15-minute publication delay and hold three alert triggers. VIP Pro removes the delay, unlocks unlimited keyword triggers, Telegram and WhatsApp webhook delivery, and the reseller margin calculator.",
    economics: "₹299/month (USD 7). 50 subscribers equals ₹14,950/month recurring with delivery costs under ₹150.",
    implementation: "Razorpay subscriptions for INR, Stripe Billing for USD, HMAC-verified webhooks that flip profiles.is_pro.",
  },
  {
    id: "newsletter",
    icon: Newspaper,
    title: "Daily 10 Glitch Drops newsletter",
    mechanism:
      "A single sponsor slot per send, placed above the ten listings. Subscribers are captured from the terminal and the deal pages, then mirrored to Loops.so or Resend with category interests attached.",
    economics: "USD 50-90 CPM. A 20,000-address list returns USD 1,000-1,800 per sponsored send.",
    implementation: "newsletter_subscribers table, CRM sync on subscribe, /api/newsletter/subscribe validation and rate limits.",
  },
  {
    id: "ads",
    icon: Radio,
    title: "Native ad containers",
    mechanism:
      "Reserved inline slots rendered between deal rows with a fixed minimum height so layout shift never invalidates the price chart. Inventory sells through EthicalAds or AdSense and is released to direct sponsors when CPM beats programmatic.",
    economics: "USD 5-15 CPM on deal-hunter traffic converts to USD 300-900 per million page views.",
    implementation: "Server-rendered containers with data-ad-slot attributes, no auto-refresh and no interstitials.",
  },
  {
    id: "sponsored",
    icon: BadgeIndianRupee,
    title: "Brand promotion placements",
    mechanism:
      "D2C brands pay for a pinned slot above the featured drops row. Sponsored listings carry a visible label, keep their real Deal Score and never displace organic rankings inside the grid.",
    economics: "₹15,000-₹60,000 per month per brand for the pinned placement plus newsletter inclusion.",
    implementation: "deals.is_sponsored, sponsor_name and sponsor_cpm_minor drive the ordering of the featured row.",
  },
];

/**
 * Revenue model section. Each channel states the mechanism, the unit economics and the code
 * path that implements it, so the landing page doubles as the monetisation specification.
 */
export default function RevenueModel() {
  return (
    <section id="model" className="mt-14 scroll-mt-28">
      <header className="max-w-3xl">
        <span className="chip">Monetisation</span>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight">Five revenue channels wired into the same ingest pipeline</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          The price pipeline is the product and the distribution asset. Each channel below reads the same tables, so adding revenue does
          not add a second source of truth.
        </p>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {CHANNELS.map((channel) => {
          const Icon = channel.icon;
          return (
            <article key={channel.id} id={channel.id} className="panel p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04]">
                  <Icon className="h-4 w-4 text-deal" />
                </span>
                <h3 className="text-[15px] font-semibold">{channel.title}</h3>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{channel.mechanism}</p>
              <dl className="mt-4 grid gap-3 border-t border-white/[0.08] pt-4 text-[12px] sm:grid-cols-2">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Unit economics</dt>
                  <dd className="mt-1 leading-relaxed text-ink">{channel.economics}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Implementation</dt>
                  <dd className="mt-1 leading-relaxed text-muted">{channel.implementation}</dd>
                </div>
              </dl>
            </article>
          );
        })}

        <article id="sponsors" className="panel scroll-mt-28 border-deal/30 p-5">
          <span className="chip chip-deal">For D2C brands</span>
          <h3 className="mt-3 text-[15px] font-semibold">Sponsorship inventory and rates</h3>
          <ul className="mt-3 space-y-2 text-[13px] text-muted">
            <li>
              Pinned featured drop: <span className="mono text-ink">₹15,000-₹60,000 / month</span> for the slot above the terminal grid.
            </li>
            <li>
              Newsletter takeover: <span className="mono text-ink">USD 50-90 CPM</span>, one brand per send at 07:30 IST.
            </li>
            <li>
              Inline native container: <span className="mono text-ink">USD 5-15 CPM</span> programmatic floor, direct deals above it.
            </li>
            <li>
              Glitch alert co-branding: included with any placement above, capped at once per week to protect alert trust.
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.dispatchEvent(new CustomEvent("dealsniper:open-newsletter"))}
            >
              Reserve the newsletter slot
            </button>
            <Link href="/deals/computing/40-percent-off" className="btn">
              See brand-safe inventory
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
