import Link from "next/link";

import { amazonAssociateDisclosure } from "@/lib/affiliate";
import { CATEGORY_TAXONOMY, DISCOUNT_RANGES, PRICE_BRACKETS } from "@/lib/fallback-deals";

/** Footer with the affiliate disclosure required by the Amazon Associates programme. */
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-white/[0.08] bg-[#0a0b11]">
      <div className="mx-auto grid w-full max-w-[1440px] gap-10 px-4 py-12 sm:px-6 lg:grid-cols-4 lg:px-8">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-deal text-[13px] font-bold text-[#04150f]">DS</span>
            <span className="text-[15px] font-semibold tracking-tight">DealSniper AI</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Price-drop, coupon-stack and arbitrage radar for Amazon India, Amazon US and Flipkart. Samples land every 30 minutes;
            Deal Scores recalculate on every sample.
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">{amazonAssociateDisclosure()}</p>
        </div>

        <nav aria-label="Categories">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Categories</h3>
          <ul className="mt-3 grid gap-2 text-[13px] text-muted">
            {CATEGORY_TAXONOMY.slice(0, 7).map((category) => (
              <li key={category.slug}>
                <Link className="transition-colors hover:text-ink" href={`/deals/${category.slug}/40-percent-off`}>
                  {category.label} deals
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Discount ranges">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Discount depth</h3>
          <ul className="mt-3 grid gap-2 text-[13px] text-muted">
            {DISCOUNT_RANGES.slice(2).map((range) => (
              <li key={range.slug}>
                <Link className="transition-colors hover:text-ink" href={`/deals/electronics/${range.slug}`}>
                  {range.label}
                </Link>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Price brackets</h3>
          <ul className="mt-3 grid gap-2 text-[13px] text-muted">
            {PRICE_BRACKETS.slice(1, 4).map((bracket) => (
              <li key={bracket.slug}>
                <Link className="transition-colors hover:text-ink" href={`/deals/audio/${bracket.slug}`}>
                  Audio {bracket.label.toLowerCase()}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Platform</h3>
          <ul className="mt-3 grid gap-2 text-[13px] text-muted">
            <li>
              <Link className="transition-colors hover:text-ink" href="/dashboard">
                Subscriber dashboard
              </Link>
            </li>
            <li>
              <Link className="transition-colors hover:text-ink" href="/alerts">
                Alert triggers
              </Link>
            </li>
            <li>
              <Link className="transition-colors hover:text-ink" href="/#pricing">
                VIP Pro pricing
              </Link>
            </li>
            <li>
              <Link className="transition-colors hover:text-ink" href="/#sponsors">
                Sponsored placements
              </Link>
            </li>
            <li>
              <a className="transition-colors hover:text-ink" href="/api/health" rel="nofollow">
                Platform health
              </a>
            </li>
            <li>
              <a className="transition-colors hover:text-ink" href="/sitemap.xml" rel="nofollow">
                Sitemap
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.06] px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 text-[11px] text-faint sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} DealSniper AI. Prices reflect the last recorded sample and can change at the marketplace.</span>
          <span className="font-mono">
            Ingest: 30 minute cycle · Deal Score v1.4 · Telegram and WhatsApp webhook delivery
          </span>
        </div>
      </div>
    </footer>
  );
}
