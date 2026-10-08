import { ArrowRight, BellRing, Gauge, Mail, ShieldCheck, Tickets } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import DealGrid from "@/components/DealGrid";
import Hero from "@/components/Hero";
import NewsletterCtaButton from "@/components/NewsletterCtaButton";
import RevenueModel from "@/components/RevenueModel";
import { ensureSeeded } from "@/lib/seed";
import { getCategoryStats, getPlatformStats, listDeals } from "@/lib/queries";
import { CATEGORY_TAXONOMY } from "@/lib/fallback-deals";
import { faqSchema, structuredDataScript, websiteSchema } from "@/lib/seo";
import { rapidApiKey } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/current-user";
import { freeDelaySeconds, vipDelaySeconds } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "DealSniper AI — real-time Amazon price drops, coupon glitches and arbitrage radar",
  description:
    "Track 25 verified listings across Amazon India and Amazon US. Deal Score ranks every sample against the trailing 90-day average, stock drain rate and review integrity. VIP Pro receives zero-second Telegram and WhatsApp alerts.",
  alternates: { canonical: "/" },
};

const FAQ_ENTRIES = [
  {
    question: "How is the Deal Score calculated?",
    answer:
      "Deal Score is a 0-100 composite: 40% deviation from the trailing 90-day average price, 25% stock depletion velocity, 20% review integrity weighted by review depth, and 15% coupon stack depth. A listing printing a new 90-day low receives a 12 point bonus, and out-of-stock listings lose 18 points.",
  },
  {
    question: "What is the difference between the free plan and VIP Pro?",
    answer:
      "Free accounts read the feed 15 minutes after a price sample lands and hold three alert triggers with email delivery. VIP Pro removes the publication delay, raises the trigger count to unlimited and delivers matching drops to Telegram chat ids or WhatsApp numbers within the same ingest cycle as the price change.",
  },
  {
    question: "Where do the prices come from?",
    answer:
      "The ingest cycle calls the RapidAPI Real-Time Amazon Data product endpoint with a 30 minute cache window when RAPIDAPI_KEY is configured. Without a key the verified catalog of 25 listings supplies prices and the deterministic market model advances them, so the terminal, alert pipeline and analytics stay populated at all times.",
  },
  {
    question: "How does DealSniper AI earn money?",
    answer:
      "Five channels: marketplace affiliate commission on Claim Deal clicks, VIP Pro subscriptions through Razorpay and Stripe, a sponsored Daily 10 Glitch Drops newsletter, native inline ad containers sold at USD 5-15 CPM, and paid featured placements for D2C brands. Every sponsored listing is labelled and keeps its real Deal Score.",
  },
  {
    question: "Do you store personal data?",
    answer:
      "Accounts store an email address, the hashed session secret and the alert destinations you configure. Affiliate click analytics store a salted SHA-256 hash of the client IP, never the raw address, and the newsletter list stores the email plus the optional category interests you select.",
  },
];

/**
 * Landing page assembled as a terminal: coverage metrics, live scored feed with filters,
 * price-history and alert modals, the monetisation specification and the organic SEO copy.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawSearch = params.search;
  const searchQuery = Array.isArray(rawSearch) ? rawSearch[0] ?? "" : rawSearch ?? "";

  await ensureSeeded();
  const user = await getCurrentUser();
  const isPro = user?.isPro === true;

  const [feed, categories, stats] = await Promise.all([
    listDeals({ limit: 48, search: searchQuery, withholdRecentMs: (isPro ? vipDelaySeconds() : freeDelaySeconds()) * 1000 }),
    getCategoryStats(),
    getPlatformStats(),
  ]);

  const topDeal = feed.deals[0] ?? null;
  const delaySeconds = isPro ? vipDelaySeconds() : freeDelaySeconds();
  const faqJsonLd = faqSchema(FAQ_ENTRIES);

  return (
    <div className="pt-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataScript(websiteSchema()) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataScript(faqJsonLd) }} />

      <Hero stats={stats} topDeal={topDeal} initialQuery={searchQuery} />

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Feature
          icon={Gauge}
          title="Deal Score per sample"
          body="Four weighted signals produce a 0-100 grade, so a 31% cut on a stale listing ranks below a 44% cut with stock draining at 9% an hour."
        />
        <Feature
          icon={ShieldCheck}
          title="90-day history on every listing"
          body="Each card opens a sample chart with the trailing average, the lowest recorded price and the volatility band behind the current cut."
        />
        <Feature
          icon={BellRing}
          title="Keyword triggers"
          body="Set a target price once; the ingest cycle matches it, suppresses duplicates for six hours and delivers to Telegram, WhatsApp or email."
        />
        <Feature
          icon={Tickets}
          title="Arbitrage view"
          body="Reseller margin is modelled from the live price, the coupon stack and the category commission rate before you commit capital."
        />
      </section>

      <div className="mt-8">
        <DealGrid
          initialDeals={feed.deals}
          initialTotal={feed.total}
          categories={categories}
          delaySeconds={delaySeconds}
          dataSource={rapidApiKey() ? "rapidapi + verified catalog" : "verified catalog"}
          searchQuery={searchQuery}
        />
      </div>

      <RevenueModel />

      <section id="coverage" className="mt-14 scroll-mt-28">
        <header className="max-w-3xl">
          <span className="chip">Programmatic coverage</span>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">Category and discount pages build themselves from the ingest pipeline</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Each category is crossed with seven discount tiers and six price brackets, and every page renders live listings with Product,
            Offer and AggregateOffer markup. Internal links below are the crawl paths search engines follow.
          </p>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORY_TAXONOMY.map((category) => {
            const stat = categories.find((entry) => entry.slug === category.slug);
            return (
              <article key={category.slug} className="panel p-4">
                <h3 className="text-[14px] font-semibold">{category.label}</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{category.headline}</p>
                <p className="mono mt-2 text-[11px] text-faint">
                  {stat?.dealCount ?? 0} tracked · avg {stat?.avgDiscountPercent ?? 0}% off · top score {stat?.topDealScore ?? 0}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <Link href={`/deals/${category.slug}/40-percent-off`} className="chip chip-deal">
                    40% off
                  </Link>
                  <Link href={`/deals/${category.slug}/60-percent-off`} className="chip">
                    60% off
                  </Link>
                  <Link href={`/deals/${category.slug}/under-10000`} className="chip">
                    under ₹10,000
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-14 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="panel p-5">
          <span className="chip chip-deal">
            <Mail className="h-3 w-3" /> newsletter
          </span>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">Daily 10 Glitch Drops, 07:30 IST</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Ten listings chosen for price error depth, each with the sample chart and the coupon stack behind it, sent before the public
            terminal publishes the delay window. One sponsor per send.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <NewsletterCtaButton label="Get the ten" />
            <Link href="/#model" className="btn">
              Sponsorship rates <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="panel p-5">
          <span className="chip">FAQ</span>
          <dl className="mt-3 divide-y divide-white/[0.08]">
            {FAQ_ENTRIES.map((entry) => (
              <div key={entry.question} className="py-3">
                <dt className="text-[13px] font-medium text-ink">{entry.question}</dt>
                <dd className="mt-1 text-[12px] leading-relaxed text-muted">{entry.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: typeof Gauge; title: string; body: string }) {
  return (
    <article className="panel p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04]">
        <Icon className="h-4 w-4 text-deal" />
      </span>
      <h3 className="mt-3 text-[14px] font-semibold">{title}</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{body}</p>
    </article>
  );
}
