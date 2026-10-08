import Link from "next/link";

/** Not-found surface: keeps the visitor inside the terminal with the highest-intent links. */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center pt-10">
      <div className="panel max-w-lg p-6 text-center">
        <span className="chip chip-alert">404</span>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight">That listing is not tracked</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          The ASIN, category or discount segment does not exist in the catalog. Every tracked listing is reachable from the terminal, and each
          category page lists its discount tiers and price brackets.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/#terminal" className="btn btn-primary">
            Open the terminal
          </Link>
          <Link href="/deals/computing/40-percent-off" className="btn">
            Computing deals at 40% off
          </Link>
          <Link href="/sitemap.xml" className="btn btn-ghost">
            Sitemap
          </Link>
        </div>
      </div>
    </div>
  );
}
