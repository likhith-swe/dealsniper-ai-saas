import type { Deal } from "@/lib/types";
import { siteUrl } from "@/lib/env";
import { CATEGORY_TAXONOMY, DISCOUNT_RANGES, PRICE_BRACKETS } from "@/lib/fallback-deals";

/**
 * JSON-LD builders. Product, Offer and AggregateOffer markup let search engines render
 * price and rating rich results for every tracked listing, which is the organic acquisition
 * engine behind the programmatic SEO pages.
 */

export function productSchema(deal: Deal) {
  const url = `${siteUrl()}/deal/${deal.asin}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: deal.title,
    sku: deal.asin,
    gtin: deal.asin,
    brand: { "@type": "Brand", name: deal.brand },
    category: deal.category,
    image: [`${siteUrl()}${deal.imageUrl}`],
    description: `${deal.title} tracked by DealSniper AI. Current price ${(deal.currentPriceMinor / 100).toFixed(0)} ${deal.currency}, ${
      deal.discountPercent
    }% below list price and ${deal.deviationPercent}% below the trailing 90-day average of ${(deal.ninetyDayAvgMinor / 100).toFixed(0)} ${
      deal.currency
    }.`,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: (deal.ratingX10 / 10).toFixed(1),
      reviewCount: deal.ratingCount,
      bestRating: "5",
      worstRating: "1",
    },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: deal.currency,
      price: (deal.currentPriceMinor / 100).toFixed(2),
      priceValidUntil: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      availability: deal.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: deal.marketplace === "amazon_com" ? "Amazon.com" : "Amazon.in" },
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: (deal.currentPriceMinor / 100).toFixed(2),
        priceCurrency: deal.currency,
        referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "C62" },
      },
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Deal Score", value: `${deal.dealScore}/100 (${deal.dealScoreTier})` },
      { "@type": "PropertyValue", name: "Lowest recorded price", value: `${(deal.lowestEverMinor / 100).toFixed(0)} ${deal.currency}` },
      ...(deal.couponCode
        ? [{ "@type": "PropertyValue", name: "Coupon", value: `${deal.couponCode} (+${deal.couponExtraPercent}% at cart)` }]
        : []),
    ],
  };
}

export function aggregateOfferSchema(deals: Deal[], path: string) {
  if (deals.length === 0) return null;
  const prices = deals.map((deal) => deal.currentPriceMinor);
  return {
    "@context": "https://schema.org",
    "@type": "AggregateOffer",
    url: `${siteUrl()}${path}`,
    priceCurrency: "INR",
    lowPrice: (Math.min(...prices) / 100).toFixed(2),
    highPrice: (Math.max(...prices) / 100).toFixed(2),
    offerCount: deals.length,
    offers: deals.slice(0, 30).map((deal) => ({
      "@type": "Offer",
      name: deal.title,
      url: `${siteUrl()}/deal/${deal.asin}`,
      price: (deal.currentPriceMinor / 100).toFixed(2),
      priceCurrency: deal.currency,
      availability: deal.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    })),
  };
}

export function itemListSchema(deals: Deal[], path: string, name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: `${siteUrl()}${path}`,
    numberOfItems: deals.length,
    itemListElement: deals.map((deal, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteUrl()}/deal/${deal.asin}`,
      name: deal.title,
      item: productSchema(deal),
    })),
  };
}

export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: `${siteUrl()}${entry.path}`,
    })),
  };
}

export function faqSchema(entries: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "DealSniper AI",
    url: siteUrl(),
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl()}/?search={search_term_string}#terminal`,
      "query-input": "required name=search_term_string",
    },
  };
}

/** Every programmatic SEO path: 9 categories crossed with 7 discount tiers and 6 price brackets. */
export function programmaticPaths(): { category: string; segment: string }[] {
  const paths: { category: string; segment: string }[] = [];
  for (const category of CATEGORY_TAXONOMY) {
    for (const range of DISCOUNT_RANGES) {
      paths.push({ category: category.slug, segment: range.slug });
    }
    for (const bracket of PRICE_BRACKETS) {
      paths.push({ category: category.slug, segment: bracket.slug });
    }
  }
  return paths;
}

export function structuredDataScript(payload: unknown) {
  return JSON.stringify(payload).replace(/</g, "\\u003c");
}
