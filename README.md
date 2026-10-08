# DealSniper AI

Real-time price-drop, coupon-glitch and arbitrage radar for Amazon India, Amazon US and Flipkart.

Next.js 16 (App Router) · React 19 · PostgreSQL + Drizzle ORM · Tailwind CSS v4 · Framer Motion · Lenis

## What runs here

- **Price pipeline** — `POST /api/cron/refresh-deals` samples every tracked listing, recomputes the 0-100 Deal Score from four weighted signals, appends a `price_history` point, re-anchors the trailing 90-day average, evaluates subscriber triggers and prunes expired cache and session rows.
- **Terminal** — `/` renders the live scored feed with category, discount, price-bracket, sort and search filters plus the 90-day price chart and alert modals.
- **Programmatic SEO** — `/deals/[category]/[discount]` pre-renders 117 segment pages (discount tiers and price brackets) with Product, Offer, AggregateOffer, ItemList and BreadcrumbList markup, revalidated every 15 minutes. Dynamic OpenGraph cards come from `/api/og`.
- **Accounts** — passwordless magic links with Postgres-backed server sessions (`src/proxy.ts` guards `/dashboard` and `/alerts`), plus Google OAuth when Supabase credentials exist.
- **Monetisation** — affiliate click ledger at `/api/go/amazon/[asin]`, VIP Pro subscriptions through Razorpay (INR) and Stripe (USD) with HMAC-verified webhooks, newsletter lead capture with Loops/Resend CRM sync, native ad containers and sponsored placement controls.

Full blueprint, data model, monetisation unit economics, SQL/RLS migration and launch playbook: **[SPEC.md](./SPEC.md)**.

## Setup

```bash
npx drizzle-kit push   # create tables in DATABASE_URL
npm run dev            # http://localhost:3000
npm run build && npm start
```

The catalog seeds itself on first request. Sign in at `/login`; without `RESEND_API_KEY` the API returns a preview link that completes the session. Run an ingest cycle from `/dashboard` or `POST /api/cron/refresh-deals`.

## Environment variables (all optional, documented fallbacks)

`DATABASE_URL`, `RAPIDAPI_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `AUTH_SESSION_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, `RESEND_API_KEY`, `LOOPS_API_KEY`, `TELEGRAM_BOT_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_INR`, `RAZORPAY_PLAN_ID_USD`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_VIP_ID`, `STRIPE_WEBHOOK_SECRET`, `AMAZON_ASSOCIATE_TAG_IN`, `AMAZON_ASSOCIATE_TAG_US`, `NEXT_PUBLIC_SITE_URL`.
