import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { formatMoney } from "@/lib/format";
import { getDealByAsin } from "@/lib/queries";
import { scoreTier } from "@/lib/deal-score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAND = {
  obsidian: "#08090E",
  surface: "#11131C",
  emerald: "#10B981",
  text: "#E7E9EE",
  muted: "#9AA3B2",
};

/**
 * GET /api/og?asin=B09XS7JWHH&title=...&price=...&discount=...&score=...
 *
 * Share card generator. When an ASIN is supplied the card is rendered from live database
 * values; otherwise the query strings are used so Telegram and WhatsApp previews render
 * without a database round trip.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const asin = params.get("asin");

  let title = params.get("title") ?? "DealSniper AI — real-time price drop radar";
  let priceLabel = params.get("price") ?? "Live deals";
  let discount = Number.parseInt(params.get("discount") ?? "0", 10);
  let cutLabel = params.get("cut") ?? "";
  let score = Number.parseInt(params.get("score") ?? "0", 10);
  let currencyLabel = params.get("currency") ?? "INR";

  if (asin) {
    try {
      const deal = await getDealByAsin(asin);
      if (deal) {
        title = deal.title;
        priceLabel = formatMoney(deal.currentPriceMinor, deal.currency);
        discount = deal.discountPercent;
        cutLabel = `was ${formatMoney(deal.originalPriceMinor, deal.currency)}`;
        score = deal.dealScore;
        currencyLabel = deal.currency;
      }
    } catch (error) {
      console.warn("[api/og] live deal lookup failed, using query parameters", { asin, error: String(error) });
    }
  }

  const tier = score > 0 ? scoreTier(score) : null;
  const safeTitle = title.length > 96 ? `${title.slice(0, 93)}...` : title;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px",
          background: `radial-gradient(120% 120% at 12% 0%, #12261f 0%, ${BRAND.obsidian} 46%, ${BRAND.obsidian} 100%)`,
          color: BRAND.text,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: BRAND.emerald,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#04150F",
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              DS
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>DealSniper AI</span>
              <span style={{ fontSize: 15, color: BRAND.muted }}>Price drop and coupon-glitch radar</span>
            </div>
          </div>
          {tier ? (
            <div
              style={{
                display: "flex",
                padding: "10px 18px",
                borderRadius: 999,
                border: `1px solid ${BRAND.emerald}`,
                color: BRAND.emerald,
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {tier} · {score}/100
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 980 }}>
          <span style={{ fontSize: 46, fontWeight: 650, lineHeight: 1.15, letterSpacing: -1 }}>{safeTitle}</span>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 22 }}>
            <span style={{ fontSize: 64, fontWeight: 700, color: BRAND.emerald, letterSpacing: -2 }}>{priceLabel}</span>
            {discount > 0 ? (
              <span
                style={{
                  display: "flex",
                  padding: "10px 18px",
                  borderRadius: 12,
                  background: BRAND.emerald,
                  color: "#04150F",
                  fontSize: 30,
                  fontWeight: 700,
                }}
              >
                -{discount}%
              </span>
            ) : null}
            {cutLabel ? <span style={{ fontSize: 24, color: BRAND.muted, paddingBottom: 12 }}>{cutLabel}</span> : null}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 20, color: BRAND.muted }}>
          <span>90-day price chart · stock drain rate · coupon stack modelled</span>
          <span style={{ color: BRAND.text }}>
            {currencyLabel} · dealsniper.ai {asin ? `· ${asin}` : ""}
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=600" },
    },
  );
}
