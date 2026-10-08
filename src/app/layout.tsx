import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import Footer from "@/components/Footer";
import GlobalModals from "@/components/GlobalModals";
import Navigation from "@/components/Navigation";
import SmoothScroll from "@/components/SmoothScroll";
import { siteUrl, vipPrice } from "@/lib/env";
import "./globals.css";

const SITE_DESCRIPTION =
  "DealSniper AI tracks Amazon India and Amazon US listings every 30 minutes, scores price anomalies against the trailing 90-day average, and dispatches zero-second Telegram and WhatsApp alerts on confirmable drops.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "DealSniper AI — real-time price drop, coupon glitch and arbitrage radar",
    template: "%s | DealSniper AI",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "price drop tracker",
    "Amazon deal aggregator",
    "coupon stacking",
    "price history chart",
    "arbitrage radar",
    "Deal Score",
  ],
  openGraph: {
    type: "website",
    siteName: "DealSniper AI",
    title: "DealSniper AI — real-time price drop and coupon glitch radar",
    description: SITE_DESCRIPTION,
    url: siteUrl(),
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "DealSniper AI live deal terminal" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DealSniper AI — live price drop terminal",
    description: SITE_DESCRIPTION,
    images: ["/api/og"],
  },
  robots: { index: true, follow: true },
  category: "shopping",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-obsidian font-sans text-ink antialiased">
        <SmoothScroll />
        <Suspense
          fallback={
            <div className="sticky top-0 z-50 h-[104px] border-b border-white/[0.08] bg-obsidian/85 backdrop-blur-xl" aria-hidden="true" />
          }
        >
          <Navigation />
        </Suspense>
        <main className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-4 sm:px-6 lg:px-8">{children}</main>
        <Footer />
        <GlobalModals priceInrMinor={vipPrice().inrMinor} priceUsdMinor={vipPrice().usdMinor} />
      </body>
    </html>
  );
}
