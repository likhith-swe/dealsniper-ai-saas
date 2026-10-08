/**
 * Central environment reader. Every integration in DealSniper degrades to a
 * documented fallback so the platform renders and records data without secrets.
 */

function read(key: string): string | null {
  const value = process.env[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export const AFFILIATE_TAGS = {
  amazon_in: read("AMAZON_ASSOCIATE_TAG_IN") ?? "dealsniper-21",
  amazon_com: read("AMAZON_ASSOCIATE_TAG_US") ?? "dealsniper0d-20",
  flipkart: read("FLIPKART_AFFILIATE_ID") ?? "dealsniper",
} as const;

/** Salt for IP hashing. Real salt in production; static fallback keeps analytics keys stable. */
export const IP_HASH_SALT = read("IP_HASH_SALT") ?? "dealsniper-local-salt";

export const SESSION_COOKIE_NAME = "ds_session";
export const SESSION_TTL_DAYS = 30;

export function sessionSecret(): string {
  return read("AUTH_SESSION_SECRET") ?? "dealsniper-dev-session-secret";
}

export function supabaseEnv(): { url: string; anonKey: string } | null {
  const url = read("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return supabaseEnv() !== null;
}

export function rapidApiKey(): string | null {
  return read("RAPIDAPI_KEY");
}

export function upstashEnv(): { url: string; token: string } | null {
  const url = read("UPSTASH_REDIS_REST_URL");
  const token = read("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return null;
  return { url, token };
}

export function resendApiKey(): string | null {
  return read("RESEND_API_KEY");
}

export function loopsApiKey(): string | null {
  return read("LOOPS_API_KEY");
}

export function razorpayCredentials(): { keyId: string; keySecret: string; webhookSecret: string | null } | null {
  const keyId = read("RAZORPAY_KEY_ID");
  const keySecret = read("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: read("RAZORPAY_WEBHOOK_SECRET") };
}

export function stripeCredentials(): { secretKey: string; webhookSecret: string | null } | null {
  const secretKey = read("STRIPE_SECRET_KEY");
  if (!secretKey) return null;
  return { secretKey, webhookSecret: read("STRIPE_WEBHOOK_SECRET") };
}

export function telegramBotToken(): string | null {
  return read("TELEGRAM_BOT_TOKEN");
}

export function cronSecret(): string | null {
  return read("CRON_SECRET");
}

export function siteUrl(): string {
  return (
    read("NEXT_PUBLIC_SITE_URL") ??
    (read("VERCEL_URL") ? `https://${read("VERCEL_URL")}` : "http://localhost:3000")
  );
}

/**
 * When no transactional email provider is configured the magic-link flow returns the
 * verification URL in the API response so a self-hosted operator can sign in. As soon as
 * RESEND_API_KEY exists the link is delivered by email only.
 */
export function magicLinkDeliveryMode(): "email" | "preview_link" {
  return resendApiKey() ? "email" : "preview_link";
}

export function vipPrice(): { inrMinor: number; usdMinor: number } {
  return {
    inrMinor: Number(read("VIP_PRICE_INR_MINOR") ?? 29900),
    usdMinor: Number(read("VIP_PRICE_USD_MINOR") ?? 700),
  };
}

export function freeTierAlertQuota(): number {
  return Number(read("FREE_ALERT_QUOTA") ?? 3);
}

export function vipDelaySeconds(): number {
  return Number(read("VIP_DELAY_SECONDS") ?? 0);
}

export function freeDelaySeconds(): number {
  return Number(read("FREE_DELAY_SECONDS") ?? 900);
}
