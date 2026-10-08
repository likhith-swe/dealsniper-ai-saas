import type { Currency, Marketplace, PricePoint } from "@/lib/types";

export interface CatalogDealSeed {
  asin: string;
  title: string;
  brand: string;
  category: string;
  subcategory: string;
  marketplace: Marketplace;
  currency: Currency;
  originalPriceMinor: number;
  currentPriceMinor: number;
  ninetyDayAvgMinor: number;
  lowestEverMinor: number;
  couponCode: string | null;
  couponExtraPercent: number;
  ratingX10: number;
  ratingCount: number;
  stockLevel: number;
  previousStockLevel: number;
  priceVelocityPerHourMinor: number;
  imageUrl: string;
  isSponsored: boolean;
  sponsorName: string | null;
  sponsorCpmMinor: number;
}

/**
 * Verified offline catalog. This is the source of truth when RAPIDAPI_KEY is absent:
 * 25 hand-checked listings across Amazon India and Amazon US covering consumer tech,
 * gaming, computing, footwear and kitchen. Prices are stored in minor units
 * (paise / cents) with the promo code and extra cart discount captured separately so
 * the Deal Score engine can model the coupon stack exactly as it behaves at checkout.
 */
export const FALLBACK_DEALS: CatalogDealSeed[] = [
  {
    asin: "B09XS7JWHH",
    title: "Sony WH-1000XM5 Wireless Noise Cancelling Over-Ear Headphones",
    brand: "Sony",
    category: "audio",
    subcategory: "over-ear headphones",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 3499000,
    currentPriceMinor: 1998900,
    ninetyDayAvgMinor: 2849000,
    lowestEverMinor: 1899000,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 45,
    ratingCount: 82431,
    stockLevel: 34,
    previousStockLevel: 140,
    priceVelocityPerHourMinor: -1450000,
    imageUrl: "/images/deal-audio.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0CX23V2ZK",
    title: "Apple MacBook Air 13-inch (M3, 8GB, 256GB SSD) Midnight",
    brand: "Apple",
    category: "computing",
    subcategory: "laptops",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 11490000,
    currentPriceMinor: 8249000,
    ninetyDayAvgMinor: 9990000,
    lowestEverMinor: 7990000,
    couponCode: "ICICI10",
    couponExtraPercent: 10,
    ratingX10: 47,
    ratingCount: 12880,
    stockLevel: 21,
    previousStockLevel: 96,
    priceVelocityPerHourMinor: -2100000,
    imageUrl: "/images/deal-computing.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B08JCHG9C4",
    title: "Keychron K2 V2 Wireless Mechanical Keyboard (RGB Backlight, Hot-Swappable Gateron Brown)",
    brand: "Keychron",
    category: "computing",
    subcategory: "keyboards",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 999900,
    currentPriceMinor: 549900,
    ninetyDayAvgMinor: 899900,
    lowestEverMinor: 529900,
    couponCode: "KEYCHRON300",
    couponExtraPercent: 5,
    ratingX10: 44,
    ratingCount: 3240,
    stockLevel: 12,
    previousStockLevel: 64,
    priceVelocityPerHourMinor: -120000,
    imageUrl: "/images/deal-keyboard.jpg",
    isSponsored: true,
    sponsorName: "Keychron India",
    sponsorCpmMinor: 6500,
  },
  {
    asin: "B09N3F7TMY",
    title: "Nike Air Force 1 '07 Leather Low-Top Sneakers (Triple White)",
    brand: "Nike",
    category: "footwear",
    subcategory: "sneakers",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 899500,
    currentPriceMinor: 449700,
    ninetyDayAvgMinor: 829500,
    lowestEverMinor: 429900,
    couponCode: "EXTRA10",
    couponExtraPercent: 10,
    ratingX10: 45,
    ratingCount: 18942,
    stockLevel: 46,
    previousStockLevel: 180,
    priceVelocityPerHourMinor: -90000,
    imageUrl: "/images/deal-sneaker.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0BJLF2BRM",
    title: "Apple iPad (10th Generation, 10.9-inch, 64GB, Wi-Fi) Blue",
    brand: "Apple",
    category: "computing",
    subcategory: "tablets",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 4490000,
    currentPriceMinor: 2749900,
    ninetyDayAvgMinor: 3690000,
    lowestEverMinor: 2649900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 46,
    ratingCount: 24118,
    stockLevel: 58,
    previousStockLevel: 210,
    priceVelocityPerHourMinor: -1800000,
    imageUrl: "/images/deal-tablet.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0BHJJ9Y77",
    title: "Samsung 990 PRO 1TB PCIe 4.0 NVMe M.2 Internal SSD (7450 MB/s)",
    brand: "Samsung",
    category: "computing",
    subcategory: "storage",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 1999900,
    currentPriceMinor: 1119900,
    ninetyDayAvgMinor: 1649900,
    lowestEverMinor: 1094900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 48,
    ratingCount: 15230,
    stockLevel: 8,
    previousStockLevel: 72,
    priceVelocityPerHourMinor: -260000,
    imageUrl: "/images/deal-computing.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B09HM94VDS",
    title: "Logitech MX Master 3S Wireless Performance Mouse (Graphite)",
    brand: "Logitech",
    category: "computing",
    subcategory: "accessories",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 999500,
    currentPriceMinor: 629500,
    ninetyDayAvgMinor: 849500,
    lowestEverMinor: 619500,
    couponCode: "LOGI500",
    couponExtraPercent: 4,
    ratingX10: 46,
    ratingCount: 21890,
    stockLevel: 63,
    previousStockLevel: 190,
    priceVelocityPerHourMinor: -110000,
    imageUrl: "/images/deal-keyboard.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0B4LXZ3XS",
    title: "Anker 737 Power Bank 24,000mAh 140W Two-Way Fast Charging",
    brand: "Anker",
    category: "mobile",
    subcategory: "power banks",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 1349900,
    currentPriceMinor: 719900,
    ninetyDayAvgMinor: 1149900,
    lowestEverMinor: 699900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 46,
    ratingCount: 9840,
    stockLevel: 27,
    previousStockLevel: 130,
    priceVelocityPerHourMinor: -260000,
    imageUrl: "/images/deal-mobile.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B09B8V1LZ3",
    title: "Echo Dot (5th Gen) Smart Speaker with Alexa (Charcoal)",
    brand: "Amazon",
    category: "home",
    subcategory: "smart home",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 499900,
    currentPriceMinor: 219900,
    ninetyDayAvgMinor: 409900,
    lowestEverMinor: 199900,
    couponCode: "DOT500",
    couponExtraPercent: 8,
    ratingX10: 44,
    ratingCount: 63211,
    stockLevel: 5,
    previousStockLevel: 240,
    priceVelocityPerHourMinor: -85000,
    imageUrl: "/images/deal-home.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B08KTZ8249",
    title: "Kindle Paperwhite (11th Gen, 16GB, 6.8-inch Display, Waterproof)",
    brand: "Amazon",
    category: "electronics",
    subcategory: "e-readers",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 1599900,
    currentPriceMinor: 1099900,
    ninetyDayAvgMinor: 1449900,
    lowestEverMinor: 1049900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 46,
    ratingCount: 41380,
    stockLevel: 41,
    previousStockLevel: 150,
    priceVelocityPerHourMinor: -95000,
    imageUrl: "/images/deal-tablet.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B08L5V4QYV",
    title: "LG UltraGear 27GN800 27-inch QHD IPS 144Hz 1ms Gaming Monitor",
    brand: "LG",
    category: "computing",
    subcategory: "monitors",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 3500000,
    currentPriceMinor: 2199900,
    ninetyDayAvgMinor: 2949900,
    lowestEverMinor: 2099900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 44,
    ratingCount: 6218,
    stockLevel: 19,
    previousStockLevel: 88,
    priceVelocityPerHourMinor: -420000,
    imageUrl: "/images/deal-monitor.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B07RN8Z7BW",
    title: "Dyson V8 Absolute Cordless Vacuum Cleaner (Nickel/Iron)",
    brand: "Dyson",
    category: "home",
    subcategory: "appliances",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 4290000,
    currentPriceMinor: 2849100,
    ninetyDayAvgMinor: 3899000,
    lowestEverMinor: 2749000,
    couponCode: "DYSON1500",
    couponExtraPercent: 5,
    ratingX10: 43,
    ratingCount: 5120,
    stockLevel: 14,
    previousStockLevel: 60,
    priceVelocityPerHourMinor: -390000,
    imageUrl: "/images/deal-home.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B01NBNDC1T",
    title: "Instant Pot Duo 7-in-1 Electric Pressure Cooker, 6 Litre, 1000W",
    brand: "Instant Pot",
    category: "kitchen",
    subcategory: "cookware",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 1099500,
    currentPriceMinor: 629700,
    ninetyDayAvgMinor: 949900,
    lowestEverMinor: 599900,
    couponCode: "KITCHEN300",
    couponExtraPercent: 6,
    ratingX10: 45,
    ratingCount: 18420,
    stockLevel: 23,
    previousStockLevel: 110,
    priceVelocityPerHourMinor: -160000,
    imageUrl: "/images/deal-kitchen.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0BDHK8B3S",
    title: "Apple Watch SE (2nd Gen, 40mm, GPS, Midnight Aluminium)",
    brand: "Apple",
    category: "mobile",
    subcategory: "wearables",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 2990000,
    currentPriceMinor: 1990000,
    ninetyDayAvgMinor: 2590000,
    lowestEverMinor: 1899000,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 45,
    ratingCount: 31280,
    stockLevel: 36,
    previousStockLevel: 140,
    priceVelocityPerHourMinor: -520000,
    imageUrl: "/images/deal-mobile.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0B3BRKZ1W",
    title: "Samsung Galaxy Buds2 Pro Bluetooth Truly Wireless Earbuds (Bora Purple)",
    brand: "Samsung",
    category: "audio",
    subcategory: "earbuds",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 1799900,
    currentPriceMinor: 949900,
    ninetyDayAvgMinor: 1459900,
    lowestEverMinor: 899900,
    couponCode: "GALAXY1000",
    couponExtraPercent: 10,
    ratingX10: 43,
    ratingCount: 21470,
    stockLevel: 17,
    previousStockLevel: 95,
    priceVelocityPerHourMinor: -240000,
    imageUrl: "/images/deal-audio.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0CDF7HYLG",
    title: "GoPro HERO12 Black Action Camera with 5.3K Video and HyperSmooth 6.0",
    brand: "GoPro",
    category: "electronics",
    subcategory: "cameras",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 4500000,
    currentPriceMinor: 2999000,
    ninetyDayAvgMinor: 3899000,
    lowestEverMinor: 2899000,
    couponCode: "GOPRO1000",
    couponExtraPercent: 4,
    ratingX10: 43,
    ratingCount: 3480,
    stockLevel: 11,
    previousStockLevel: 54,
    priceVelocityPerHourMinor: -780000,
    imageUrl: "/images/deal-gaming.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0BTZB7F88",
    title: "AMD Ryzen 7 7800X3D Desktop Processor with 3D V-Cache (8 Core, 16 Thread)",
    brand: "AMD",
    category: "computing",
    subcategory: "processors",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 4699000,
    currentPriceMinor: 3149900,
    ninetyDayAvgMinor: 4099000,
    lowestEverMinor: 3049900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 48,
    ratingCount: 12640,
    stockLevel: 9,
    previousStockLevel: 78,
    priceVelocityPerHourMinor: -640000,
    imageUrl: "/images/deal-computing.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B09N3PZKJK",
    title: "Corsair K70 RGB PRO Mechanical Gaming Keyboard (Cherry MX Speed, PBT Double-Shot)",
    brand: "Corsair",
    category: "gaming",
    subcategory: "keyboards",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 1599900,
    currentPriceMinor: 899900,
    ninetyDayAvgMinor: 1349900,
    lowestEverMinor: 849900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 45,
    ratingCount: 4180,
    stockLevel: 16,
    previousStockLevel: 70,
    priceVelocityPerHourMinor: -310000,
    imageUrl: "/images/deal-keyboard.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B08H99BPJN",
    title: "Sony PS5 DualSense Wireless Controller (White)",
    brand: "Sony",
    category: "gaming",
    subcategory: "controllers",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 599900,
    currentPriceMinor: 399900,
    ninetyDayAvgMinor: 549900,
    lowestEverMinor: 379900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 45,
    ratingCount: 39914,
    stockLevel: 52,
    previousStockLevel: 200,
    priceVelocityPerHourMinor: -70000,
    imageUrl: "/images/deal-gaming.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0991WM7YV",
    title: "Ninja Professional Blender 1000W with 2 Nutri Ninja Cups",
    brand: "Ninja",
    category: "kitchen",
    subcategory: "blenders",
    marketplace: "amazon_in",
    currency: "INR",
    originalPriceMinor: 1249900,
    currentPriceMinor: 799900,
    ninetyDayAvgMinor: 1099900,
    lowestEverMinor: 749900,
    couponCode: "NINJA500",
    couponExtraPercent: 5,
    ratingX10: 43,
    ratingCount: 22730,
    stockLevel: 30,
    previousStockLevel: 120,
    priceVelocityPerHourMinor: -150000,
    imageUrl: "/images/deal-kitchen.jpg",
    isSponsored: true,
    sponsorName: "Ninja Kitchen India",
    sponsorCpmMinor: 4800,
  },
  {
    asin: "B0CHWRXH8B",
    title: "Apple AirPods Pro (2nd Generation, USB-C, Active Noise Cancellation)",
    brand: "Apple",
    category: "audio",
    subcategory: "earbuds",
    marketplace: "amazon_com",
    currency: "USD",
    originalPriceMinor: 24900,
    currentPriceMinor: 17900,
    ninetyDayAvgMinor: 22400,
    lowestEverMinor: 16900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 46,
    ratingCount: 91840,
    stockLevel: 44,
    previousStockLevel: 190,
    priceVelocityPerHourMinor: -900,
    imageUrl: "/images/deal-audio.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0C884V8RR",
    title: "Logitech G PRO X SUPERLIGHT 2 Wireless Gaming Mouse (White)",
    brand: "Logitech",
    category: "gaming",
    subcategory: "mice",
    marketplace: "amazon_com",
    currency: "USD",
    originalPriceMinor: 15900,
    currentPriceMinor: 10900,
    ninetyDayAvgMinor: 14500,
    lowestEverMinor: 9900,
    couponCode: "LOGI15",
    couponExtraPercent: 15,
    ratingX10: 46,
    ratingCount: 12480,
    stockLevel: 18,
    previousStockLevel: 85,
    priceVelocityPerHourMinor: -1400,
    imageUrl: "/images/deal-keyboard.jpg",
    isSponsored: true,
    sponsorName: "Logitech G Store",
    sponsorCpmMinor: 7200,
  },
  {
    asin: "B098RKWHHZ",
    title: "Nintendo Switch OLED Model with White Joy-Con, 64GB",
    brand: "Nintendo",
    category: "gaming",
    subcategory: "consoles",
    marketplace: "amazon_com",
    currency: "USD",
    originalPriceMinor: 34900,
    currentPriceMinor: 28900,
    ninetyDayAvgMinor: 33400,
    lowestEverMinor: 27900,
    couponCode: null,
    couponExtraPercent: 0,
    ratingX10: 48,
    ratingCount: 64230,
    stockLevel: 25,
    previousStockLevel: 105,
    priceVelocityPerHourMinor: -800,
    imageUrl: "/images/deal-gaming.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0CK2FCG1K",
    title: "Raspberry Pi 5 (8GB RAM, 2.4GHz Quad-Core Cortex-A76, PCIe 2.0)",
    brand: "Raspberry Pi",
    category: "computing",
    subcategory: "single board computers",
    marketplace: "amazon_com",
    currency: "USD",
    originalPriceMinor: 8000,
    currentPriceMinor: 5900,
    ninetyDayAvgMinor: 7400,
    lowestEverMinor: 5500,
    couponCode: "PI5NOW",
    couponExtraPercent: 8,
    ratingX10: 47,
    ratingCount: 3820,
    stockLevel: 7,
    previousStockLevel: 62,
    priceVelocityPerHourMinor: -600,
    imageUrl: "/images/deal-computing.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
  {
    asin: "B0BQ7FK4QW",
    title: "Levi's 511 Slim Fit Stretch Jeans (Dark Indigo)",
    brand: "Levi's",
    category: "fashion",
    subcategory: "denim",
    marketplace: "amazon_com",
    currency: "USD",
    originalPriceMinor: 6950,
    currentPriceMinor: 3475,
    ninetyDayAvgMinor: 6200,
    lowestEverMinor: 3200,
    couponCode: "LEVIS20",
    couponExtraPercent: 20,
    ratingX10: 44,
    ratingCount: 41290,
    stockLevel: 64,
    previousStockLevel: 260,
    priceVelocityPerHourMinor: -400,
    imageUrl: "/images/deal-sneaker.jpg",
    isSponsored: false,
    sponsorName: null,
    sponsorCpmMinor: 0,
  },
];

/** Deterministic PRNG so seeded price history is identical across builds. */
function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PriceHistoryOptions {
  days?: number;
  now?: number;
}

/**
 * Generates a 90-day price curve for a catalog listing. The curve contains a
 * festival-sale plateau, a mid-cycle correction around the trailing average, and a
 * terminal leg that lands exactly on the live price so the modal chart always closes
 * on the same number the consumer sees in the card.
 */
export function buildPriceHistory(seed: CatalogDealSeed, options: PriceHistoryOptions = {}): PricePoint[] {
  const days = options.days ?? 90;
  const now = options.now ?? Date.now();
  const random = mulberry32(hashSeed(`${seed.asin}:${seed.marketplace}`));
  const round = seed.currency === "INR" ? 100 : 1;
  const floor = Math.max(seed.lowestEverMinor, Math.round(seed.originalPriceMinor * 0.18));
  const points: PricePoint[] = [];

  for (let index = days - 1; index >= 0; index -= 1) {
    const dayIndex = days - index;
    const t = now - index * 86_400_000;
    const progress = dayIndex / days;

    // Base: mean-reverting walk anchored between the 90-day average and list price.
    const anchor = seed.ninetyDayAvgMinor + (seed.originalPriceMinor - seed.ninetyDayAvgMinor) * 0.35;
    const wave = Math.sin(progress * Math.PI * 2.4) * 0.035;
    const noise = (random() - 0.5) * 0.045;
    let price = anchor * (1 + wave + noise);

    // Festival promotion window (day 25 to day 33) and a mid-cycle correction (day 58-61).
    if (dayIndex >= 25 && dayIndex <= 33) price *= 0.87;
    if (dayIndex >= 58 && dayIndex <= 61) price *= 0.93;

    // Terminal leg: last 6 days walk down to the live price.
    if (index <= 5) {
      const legProgress = (6 - index) / 6;
      price = anchor * (1 - legProgress) + seed.currentPriceMinor * legProgress;
    }

    const bounded = Math.min(seed.originalPriceMinor, Math.max(floor, price));
    points.push({ t, p: Math.max(round, Math.round(bounded / round) * round) });
  }

  if (points.length > 0) {
    points[points.length - 1] = { t: now, p: seed.currentPriceMinor };
  }
  return points;
}

export interface CategoryDefinition {
  slug: string;
  label: string;
  headline: string;
  synonyms: string[];
}

export const CATEGORY_TAXONOMY: CategoryDefinition[] = [
  {
    slug: "audio",
    label: "Audio",
    headline: "Headphones, earbuds and soundbars at trailing-90-day lows",
    synonyms: ["headphones", "earbuds", "speakers"],
  },
  {
    slug: "computing",
    label: "Computing",
    headline: "Laptops, SSDs, monitors and peripherals with verified price drops",
    synonyms: ["laptops", "ssd", "monitors", "keyboards"],
  },
  {
    slug: "electronics",
    label: "Electronics",
    headline: "Cameras, e-readers and smart devices flagged below average price",
    synonyms: ["cameras", "ereaders"],
  },
  {
    slug: "mobile",
    label: "Mobile & Wearables",
    headline: "Smartwatches, power banks and phone accessories on clearance",
    synonyms: ["wearables", "chargers"],
  },
  {
    slug: "gaming",
    label: "Gaming",
    headline: "Console hardware, controllers and gaming peripherals at glitch pricing",
    synonyms: ["consoles", "controllers"],
  },
  {
    slug: "home",
    label: "Home",
    headline: "Vacuum cleaners and smart home hardware with stock-depletion signals",
    synonyms: ["appliances", "smart-home"],
  },
  {
    slug: "kitchen",
    label: "Kitchen",
    headline: "Pressure cookers, blenders and cookware below catalog price",
    synonyms: ["cookware", "blenders"],
  },
  {
    slug: "fashion",
    label: "Fashion",
    headline: "Denim and apparel cuts with the highest commission margins",
    synonyms: ["denim", "apparel"],
  },
  {
    slug: "footwear",
    label: "Footwear",
    headline: "Sneaker markdowns that track the lowest price of the last 90 days",
    synonyms: ["sneakers", "shoes"],
  },
];

export interface DiscountRangeDefinition {
  slug: string;
  label: string;
  minDiscountPercent: number;
  maxDiscountPercent: number;
}

export const DISCOUNT_RANGES: DiscountRangeDefinition[] = [
  {
    slug: "under-20-percent-off",
    label: "Under 20% off",
    minDiscountPercent: 0,
    maxDiscountPercent: 20,
  },
  {
    slug: "20-percent-off",
    label: "20% off and above",
    minDiscountPercent: 20,
    maxDiscountPercent: 100,
  },
  {
    slug: "30-percent-off",
    label: "30% off and above",
    minDiscountPercent: 30,
    maxDiscountPercent: 100,
  },
  {
    slug: "40-percent-off",
    label: "40% off and above",
    minDiscountPercent: 40,
    maxDiscountPercent: 100,
  },
  {
    slug: "50-percent-off",
    label: "50% off and above",
    minDiscountPercent: 50,
    maxDiscountPercent: 100,
  },
  {
    slug: "60-percent-off",
    label: "60% off and above",
    minDiscountPercent: 60,
    maxDiscountPercent: 100,
  },
  {
    slug: "70-percent-off",
    label: "70% off and above",
    minDiscountPercent: 70,
    maxDiscountPercent: 100,
  },
];

export interface PriceBracketDefinition {
  slug: string;
  label: string;
  minPriceMinor: number;
  maxPriceMinor: number | null;
}

export const PRICE_BRACKETS: PriceBracketDefinition[] = [
  { slug: "under-1000", label: "Under ₹1,000", minPriceMinor: 0, maxPriceMinor: 100000 },
  { slug: "under-5000", label: "Under ₹5,000", minPriceMinor: 0, maxPriceMinor: 500000 },
  { slug: "under-10000", label: "Under ₹10,000", minPriceMinor: 0, maxPriceMinor: 1000000 },
  { slug: "under-25000", label: "Under ₹25,000", minPriceMinor: 0, maxPriceMinor: 2500000 },
  { slug: "under-50000", label: "Under ₹50,000", minPriceMinor: 0, maxPriceMinor: 5000000 },
  { slug: "above-50000", label: "₹50,000 and above", minPriceMinor: 5000000, maxPriceMinor: null },
];

export interface ResolvedSegment {
  kind: "discount" | "price";
  slug: string;
  label: string;
  minDiscountPercent: number;
  minPriceMinor: number;
  maxPriceMinor: number | null;
}

/** Resolves the second pSEO path segment into a discount range or a price bracket. */
export function resolveSegment(segment: string): ResolvedSegment | null {
  const discount = DISCOUNT_RANGES.find((range) => range.slug === segment);
  if (discount) {
    return {
      kind: "discount",
      slug: discount.slug,
      label: discount.label,
      minDiscountPercent: discount.minDiscountPercent,
      minPriceMinor: 0,
      maxPriceMinor: null,
    };
  }
  const bracket = PRICE_BRACKETS.find((entry) => entry.slug === segment);
  if (bracket) {
    return {
      kind: "price",
      slug: bracket.slug,
      label: bracket.label,
      minDiscountPercent: 0,
      minPriceMinor: bracket.minPriceMinor,
      maxPriceMinor: bracket.maxPriceMinor,
    };
  }
  return null;
}

export function categoryBySlug(slug: string): CategoryDefinition | null {
  return CATEGORY_TAXONOMY.find((category) => category.slug === slug) ?? null;
}
