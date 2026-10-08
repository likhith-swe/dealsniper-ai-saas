# DealSniper AI — Production Blueprint and Codebase Reference

Real-time e-commerce price-drop, coupon-glitch and arbitrage radar for Amazon India, Amazon US and Flipkart.

This document is the engineering and commercial specification for the repository in this project. Every section maps to code that runs: no pseudocode, no placeholder branches. Where an external credential is absent the platform falls back to a documented, working path — the fallbacks are listed with each integration.

---

## 1. System architecture

```
                         ┌──────────────────────────────────────────────┐
  RapidAPI (Real-Time    │  Ingest cycle  POST /api/cron/refresh-deals  │
  Amazon Data, Barcode   │  1. sample price + availability per ASIN     │
  Lookup)  ────────────► │  2. recompute Deal Score (4 weighted signals)│
                         │  3. append price_history sample              │
                         │  4. re-anchor the trailing 90-day average    │
                         │  5. match + dispatch subscriber triggers     │
                         │  6. prune cache and expired sessions         │
                         └───────────────┬──────────────────────────────┘
                                         │ writes
                    PostgreSQL (Drizzle) │ deals · price_history · user_alerts
                                         │ alert_events · affiliate_clicks
                                         │ newsletter_subscribers · subscriptions
                                         ▼
   ┌───────────────────────────┬────────────────────────┬──────────────────────────┐
   │ Public terminal           │ pSEO surface           │ Account surfaces         │
   │ /                         │ /deals/[cat]/[segment] │ /dashboard · /alerts     │
   │ /deal/[asin]              │ /api/og dynamic cards  │ /login (magic link)      │
   │ /api/deals feed           │ sitemap.xml, robots    │ Razorpay / Stripe webhook│
   └───────────────────────────┴────────────────────────┴──────────────────────────┘
                    │                        │                       │
                    ▼                        ▼                       ▼
        Affiliate redirect            Telegram / WhatsApp      Subscription state
        /api/go/amazon/[asin]         / Email (Resend)         profiles.is_pro
```

Runtime: Next.js 16 App Router (Turbopack build), React 19, PostgreSQL via Drizzle ORM, Tailwind CSS v4 design tokens, Framer Motion for modal motion, Lenis for landing-page scroll.

### Integration fallback matrix

| Integration | Env vars | Behaviour when absent |
| --- | --- | --- |
| RapidAPI Real-Time Amazon Data | `RAPIDAPI_KEY` | Verified 25-listing catalog + deterministic market model (`src/lib/seed.ts`, `src/lib/ingest.ts`) |
| Cache | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Postgres `api_cache` table with TTL and prune |
| Rate limiting | `UPSTASH_REDIS_REST_*` | In-process sliding window with opportunistic eviction |
| Supabase Auth | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Postgres sessions + magic links (`src/lib/auth/session.ts`) |
| Transactional email | `RESEND_API_KEY` | Magic link returned as `delivery: "preview_link"`; alerts logged as `queued` |
| Newsletter CRM | `LOOPS_API_KEY`, else `RESEND_API_KEY` | Subscriber stored in Postgres with `crm_provider = 'none'` |
| Telegram | `TELEGRAM_BOT_TOKEN` | Dispatch logged as `queued` in `alert_events` |
| WhatsApp | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Dispatch logged as `queued` |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_ID_INR/_USD` | Webhook returns 503 until configured; checkout falls through to Stripe, then sandbox |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PRICE_VIP_ID`, `STRIPE_WEBHOOK_SECRET` | Same fall-through chain |
| Merchant of record (sandbox) | none | Signed activation link, rows labelled `provider = "sandbox"`, never counted as collected revenue |
| Cron authorization | `CRON_SECRET` | Endpoint open, response reports `authorizationMode: "open"` |

---

## 2. Data model (PostgreSQL)

Defined in `src/db/schema.ts`, applied with `npx drizzle-kit push`.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `profiles` | Account and plan state | `id`, `email` (unique), `is_pro`, `plan_tier`, `custom_alerts_count`, `telegram_handle`, `whatsapp_number` |
| `auth_users` | Local mirror of `auth.users` | `id`, `email` (unique), `provider`, `last_sign_in_at` |
| `auth_tokens` | Single-use magic links | `token_hash` (unique), `purpose`, `expires_at`, `consumed_at` |
| `auth_sessions` | Server-side sessions | `token_hash`, `ip_hash`, `user_agent`, `expires_at` |
| `deals` | Tracked listings | `asin` (unique), `original_price_minor`, `current_price_minor`, `ninety_day_avg_minor`, `lowest_ever_minor`, `discount_percent`, `coupon_code`, `coupon_extra_percent`, `deal_score`, `deal_score_parts` (jsonb), `stock_level`, `price_velocity_per_hour_minor`, `rating_x10`, `rating_count`, `is_glitch`, `is_sponsored`, `sponsor_cpm_minor`, `last_checked_at` |
| `price_history` | Sample series | `deal_id`, `price_minor`, `source`, `recorded_at` |
| `user_alerts` | Trigger definitions | `user_id`, `keyword`, `target_price_minor`, `min_discount_percent`, `notify_channel`, `destination`, `is_active`, `match_count`, `last_triggered_at` |
| `affiliate_clicks` | Click ledger | `user_id`, `deal_id`, `asin`, `partner`, `target_url`, `ip_hash`, `utm_campaign`, `estimated_commission_minor`, `clicked_at` |
| `newsletter_subscribers` | Digest list | `email` (unique), `source_page`, `status`, `interest_tags`, `crm_provider`, `unsubscribe_token` |
| `subscriptions` | Billing records | `provider`, `subscription_id`, `status`, `amount_minor`, `currency`, `current_period_end`, `raw_events` (jsonb) |
| `alert_events` | Dispatch ledger | `alert_id`, `deal_id`, `channel`, `status`, `latency_ms`, `payload` |
| `api_cache` | Shared JSON cache | `cache_key` (pk), `payload`, `expires_at` |
| `system_state` | Operational state | `state_key` (pk), `value` (jsonb) — seed marker and ingest run counter |

Money is stored in minor units (paise / cents) as integers; ratings as tenths (45 = 4.5). This keeps commission arithmetic, discount rounding and reseller margin maths exact.

### Supabase deployment artifacts

When the repository is deployed against a managed Supabase project, run the following SQL after `drizzle-kit push` (or port the Drizzle schema and paste this script as migration `0001_init`). It adds RLS, the profile-creation trigger and the maintenance functions that the local sandbox performs inside the application layer.

```sql
-- Enable RLS on every customer-facing table.
alter table public.profiles               enable row level security;
alter table public.deals                  enable row level security;
alter table public.price_history          enable row level security;
alter table public.user_alerts            enable row level security;
alter table public.affiliate_clicks       enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.subscriptions          enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Deals and price history are public read-only market data.
create policy "deals_public_read" on public.deals
  for select using (true);
create policy "price_history_public_read" on public.price_history
  for select using (true);

create policy "user_alerts_own" on public.user_alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "affiliate_clicks_insert_own" on public.affiliate_clicks
  for insert with check (auth.uid() = user_id or user_id is null);
create policy "affiliate_clicks_select_own" on public.affiliate_clicks
  for select using (auth.uid() = user_id);

create policy "newsletter_insert_public" on public.newsletter_subscribers
  for insert with check (true);
create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- Profile row on signup, mirroring the application-level upsert in src/lib/auth/session.ts.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, auth_provider, custom_alerts_count)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', null),
    coalesce(new.raw_app_meta_data ->> 'provider', 'magic_link'),
    0
  )
  on conflict (email) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Maintenance: drop samples older than 180 days and dispatch logs older than 60 days.
create or replace function public.dealsniper_prune_old_samples()
returns void
language sql
as $$
  delete from public.price_history
   where recorded_at < now() - interval '180 days';

  delete from public.alert_events
   where created_at < now() - interval '60 days';
$$;

-- Recompute the trailing 90-day average for one listing.
create or replace function public.dealsniper_refresh_average(p_deal_id uuid)
returns integer
language plpgsql
as $$
declare
  v_avg integer;
begin
  select coalesce(round(avg(price_minor))::int, 0)
    into v_avg
    from public.price_history
   where deal_id = p_deal_id
     and recorded_at > now() - interval '90 days';

  if v_avg > 0 then
    update public.deals
       set ninety_day_avg_minor = v_avg
     where id = p_deal_id;
  end if;

  return v_avg;
end;
$$;
```

---

## 3. Deal Score v1.4

Implemented as a pure function in `src/lib/deal-score.ts` so the ingest cycle, the API and the UI all rank from one definition.

| Signal | Weight | Inputs | Scoring rule |
| --- | --- | --- | --- |
| Price deviation | 40% | `current_price_minor`, `ninety_day_avg_minor`, `lowest_ever_minor` | `deviationPercent × 1.85`, capped at 88, plus a 12-point bonus when the sample prints a new 90-day low |
| Stock velocity | 25% | `stock_level`, `previous_stock_level`, `price_velocity_per_hour_minor` | Depletion ratio × 140 plus a velocity term scaled against listing price; the first sample of a listing uses a 35% drain prior when inventory sits below 25% |
| Review integrity | 20% | `rating_x10`, `rating_count` | Rating term (70 max at 4.6 stars), depth term `log10(reviews) × 7.5` (30 max), −15 for fewer than 25 reviews, −20 for rating below 3.5 with more than 400 reviews |
| Coupon stack | 15% | `coupon_code`, `coupon_extra_percent` | 62 points for a published code plus 4.2 per additional cart percent |

Out-of-stock listings lose 18 points. Grades: `LEGENDARY` ≥ 85, `STRONG` ≥ 70, `SOLID` ≥ 55, `FAIR` ≥ 40, `NOISE` below 40.

Glitch candidates: `discount_percent ≥ 72` while in stock, or `deviation ≥ 45%` with a coupon adding at least 10% at cart.

---

## 4. Monetisation engine (five channels, all implemented)

### 4.1 Marketplace affiliate commission (4–10%)

- Claim buttons call `/api/go/amazon/[asin]?campaign=<surface>&market=<marketplace>`.
- The handler validates the ASIN, applies the sliding-window click limit, resolves the tag (`dealsniper-21` for IN, `dealsniper0d-20` for US, `dealsniper` for Flipkart), writes the click row with a salted IP hash, then issues a 302 to the tagged marketplace URL.
- Bots and link expanders are filtered by user agent before the insert, so click analytics estimate real commission.
- `estimated_commission_minor` is written per click using the category rate table (`commissionRateFor`), which converts the ledger into a revenue estimate without waiting for the network report.
- Unit economics: 100 clicks/day × 10% buy rate × USD 60 average cart = USD 600 GMV/day ≈ USD 24–60/day at a 4–10% rate. The 24-hour cookie window also captures unrelated items added in the same session.

### 4.2 VIP Pro subscription (₹299/month, USD 7/month)

- Free: feed samples published after the 15-minute delay, three active triggers, email delivery.
- VIP Pro: zero-second publication (`VIP_DELAY_SECONDS`), unlimited triggers, Telegram/WhatsApp webhook delivery, arbitrage margin panel, 180-day velocity telemetry.
- INR checkout creates a Razorpay subscription against `RAZORPAY_PLAN_ID_INR`, falling back to a payment link; USD checkout creates a Stripe Billing session against `STRIPE_PRICE_VIP_ID`.
- `POST /api/webhooks/razorpay` verifies the HMAC SHA256 signature over the raw body; `POST /api/webhooks/stripe` verifies `t=...,v1=...` with a five-minute replay tolerance. Both map provider states onto `subscriptions` and `profiles.is_pro`.
- Without provider credentials the checkout returns a signed sandbox activation link (15-minute HMAC token bound to the account). Rows are labelled `provider = "sandbox"`.

### 4.3 Daily 10 Glitch Drops newsletter (USD 50–90 CPM)

- Capture modal on the landing page and every category page.
- `POST /api/newsletter/subscribe` validates the address, rate limits to 5 attempts per 10 minutes, upserts with an unsubscribe token and syncs the contact to Loops.so (primary) or Resend Contacts (fallback).
- One sponsor slot per send at 07:30 IST; `GET /api/newsletter/subscribe` returns list size, CRM split and the sponsor CPM band for the media kit.

### 4.4 Native ad containers (USD 5–15 CPM)

- `DealGrid` interleaves a reserved container every six organic cards with a fixed 420px minimum height, `data-ad-slot` attributes, no auto-refresh and no interstitials.
- Inventory is programmatic-first (EthicalAds/AdSense compatible) and released to direct sponsors when the negotiated CPM exceeds the programmatic floor.

### 4.5 Sponsored brand placements

- Pinned "Featured drops" row above the grid, ordered by `sponsor_cpm_minor`, populated from `deals.is_sponsored`, `sponsor_name`.
- Sponsored listings always carry a visible label, keep their real Deal Score and never displace organic results inside the grid (`hideSponsored` filter available to users).

---

## 5. API surface

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/deals` | GET | Category, discount, price bracket, search, sort, limit; free-tier delay applied server side |
| `/api/deals/[asin]/history` | GET | Sample series, trailing statistics, stock drain telemetry |
| `/api/go/amazon/[asin]` | GET | Click ledger + 302 to tagged marketplace URL; `mode=json` returns the resolved URL |
| `/api/alerts` | GET | Caller's triggers, quota, 30-day click economics |
| `/api/alerts/create` | POST | Validates keyword, channel, destination, target price; enforces the free quota |
| `/api/alerts/[id]` | PATCH, DELETE | Pause/resume and remove a trigger |
| `/api/newsletter/subscribe` | GET, POST | Lead capture, CRM sync, media-kit metrics |
| `/api/auth/magic-link` | POST | Issues a 15-minute single-use token; emails it or returns the preview link |
| `/api/auth/verify` | GET | Consumes the token, opens a server session, sets the signed cookie |
| `/api/auth/signout` | POST | Revokes the session row and clears the cookie |
| `/api/auth/google` | GET | Supabase Google OAuth start |
| `/api/auth/session` | GET | Client session probe with tier and delay |
| `/auth/callback` | GET | Supabase OAuth code exchange, profile mirror |
| `/api/billing/checkout` | POST | Razorpay → Stripe → sandbox chain |
| `/api/billing/sandbox-activate` | GET | HMAC-token VIP activation when no provider exists |
| `/api/webhooks/razorpay` | GET, POST | Signature-verified subscription lifecycle |
| `/api/webhooks/stripe` | GET, POST | Signature-verified subscription lifecycle |
| `/api/cron/refresh-deals` | GET, POST | Ingest cycle, optional `?dryRun=true`, `CRON_SECRET` bearer |
| `/api/og` | GET | Dynamic OpenGraph card from live deal data |
| `/api/health` | GET | Database, cache, rate limiter, ingest and integration readiness |
| `/sitemap.xml`, `/robots.txt` | GET | 129 programmatic paths, listing pages, crawl policy |

Request policies (`src/lib/ratelimit.ts`): feed 240/min, alert writes 12/min, clicks 300/min, newsletter 5/10min, magic links 5/10min, checkout 10/10min. VIP Pro multipliers triple every limit.

---

## 6. Programmatic SEO engine

- Path space: 9 categories × (7 discount tiers + 6 price brackets) = 117 segment pages, pre-rendered at build time and revalidated every 15 minutes (`export const revalidate = 900`).
- Segment resolution accepts both shapes: `/deals/audio/40-percent-off` and `/deals/audio/under-5000`.
- Structured data: `Product` + `Offer` (price, currency, availability, aggregate rating), `AggregateOffer` for the segment, `ItemList`, `BreadcrumbList`, plus `WebSite` with `SearchAction` and `FAQPage` on the landing page.
- Dynamic OpenGraph cards render from `GET /api/og?asin=...` with the live price, discount, Deal Score grade and 1,200 × 630 dimensions for Telegram and WhatsApp previews.
- The pages keep a static shell (session-free) and the client feed re-syncs from `/api/deals` on mount, so a VIP session still receives the zero-delay sample set without forcing dynamic rendering.

---

## 7. Design system

- 60% `#08090E` obsidian canvas, 30% `#11131C` / `#171A25` slate surfaces, 10% `#10B981` emerald accents on every actionable element.
- Hairline glass borders `border-white/[0.08]`, 12–14px radii, Geist-first typography stack with tabular numerals for prices, compact currency formatting (`₹1.2L`, `$1.2K`).
- Micro-interactions: card lift on hover (2px translate with an emerald shadow), pulsing live dot, marquee ticker that pauses on hover, 260ms rise-in on new rows, skeleton sweep during feed refresh, `prefers-reduced-motion` disables all of it.
- Density: four-column grid at 2xl, 168px product imagery, Deal Score meter, coupon-stack line, urgency label, countdown and two secondary actions per card.

---

## 8. Distribution and launch playbook

### 8.1 Telegram and WhatsApp channels — first 1,000 subscribers

1. Create `DealSniper Glitch Drops` on Telegram and set the channel description to the ingest cadence, not a slogan: "Samples every 30 minutes across Amazon.in and Amazon.com. Glitch candidates posted when the score clears 80."
2. Seed 40–60 listings/day from the terminal, always three per post: image, ASIN, list price, live price, the 90-day average and the `/api/go/amazon/...` claim link.
3. Join 15–20 college and city community groups per metro (campus tech clubs, hostel groups, r/bangalore-adjacent WhatsApp communities). Share one drop in the group with the price history screenshot; the chart image is the hook, not the link. Link the channel only in your group bio, never as a repeated post.
4. Post at 08:00, 13:00 and 20:30 IST — the windows with the highest observed click-through in deal traffic.
5. Track channel → click attribution by appending `?campaign=telegram_main` and `?campaign=whatsapp_main` to every claim link; the click ledger splits revenue by surface.

### 8.2 Reddit (r/deals, r/DealsIndia, r/IndianGaming)

Non-promotional format that survives moderation:

```
Title: Sony WH-1000XM5 at ₹19,989 on Amazon.in (43% off list, ₹8,500 below its 90-day average)

Body:
- ASIN: B09XS7JWHH
- List ₹34,990 · 90-day average ₹27,490 · current ₹19,989
- Lowest price in the last 90 days, matching its all-time low of ₹18,990 in the 2024 festive cycle
- No coupon needed; the price is live as of the timestamp below

I track 25 listings for price anomalies and keep this one on a 30-minute sample. Chart: <link to /api/og?asin=...>
Price was verified at HH:MM IST. Marketplace prices move; confirm at checkout.
```

Rules that keep the account alive: post the data and the chart, never the affiliate link (Reddit strips and flags them), answer questions in the thread with the sample series, and never post more than one deal per subreddit per day.

### 8.3 Converting 50 VIP subscribers in 7 days

Target segment: the readers who already click Claim Deal twice a week.

1. Day 1–2: instrument everything. The dashboard shows each free user their 30-day click count and a modelled commission figure: "You clicked 11 deals last month. At the free delay you missed the two fastest-draining ones."
2. Day 3: publish the delay comparison with real data — the same three listings side by side at the 15-minute mark and at zero seconds, with the price delta that already closed.
3. Day 4: send the trigger-limit message. A free account holding three triggers will hit the wall inside a fortnight; the upgrade prompt fires at the exact moment the fourth trigger is rejected (HTTP 402 path in `AlertModal`/`AlertManager`).
4. Day 5: publish the reseller margin panel on a listing where the margin clears ₹1,500 per unit and state the fee assumptions. Arithmetic converts arbitrage buyers better than urgency copy.
5. Day 6: ship the 7-day trial through Razorpay with `total_count: 12` and a first-invoice discount, then email the trial cohort the first three alerts they would have received.
6. Day 7: close with a bounded offer — the first 50 subscribers keep the ₹299 rate while the public price moves to ₹399.
7. Every message carries the cancel path (`DELETE` from the dashboard) because a reversible upgrade converts better than a locked one.

Target math: 1,000 channel subscribers → 250 terminal accounts at a 25% conversion → 50 paying VIP accounts at a 20% paid conversion. 50 × ₹299 = ₹14,950/month recurring, before affiliate commission on the same cohort.

---

## 9. Operations

- Ingest cadence: 30 minutes (`POST /api/cron/refresh-deals` with `Authorization: Bearer $CRON_SECRET`).
- Dispatch guard: the same listing is never re-sent to the same trigger inside six hours; a cycle caps at 20 dispatches.
- Sample retention: 180 days of history, pruned by `dealsniper_prune_old_samples` in Supabase or by the cache/session prune step locally.
- Monitoring: `GET /api/health` reports database reachability, cache footprint, rate-limiter backend, ingest counters and every integration's credential state in one response.
- On-demand cycle: the dashboard exposes a run button that posts to the cron endpoint with an optional browser-supplied `CRON_SECRET`.

---

## 10. Repository map

| Path | Role |
| --- | --- |
| `src/db/schema.ts` | Drizzle table definitions, indexes, inferred row types |
| `src/db/index.ts` | Pooled Postgres client |
| `src/lib/types.ts` | Domain types shared by server and client |
| `src/lib/env.ts` | Single environment reader with documented fallbacks |
| `src/lib/fallback-deals.ts` | 25-listing verified catalog, 90-day history generator, category and segment taxonomies |
| `src/lib/deal-score.ts` | Deal Score engine, glitch heuristics, commission rate table |
| `src/lib/seed.ts` | Idempotent catalog bootstrap with an advisory lock |
| `src/lib/ingest.ts` | Sampling pipeline, alert evaluation, dispatch, pruning |
| `src/lib/queries.ts` | Deal DTO mapping, filtered feed, statistics, click analytics |
| `src/lib/cache.ts` | Redis-first, Postgres-backed cache-aside helper |
| `src/lib/ratelimit.ts` | Upstash sliding window with an in-process fallback |
| `src/lib/rapidapi.ts` | Typed RapidAPI client: product detail, search, barcode, 30-minute cache |
| `src/lib/affiliate.ts` | Tag resolution, IP hashing, bot filtering, commission estimates |
| `src/lib/notify.ts` | Resend email, Telegram, WhatsApp Cloud, Loops/Resend CRM sync |
| `src/lib/billing.ts` | Razorpay/Stripe signature verification, subscription state application, activation tokens |
| `src/lib/plans.ts` | Client-safe plan copy |
| `src/lib/seo.ts` | JSON-LD builders and the programmatic path space |
| `src/lib/auth/session.ts` | Magic-link tokens, session creation, cookie parsing, revocation |
| `src/lib/auth/current-user.ts` | Session resolution (Supabase first, then Postgres), quota increments, Pro flips |
| `src/lib/supabase/client.ts`, `server.ts` | Supabase SSR clients with cookie storage |
| `src/components/*` | Navigation, ticker, hero, grid, card, chart, modals, alert manager, footer, smooth scroll, modals host |
| `src/app/api/*` | Feed, history, affiliate redirect, alerts, newsletter, auth, billing, webhooks, cron, OG, health |
| `src/app/*` | Landing terminal, listing detail, programmatic segment pages, dashboard, alerts, login, callback, sitemap, robots, 404 |
| `src/proxy.ts` | Next.js 16 network boundary protecting `/dashboard` and `/alerts` |

---

## 11. Local run

```bash
npx drizzle-kit push        # create the tables
npm run dev                 # http://localhost:3000
npm run build && npm start   # production
```

The catalog seeds itself on the first request (advisory-locked, idempotent). Sign in from `/login` with any address: without `RESEND_API_KEY` the response returns a preview link that completes the session. The dashboard exposes the on-demand ingest cycle so price movement, trigger matches and dispatch logs can be produced without waiting for the scheduler.
