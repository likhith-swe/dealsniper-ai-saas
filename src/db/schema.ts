import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * DealSniper AI — Postgres schema (Drizzle ORM).
 *
 * Money is stored in minor units (paise / cents) as integers so that affiliate
 * commission math, discount rounding and reseller margin calculations never
 * accumulate floating point error. Ratings are stored as tenths (45 = 4.5 stars)
 * for the same reason.
 */

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    avatarUrl: text("avatar_url"),
    authProvider: text("auth_provider").notNull().default("magic_link"),
    isPro: boolean("is_pro").notNull().default(false),
    planTier: text("plan_tier").notNull().default("free"),
    customAlertsCount: integer("custom_alerts_count").notNull().default(0),
    telegramHandle: text("telegram_handle"),
    whatsappNumber: text("whatsapp_number"),
    billingCustomerId: text("billing_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("profiles_email_key").on(table.email)],
);

/**
 * Local mirror of `auth.users`. When Supabase Auth is configured the rows are
 * created from the Supabase user payload; the column shape intentionally matches
 * the Supabase user object so the same code path serves both providers.
 */
export const authUsers = pgTable(
  "auth_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    provider: text("provider").notNull().default("magic_link"),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("auth_users_email_key").on(table.email)],
);

/** Single-use magic link tokens (hashed at rest, 15 minute TTL). */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    purpose: text("purpose").notNull().default("magic_link"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_tokens_token_hash_key").on(table.tokenHash),
    index("auth_tokens_user_idx").on(table.userId),
  ],
);

/** Server-side sessions. The cookie carries `<sessionId>.<secret>`; only the hash is stored. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId)],
);

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    asin: text("asin").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull().default("general"),
    brand: text("brand").notNull(),
    imageUrl: text("image_url").notNull(),
    marketplace: text("marketplace").notNull().default("amazon_in"),
    currency: text("currency").notNull().default("INR"),
    originalPriceMinor: integer("original_price_minor").notNull(),
    currentPriceMinor: integer("current_price_minor").notNull(),
    ninetyDayAvgMinor: integer("ninety_day_avg_minor").notNull(),
    lowestEverMinor: integer("lowest_ever_minor").notNull(),
    discountPercent: integer("discount_percent").notNull(),
    couponCode: text("coupon_code"),
    couponExtraPercent: integer("coupon_extra_percent").notNull().default(0),
    dealScore: integer("deal_score").notNull().default(0),
    dealScoreParts: jsonb("deal_score_parts")
      .$type<{
        priceDeviation: number;
        stockVelocity: number;
        reviewIntegrity: number;
        couponStack: number;
      }>()
      .notNull()
      .default({
        priceDeviation: 0,
        stockVelocity: 0,
        reviewIntegrity: 0,
        couponStack: 0,
      }),
    inStock: boolean("in_stock").notNull().default(true),
    stockLevel: integer("stock_level").notNull().default(100),
    priceVelocityPerHourMinor: integer("price_velocity_per_hour_minor").notNull().default(0),
    ratingX10: integer("rating_x10").notNull().default(40),
    ratingCount: integer("rating_count").notNull().default(0),
    affiliateUrl: text("affiliate_url").notNull(),
    isSponsored: boolean("is_sponsored").notNull().default(false),
    sponsorName: text("sponsor_name"),
    sponsorCpmMinor: integer("sponsor_cpm_minor").notNull().default(0),
    isGlitch: boolean("is_glitch").notNull().default(false),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("deals_asin_key").on(table.asin),
    index("deals_category_idx").on(table.category),
    index("deals_discount_idx").on(table.discountPercent),
    index("deals_score_idx").on(table.dealScore),
  ],
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("INR"),
    source: text("source").notNull().default("rapidapi"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("price_history_deal_recorded_idx").on(table.dealId, table.recordedAt)],
);

export const userAlerts = pgTable(
  "user_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    targetPriceMinor: integer("target_price_minor"),
    currency: text("currency").notNull().default("INR"),
    category: text("category"),
    minDiscountPercent: integer("min_discount_percent").notNull().default(0),
    notifyChannel: text("notify_channel").notNull().default("email"),
    destination: text("destination").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    matchCount: integer("match_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("user_alerts_user_idx").on(table.userId)],
);

export const affiliateClicks = pgTable(
  "affiliate_clicks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    asin: text("asin").notNull(),
    partner: text("partner").notNull().default("amazon"),
    marketplace: text("marketplace").notNull().default("amazon_in"),
    targetUrl: text("target_url").notNull(),
    ipHash: text("ip_hash").notNull(),
    userAgent: text("user_agent"),
    referer: text("referer"),
    utmCampaign: text("utm_campaign"),
    estimatedCommissionMinor: integer("estimated_commission_minor").notNull().default(0),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("affiliate_clicks_asin_idx").on(table.asin),
    index("affiliate_clicks_clicked_at_idx").on(table.clickedAt),
  ],
);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    sourcePage: text("source_page").notNull().default("home"),
    status: text("status").notNull().default("pending"),
    interestTags: text("interest_tags").array().notNull().default([]),
    sponsorTier: text("sponsor_tier"),
    crmProvider: text("crm_provider").notNull().default("none"),
    crmSyncedAt: timestamp("crm_synced_at", { withTimezone: true }),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("newsletter_subscribers_email_key").on(table.email)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    planTier: text("plan_tier").notNull().default("vip_pro"),
    subscriptionId: text("subscription_id").notNull(),
    paymentId: text("payment_id"),
    status: text("status").notNull().default("created"),
    amountMinor: integer("amount_minor").notNull().default(29900),
    currency: text("currency").notNull().default("INR"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    rawEvents: jsonb("raw_events").$type<Record<string, unknown>[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("subscriptions_provider_subscription_key").on(table.provider, table.subscriptionId),
    index("subscriptions_user_idx").on(table.userId),
  ],
);

/** Notification dispatch log: one row per matched alert broadcast attempt. */
export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id").references(() => userAlerts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    status: text("status").notNull(),
    latencyMs: integer("latency_ms").notNull().default(0),
    detail: text("detail"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("alert_events_user_idx").on(table.userId, table.createdAt)],
);

/** Shared cache for RapidAPI payloads and rendered aggregates (30 minute TTL). */
export const apiCache = pgTable("api_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Single-row-per-key operational state used for seeding and cron locks. */
export const systemState = pgTable("system_state", {
  stateKey: text("state_key").primaryKey(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DealRow = typeof deals.$inferSelect;
export type DealInsert = typeof deals.$inferInsert;
export type PriceHistoryRow = typeof priceHistory.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type UserAlertRow = typeof userAlerts.$inferSelect;
export type AffiliateClickRow = typeof affiliateClicks.$inferSelect;
export type NewsletterSubscriberRow = typeof newsletterSubscribers.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type AlertEventRow = typeof alertEvents.$inferSelect;
