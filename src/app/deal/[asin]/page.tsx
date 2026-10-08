import { ChevronRight, ExternalLink, Star, TrendingDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import DealDetailActions from "@/components/DealDetailActions";
import NewsletterCtaButton from "@/components/NewsletterCtaButton";
import PriceChart from "@/components/PriceChart";
import { commissionRateFor } from "@/lib/deal-score";
import { formatMoney, formatNumber, formatRelativeTime } from "@/lib/format";
import { getDealByAsin, listDeals } from "@/lib/queries";
import { ensureSeeded } from "@/lib/seed";
import { siteUrl } from "@/lib/env";
import { breadcrumbSchema, productSchema, structuredDataScript } from "@/lib/seo";
import type { Deal } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ asin: string }>;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { asin } = await params;
  const deal = await getDealByAsin(asin);
  if (!deal) {
    return { title: "Listing not tracked", robots: { index: false, follow: false } };
  }

  const price = formatMoney(deal.currentPriceMinor, deal.currency);
  const title = `${deal.title} at ${price} (${deal.discountPercent}% off)`;
  const description = `DealSniper AI tracks ${deal.asin}: list price ${formatMoney(deal.originalPriceMinor, deal.currency)}, trailing 90-day average ${formatMoney(deal.ninetyDayAvgMinor, deal.currency)}, live ${price}. Deal Score ${deal.dealScore}/100 ${deal.dealScoreTier}.`;

  return {
    title,
    description,
    alternates: { canonical: `/deal/${deal.asin}` },
    openGraph: {
      title,
      description,
      url: `${siteUrl()}/deal/${deal.asin}`,
      images: [{ url: `/api/og?asin=${deal.asin}`, width: 1200, height: 630 }],
    },
  };
}

/**
 * Listing detail: 90-day sample chart, Deal Score components, coupon stack, affiliate claim
 * action, resale margin model and Product/Offer structured data.
 */
export default async function DealPage({ params }: PageParams) {
  const { asin } = await params;
  await ensureSeeded();
  const deal = await getDealByAsin(asin);
  if (!deal) notFound();

  const related = await listDeals({ category: deal.category, limit: 4, sort: "score" });
  const siblings = related.deals.filter((entry) => entry.asin !== deal.asin).slice(0, 3);

  const commissionRate = commissionRateFor(deal.category);
  const affiliateValue = Math.round(deal.effectivePriceMinor * commissionRate);
  const resaleGross = Math.round(deal.originalPriceMinor * 0.82);
  const resaleFees = Math.round(resaleGross * 0.12);
  const resaleMargin = resaleGross - resaleFees - deal.effectivePriceMinor;

  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: `${deal.category} deals`, path: `/deals/${deal.category}/40-percent-off` },
    { name: deal.title.slice(0, 48), path: `/deal/${deal.asin}` },
  ];

  return (
    <div className="pt-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataScript(productSchema(deal)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataScript(breadcrumbSchema(breadcrumbs)) }} />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[12px] text-faint">
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.path} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight className="h-3 w-3" /> : null}
            <Link href={crumb.path} className="transition-colors hover:text-ink">
              {crumb.name}
            </Link>
          </span>
        ))}
      </nav>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="panel overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={deal.imageUrl} alt={deal.title} width={1024} height={420} className="h-[280px] w-full object-cover" />
            <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip chip-deal">-{deal.discountPercent}%</span>
                {deal.isGlitch ? <span className="chip chip-glitch">price error candidate</span> : null}
                <span className="chip">{deal.category}</span>
                <span className="chip">{deal.subcategory}</span>
                <span className="mono text-[11px] text-faint">{deal.asin}</span>
              </div>
              <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-tight">{deal.title}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 text-deal" /> {(deal.ratingX10 / 10).toFixed(1)} from {formatNumber(deal.ratingCount)} reviews
                </span>
                <span>Brand: {deal.brand}</span>
                <span>Sample recorded {formatRelativeTime(deal.lastCheckedAt)}</span>
                <span>{deal.marketplace === "amazon_com" ? "Amazon.com" : "Amazon.in"}</span>
              </p>

              <div className="mt-4 flex flex-wrap items-end gap-4">
                <div>
                  <p className="mono text-[32px] font-semibold leading-none text-deal">{formatMoney(deal.currentPriceMinor, deal.currency)}</p>
                  <p className="mono mt-1 text-[13px] text-faint line-through">{formatMoney(deal.originalPriceMinor, deal.currency)} list</p>
                </div>
                <div className="panel-2 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Deal Score</p>
                  <p className="mono mt-1 text-[18px] font-semibold text-deal">
                    {deal.dealScore}/100 <span className="text-[11px] text-muted">{deal.dealScoreTier}</span>
                  </p>
                </div>
                <div className="panel-2 px-3 py-2">
                  <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                    <TrendingDown className="h-3 w-3" /> vs 90-day average
                  </p>
                  <p className="mono mt-1 text-[18px] font-semibold text-deal">-{deal.deviationPercent}%</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={`${deal.claimUrl}&campaign=detail_page&market=${deal.marketplace}`}
                  target="_blank"
                  rel="nofollow sponsored noopener"
                  className="btn btn-primary"
                >
                  Claim at {formatMoney(deal.effectivePriceMinor, deal.currency)} <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <DealDetailActions deal={deal} />
              </div>
              <p className="mt-3 text-[11px] text-faint">
                Affiliate link. The price is confirmed at checkout; marketplace prices can change between samples. Estimated commission on this
                basket at the {deal.category} rate of {(commissionRate * 100).toFixed(1)}%: {formatMoney(affiliateValue, deal.currency)}.
              </p>
            </div>
          </div>

          <section className="panel mt-5 p-5">
            <h2 className="text-[15px] font-semibold">Recorded price history</h2>
            <p className="mt-1 text-[12px] text-muted">
              {deal.priceHistory?.length ?? 0} samples on record. Toggle the window to inspect short-term movement against the trailing average.
            </p>
            <div className="mt-4">
              <PriceChart
                points={deal.priceHistory ?? []}
                currency={deal.currency}
                originalPriceMinor={deal.originalPriceMinor}
                currentPriceMinor={deal.currentPriceMinor}
                height={260}
              />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel p-5">
            <h2 className="text-[15px] font-semibold">Score composition</h2>
            <ul className="mt-3 space-y-3 text-[12px]">
              <ScoreRow label="Price deviation (40%)" value={deal.dealScoreParts.priceDeviation} note={`${deal.deviationPercent}% below the 90-day average`} />
              <ScoreRow label="Stock velocity (25%)" value={deal.dealScoreParts.stockVelocity} note={`${deal.stockLevel}% inventory remaining`} />
              <ScoreRow label="Review integrity (20%)" value={deal.dealScoreParts.reviewIntegrity} note={`${(deal.ratingX10 / 10).toFixed(1)} stars across ${formatNumber(deal.ratingCount)} reviews`} />
              <ScoreRow
                label="Coupon stack (15%)"
                value={deal.dealScoreParts.couponStack}
                note={deal.couponCode ? `${deal.couponCode} adds ${deal.couponExtraPercent}% at cart` : "no promo code published"}
              />
            </ul>
          </section>

          <section className="panel p-5">
            <h2 className="text-[15px] font-semibold">Resale margin model</h2>
            <dl className="mt-3 space-y-2 text-[12px]">
              <Row label="Buy price after coupon" value={formatMoney(deal.effectivePriceMinor, deal.currency)} tone="deal" />
              <Row label="Assumed resale at 82% of list" value={formatMoney(resaleGross, deal.currency)} />
              <Row label="Marketplace and payment fees (12%)" value={`- ${formatMoney(resaleFees, deal.currency)}`} />
              <Row label="Gross margin per unit" value={formatMoney(resaleMargin, deal.currency)} tone={resaleMargin > 0 ? "deal" : "alert"} />
              <Row label="Units to clear ₹25,000 target" value={resaleMargin > 0 ? String(Math.ceil(2_500_000 / resaleMargin)) : "not viable"} />
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-faint">
              The model assumes an 82% resale realisation and a 12% fee load. Adjust before committing inventory; fee schedules vary by category
              and seller tier.
            </p>
          </section>

          <section className="panel p-5">
            <h2 className="text-[15px] font-semibold">Coupon and stock</h2>
            <dl className="mt-3 space-y-2 text-[12px]">
              <Row label="Promo code" value={deal.couponCode ?? "none"} />
              <Row label="Extra cart discount" value={deal.couponExtraPercent > 0 ? `${deal.couponExtraPercent}%` : "0%"} />
              <Row label="Availability" value={deal.inStock ? "in stock" : "out of stock"} tone={deal.inStock ? "deal" : "alert"} />
              <Row label="Price velocity" value={`${formatMoney(Math.abs(deal.priceVelocityPerHourMinor), deal.currency)}/hr`} />
              <Row label="Lowest recorded" value={formatMoney(deal.lowestEverMinor, deal.currency)} />
            </dl>
            <div className="mt-4">
              <NewsletterCtaButton label="Get this in the 07:30 digest" />
            </div>
          </section>
        </aside>
      </div>

      {siblings.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[15px] font-semibold">Other {deal.category} listings with high scores</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {siblings.map((entry) => (
              <RelatedCard key={entry.id} deal={entry} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RelatedCard({ deal }: { deal: Deal }) {
  return (
    <div className="panel flex flex-col gap-2 p-4">
      <Link href={`/deal/${deal.asin}`} className="text-[13px] font-medium leading-snug hover:text-deal">
        {deal.title}
      </Link>
      <div className="flex items-center justify-between">
        <span className="mono text-[14px] font-semibold text-deal">{formatMoney(deal.currentPriceMinor, deal.currency)}</span>
        <span className="chip chip-deal">-{deal.discountPercent}%</span>
      </div>
      <p className="mono text-[11px] text-faint">
        score {deal.dealScore} · {deal.deviationPercent}% below average
      </p>
    </div>
  );
}

function ScoreRow({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted">{label}</span>
        <span className="mono text-ink">{value.toFixed(0)}</span>
      </div>
      <div className="score-track mt-1.5">
        <div className="score-fill" style={{ width: `${Math.min(100, Math.max(2, value))}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-faint">{note}</p>
    </li>
  );
}

function Row({ label, value, tone = "ink" }: { label: string; value: string; tone?: "ink" | "deal" | "alert" }) {
  const toneClass = tone === "deal" ? "text-deal" : tone === "alert" ? "text-alert" : "text-ink";
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`mono font-semibold ${toneClass}`}>{value}</dd>
    </div>
  );
}
