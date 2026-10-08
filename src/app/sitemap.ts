import type { MetadataRoute } from "next";
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { deals } from "@/db/schema";
import { siteUrl } from "@/lib/env";
import { programmaticPaths } from "@/lib/seo";

export const dynamic = "force-dynamic";

/**
 * Sitemap covering the static surfaces, every programmatic category/discount page and every
 * tracked listing detail page. Change frequency reflects the ingest cadence rather than
 * speculative emphasis.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/dashboard`, lastModified: now, changeFrequency: "daily", priority: 0.2 },
    { url: `${base}/alerts`, lastModified: now, changeFrequency: "daily", priority: 0.2 },
  ];

  const programmatic: MetadataRoute.Sitemap = programmaticPaths().map((entry) => ({
    url: `${base}/deals/${entry.category}/${entry.segment}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: entry.segment.includes("percent-off") ? 0.8 : 0.65,
  }));

  let listingEntries: MetadataRoute.Sitemap = [];
  try {
    const rows = await db
      .select({ asin: deals.asin, lastCheckedAt: deals.lastCheckedAt })
      .from(deals)
      .orderBy(desc(deals.dealScore))
      .limit(500);

    listingEntries = rows.map((row) => ({
      url: `${base}/deal/${row.asin}`,
      lastModified: row.lastCheckedAt,
      changeFrequency: "hourly",
      priority: 0.7,
    }));
  } catch (error) {
    console.warn("[sitemap] listing query failed, serving static and programmatic entries only", { error: String(error) });
  }

  return [...staticEntries, ...programmatic, ...listingEntries];
}
