import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/env";

/** Crawl policy: index the deal surfaces, keep API and account routes out of the index. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/deals/", "/deal/"],
        disallow: ["/api/", "/dashboard", "/alerts", "/login", "/auth/"],
      },
      {
        userAgent: "GPTBot",
        allow: ["/", "/deals/", "/deal/"],
        disallow: ["/api/", "/dashboard", "/alerts"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
