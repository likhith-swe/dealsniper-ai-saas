import { withCache } from "@/lib/cache";
import { rapidApiKey } from "@/lib/env";
import type { Currency, RapidApiProduct, RapidApiResult } from "@/lib/types";

const PRODUCT_HOST = "real-time-amazon-data.p.rapidapi.com";
const BARCODE_HOST = "barcode-lookup.p.rapidapi.com";
const CACHE_TTL_SECONDS = 1800; // 30 minutes
const REQUEST_TIMEOUT_MS = 9000;

interface RawAmazonProduct {
  asin?: string;
  product_title?: string;
  product_price?: string | number;
  product_original_price?: string | number | null;
  product_minimum_offer_price?: string | number | null;
  currency?: string;
  product_star_rating?: string | number | null;
  product_num_ratings?: number | null;
  product_url?: string;
  product_photo?: string;
  product_availability?: string | null;
  is_best_seller?: boolean;
  sales_volume?: string | null;
  product_byline?: string | null;
}

interface RawAmazonResponse {
  status?: string;
  data?: RawAmazonProduct | RawAmazonProduct[];
  message?: string;
}

/**
 * Parses marketplace price strings ("₹19,989.00", "$179.00", "19989") into integer
 * minor units. Returns null when the field is absent or unparseable so callers can
 * fall back to the last verified catalog value instead of writing a zero.
 */
export function parsePriceToMinor(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[^0-9.]/g, "");
  if (cleaned.length === 0) return null;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function normalizeCurrency(raw: string | undefined, marketplace: "amazon_in" | "amazon_com"): Currency {
  if (raw && raw.toUpperCase().includes("USD")) return "USD";
  if (raw && raw.toUpperCase().includes("INR")) return "INR";
  return marketplace === "amazon_com" ? "USD" : "INR";
}

function deriveStockLevel(availability: string | null | undefined, salesVolume: string | null | undefined): number {
  const availabilityText = (availability ?? "").toLowerCase();
  if (availabilityText.includes("out of stock") || availabilityText.includes("unavailable")) return 0;
  const volumeText = (salesVolume ?? "").replace(/[^0-9]/g, "");
  const volume = volumeText.length > 0 ? Number.parseInt(volumeText, 10) : 0;
  if (volume >= 10000) return 6;
  if (volume >= 5000) return 14;
  if (volume >= 1000) return 28;
  if (volume >= 200) return 45;
  return 68;
}

function normalizeProduct(
  raw: RawAmazonProduct,
  marketplace: "amazon_in" | "amazon_com",
): RapidApiProduct | null {
  if (!raw.asin || !raw.product_title) return null;

  const currency = normalizeCurrency(raw.currency, marketplace);
  const currentPriceMinor =
    parsePriceToMinor(raw.product_price) ?? parsePriceToMinor(raw.product_minimum_offer_price);
  if (currentPriceMinor === null) return null;

  const originalPriceMinor = parsePriceToMinor(raw.product_original_price) ?? currentPriceMinor;
  const discountPercent =
    originalPriceMinor > currentPriceMinor
      ? Math.max(0, Math.round(((originalPriceMinor - currentPriceMinor) / originalPriceMinor) * 100))
      : 0;

  const ratingValue = raw.product_star_rating === null || raw.product_star_rating === undefined
    ? 0
    : Number.parseFloat(String(raw.product_star_rating).replace(/[^0-9.]/g, ""));
  const ratingX10 = Number.isFinite(ratingValue) ? Math.round(ratingValue * 10) : 0;
  const stockLevel = deriveStockLevel(raw.product_availability, raw.sales_volume);

  return {
    asin: raw.asin,
    title: raw.product_title.slice(0, 320),
    brand: (raw.product_byline ?? raw.product_title.split(" ")[0] ?? "Generic").replace(/^by\s+/i, "").slice(0, 80),
    category: "electronics",
    imageUrl: raw.product_photo ?? "/images/deal-audio.jpg",
    currency,
    originalPriceMinor,
    currentPriceMinor,
    discountPercent,
    couponCode: null,
    ratingX10: ratingX10 > 0 ? ratingX10 : 40,
    ratingCount: raw.product_num_ratings ?? 0,
    inStock: stockLevel > 0,
    stockLevel,
    source: "rapidapi",
    fetchedAt: new Date().toISOString(),
  };
}

async function callRapidApi<T>(host: string, path: string, revalidateTag: string): Promise<RapidApiResult<T>> {
  const key = rapidApiKey();
  if (!key) {
    return {
      ok: false,
      reason: "api_key_missing",
      detail: "RAPIDAPI_KEY is not configured; the verified catalog is serving this request.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`https://${host}${path}`, {
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": host,
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
      next: { revalidate: CACHE_TTL_SECONDS, tags: [revalidateTag] },
    });

    if (response.status === 404) {
      return { ok: false, reason: "not_found", detail: `${host}${path} returned 404` };
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        reason: "upstream_error",
        detail: `${host}${path} responded ${response.status}: ${text.slice(0, 200)}`,
      };
    }

    const payload = (await response.json()) as T;
    return { ok: true, data: payload, cache: "miss" };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      reason: aborted ? "timeout" : "upstream_error",
      detail: `${host}${path} failed: ${String(error)}`,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Product detail lookup by ASIN with a 30 minute cache window. The cache key includes
 * the marketplace because the same ASIN can be listed at different prices per storefront.
 */
export async function fetchProductByAsin(
  asin: string,
  marketplace: "amazon_in" | "amazon_com" = "amazon_in",
): Promise<RapidApiResult<RapidApiProduct>> {
  const normalizedAsin = asin.trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(normalizedAsin)) {
    return { ok: false, reason: "not_found", detail: `"${asin}" is not a 10-character ASIN` };
  }

  const country = marketplace === "amazon_com" ? "US" : "IN";
  const cacheKey = `rapidapi:product:${marketplace}:${normalizedAsin}`;

  const result = await withCache(cacheKey, CACHE_TTL_SECONDS, async () => {
    const upstream = await callRapidApi<RawAmazonResponse>(
      PRODUCT_HOST,
      `/product-details?asin=${encodeURIComponent(normalizedAsin)}&country=${country}`,
      `amazon-product-${normalizedAsin}`,
    );
    if (!upstream.ok) return upstream;
    const raw = Array.isArray(upstream.data.data) ? upstream.data.data[0] : upstream.data.data;
    if (!raw) {
      return { ok: false, reason: "not_found", detail: `ASIN ${normalizedAsin} returned no product payload` } as RapidApiResult<RapidApiProduct>;
    }
    const normalized = normalizeProduct(raw, marketplace);
    if (!normalized) {
      return { ok: false, reason: "not_found", detail: `ASIN ${normalizedAsin} payload could not be normalized` } as RapidApiResult<RapidApiProduct>;
    }
    return { ok: true, data: normalized, cache: "miss" } as RapidApiResult<RapidApiProduct>;
  });

  return result.value;
}

export interface RapidApiSearchOptions {
  query: string;
  marketplace?: "amazon_in" | "amazon_com";
  minPriceMinor?: number;
  maxPriceMinor?: number;
  minDiscountPercent?: number;
  limit?: number;
}

/**
 * Keyword search with server-side filtering. The upstream endpoint returns paginated
 * results; filtering happens locally because the upstream does not accept discount or
 * price-range parameters. Requests with no key return `api_key_missing` so the caller
 * can serve the verified catalog.
 */
export async function fetchProductSearch(
  options: RapidApiSearchOptions,
): Promise<RapidApiResult<RapidApiProduct[]>> {
  const query = options.query.trim().slice(0, 120);
  if (query.length < 2) {
    return { ok: false, reason: "not_found", detail: "query must be at least 2 characters" };
  }

  const marketplace = options.marketplace ?? "amazon_in";
  const country = marketplace === "amazon_com" ? "US" : "IN";
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const cacheKey = `rapidapi:search:${marketplace}:${query.toLowerCase()}:${options.minPriceMinor ?? 0}:${options.maxPriceMinor ?? 0}:${options.minDiscountPercent ?? 0}`;

  const result = await withCache(cacheKey, CACHE_TTL_SECONDS, async () => {
    const upstream = await callRapidApi<RawAmazonResponse>(
      PRODUCT_HOST,
      `/search?query=${encodeURIComponent(query)}&country=${country}&page=1`,
      `amazon-search-${query.slice(0, 24)}`,
    );
    if (!upstream.ok) return upstream;

    const rows = Array.isArray(upstream.data.data) ? upstream.data.data : [];
    const normalized = rows
      .map((row) => normalizeProduct(row, marketplace))
      .filter((row): row is RapidApiProduct => row !== null)
      .filter((row) => (options.minDiscountPercent ? row.discountPercent >= options.minDiscountPercent : true))
      .filter((row) => (options.minPriceMinor ? row.currentPriceMinor >= options.minPriceMinor : true))
      .filter((row) => (options.maxPriceMinor ? row.currentPriceMinor <= options.maxPriceMinor : true))
      .slice(0, limit);

    return { ok: true, data: normalized, cache: "miss" } as RapidApiResult<RapidApiProduct[]>;
  });

  return result.value;
}

export interface BarcodeRecord {
  gtin: string;
  title: string;
  brand: string;
  category: string;
  imageUrl: string | null;
  marketplaceAsins: { marketplace: string; asin: string; priceMinor: number | null }[];
}

interface RawBarcodeProduct {
  title?: string;
  brand?: string;
  category?: string;
  images?: string[];
  stores?: { name?: string; code?: string; price?: string | number | null }[];
}

/**
 * Barcode (EAN/UPC/GTIN) lookup used by resellers scanning clearance bins. Results map
 * barcode to marketplace identifiers so the arbitrage calculator can price the resale leg.
 */
export async function lookupBarcode(
  gtin: string,
): Promise<RapidApiResult<BarcodeRecord>> {
  const normalized = gtin.replace(/[^0-9]/g, "");
  if (normalized.length < 8 || normalized.length > 14) {
    return { ok: false, reason: "not_found", detail: `"${gtin}" is not a valid GTIN length (8-14 digits)` };
  }

  const cacheKey = `rapidapi:barcode:${normalized}`;
  const result = await withCache(cacheKey, CACHE_TTL_SECONDS, async () => {
    const upstream = await callRapidApi<{ products?: RawBarcodeProduct[] }>(
      BARCODE_HOST,
      `/products?gtin=${normalized}`,
      `barcode-${normalized}`,
    );
    if (!upstream.ok) return upstream;

    const product = upstream.data.products?.[0];
    if (!product) {
      return { ok: false, reason: "not_found", detail: `GTIN ${normalized} is not indexed` } as RapidApiResult<BarcodeRecord>;
    }

    const record: BarcodeRecord = {
      gtin: normalized,
      title: (product.title ?? "Unknown product").slice(0, 240),
      brand: (product.brand ?? "Unknown brand").slice(0, 80),
      category: (product.category ?? "general").slice(0, 60),
      imageUrl: product.images?.[0] ?? null,
      marketplaceAsins: (product.stores ?? [])
        .filter((store) => Boolean(store.code))
        .map((store) => ({
          marketplace: (store.name ?? "unknown").toLowerCase().replace(/\s+/g, "_"),
          asin: String(store.code),
          priceMinor: parsePriceToMinor(store.price),
        })),
    };
    return { ok: true, data: record, cache: "miss" } as RapidApiResult<BarcodeRecord>;
  });

  return result.value;
}

/** Ingest health surface used by /api/health and the operations dashboard. */
export function rapidApiStatus(): { configured: boolean; host: string; cacheTtlSeconds: number } {
  return {
    configured: rapidApiKey() !== null,
    host: PRODUCT_HOST,
    cacheTtlSeconds: CACHE_TTL_SECONDS,
  };
}
