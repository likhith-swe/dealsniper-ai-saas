import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import DealGrid from "@/components/DealGrid";
import NewsletterCtaButton from "@/components/NewsletterCtaButton";
import { CATEGORY_TAXONOMY, DISCOUNT_RANGES, PRICE_BRACKETS, categoryBySlug, resolveSegment } from "@/lib/fallback-deals";
import { getCategoryStats, listDeals } from "@/lib/queries";
import { ensureSeeded } from "@/lib/seed";
import { freeDelaySeconds, siteUrl } from "@/lib/env";
import { aggregateOfferSchema, breadcrumbSchema, itemListSchema, structuredDataScript } from "@/lib/seo";

export const revalidate = 900;

interface PageParams {
  params: Promise<{ category: string; discount: string }>;
}

/**
 * Programmatic SEO surface: /deals/[category]/[discount]
 *
 * The second segment resolves either to a discount tier (40-percent-off) or a price
 * bracket (under-10000). Pages are generated at build time, revalidated every 15 minutes and
 * carry Product, Offer, AggregateOffer, ItemList and BreadcrumbList markup.
 */
export async function generateStaticParams(): Promise<{ category: string; discount: string }[]> {
  const paths: { category: string; discount: string }[] = [];
  for (const category of CATEGORY_TAXONOMY) {
    for (const range of DISCOUNT_RANGES) paths.push({ category: category.slug, discount: range.slug });
    for (const bracket of PRICE_BRACKETS) paths.push({ category: category.slug, discount: bracket.slug });
  }
  return paths;
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { category: categorySlug, discount: segmentSlug } = await params;
  const category = categoryBySlug(categorySlug);
  const segment = resolveSegment(segmentSlug);
  if (!category || !segment) {
    return { title: "Deals not found", robots: { index: false, follow: false } };
  }

  const path = `/deals/${category.slug}/${segment.slug}`;
  const title = `${category.label} deals · ${segment.label}`;
  const description = `${category.headline}. Filtered to ${segment.label.toLowerCase()}, scored against each listing's trailing 90-day average price with stock drain and review integrity factored in.`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title: `${title} | DealSniper AI`,
      description,
      url: `${siteUrl()}${path}`,
      images: [
        {
          url: `/api/og?title=${encodeURIComponent(`${category.label} · ${segment.label}`)}&price=${encodeURIComponent(segment.label)}&cut=${encodeURIComponent("DealSniper AI terminal")}`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default async function CategoryDiscountPage({ params }: PageParams) {
  const { category: categorySlug, discount: segmentSlug } = await params;
  const category = categoryBySlug(categorySlug);
  const segment = resolveSegment(segmentSlug);
  if (!category || !segment) notFound();

  await ensureSeeded();

  // These pages stay static so the crawler-facing HTML is served from the CDN edge and
  // revalidated every 15 minutes. The client feed component re-reads /api/deals on mount,
  // which is where a VIP Pro session receives the zero-delay sample set.
  const delaySeconds = freeDelaySeconds();
  const path = `/deals/${category.slug}/${segment.slug}`;

  const [feed, categories] = await Promise.all([
    listDeals({
      category: category.slug,
      minDiscount: segment.minDiscountPercent,
      minPriceMinor: segment.minPriceMinor,
      maxPriceMinor: segment.maxPriceMinor ?? undefined,
      limit: 36,
      withholdRecentMs: delaySeconds * 1000,
    }),
    getCategoryStats(),
  ]);

  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Deals", path: "/#terminal" },
    { name: `${category.label} deals`, path: `/deals/${category.slug}/40-percent-off` },
    { name: segment.label, path },
  ];

  return (
    <div className="pt-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataScript(itemListSchema(feed.deals, path, `${category.label} deals · ${segment.label}`)) }}
      />
      {feed.deals.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredDataScript(aggregateOfferSchema(feed.deals, path)) }}
        />
      ) : null}
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

      <header className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]">
            {category.label} deals: {segment.label}
          </h1>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-muted">
            {category.headline}. This page lists {feed.total} tracked {category.label.toLowerCase()} listing{feed.total === 1 ? "" : "s"} that
            currently clear the {segment.label.toLowerCase()} threshold, ranked by Deal Score. Each card exposes the 90-day sample chart, the
            coupon stack and the stock drain rate behind the score.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/#terminal" className="btn">
              <ArrowLeft className="h-3.5 w-3.5" /> Full terminal
            </Link>
            <NewsletterCtaButton label="Daily 10 Glitch Drops" />
          </div>
        </div>

        <aside className="panel p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Refine the segment</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {DISCOUNT_RANGES.map((range) => (
              <Link
                key={range.slug}
                href={`/deals/${category.slug}/${range.slug}`}
                className={`chip ${range.slug === segment.slug && segment.kind === "discount" ? "chip-deal" : ""}`}
              >
                {range.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRICE_BRACKETS.map((bracket) => (
              <Link
                key={bracket.slug}
                href={`/deals/${category.slug}/${bracket.slug}`}
                className={`chip ${bracket.slug === segment.slug ? "chip-deal" : ""}`}
              >
                {bracket.label}
              </Link>
            ))}
          </div>
          <h2 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Other categories</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORY_TAXONOMY.filter((entry) => entry.slug !== category.slug).map((entry) => (
              <Link key={entry.slug} href={`/deals/${entry.slug}/${segment.slug}`} className="chip">
                {entry.label}
              </Link>
            ))}
          </div>
        </aside>
      </header>

      <div className="mt-8">
        <DealGrid
          initialDeals={feed.deals}
          initialTotal={feed.total}
          categories={categories}
          delaySeconds={delaySeconds}
          dataSource="verified catalog + ingest pipeline"
          lockedCategory={category.slug}
          searchQuery=""
        />
      </div>

      <section className="mt-12 panel p-5">
        <h2 className="text-[15px] font-semibold">How this segment is scored</h2>
        <div className="mt-3 grid gap-4 text-[12px] leading-relaxed text-muted sm:grid-cols-2 lg:grid-cols-4">
          <p>
            <span className="text-ink">Price deviation (40%).</span> The live sample is compared with the trailing 90-day average for the same
            ASIN and marketplace. A new 90-day low adds 12 points.
          </p>
          <p>
            <span className="text-ink">Stock velocity (25%).</span> Inventory drained since the previous sample plus the realised price
            velocity per hour. Fast drain at a low price is the strongest price-error signal.
          </p>
          <p>
            <span className="text-ink">Review integrity (20%).</span> Star rating scaled by review depth, with penalties for thin listings and
            for high-volume listings below 3.5 stars.
          </p>
          <p>
            <span className="text-ink">Coupon stack (15%).</span> A published promo code is worth 62 points before the additional cart
            percentage is added at 4.2 points per percent.
          </p>
        </div>
        <p className="mt-3 text-[11px] text-faint">
          Page revalidates every 15 minutes. Sample series and Deal Score components come from the same ingest cycle that drives the alert
          pipeline.
        </p>
      </section>
    </div>
  );
}
