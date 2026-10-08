"use client";

import { useEffect, useState } from "react";

import NewsletterModal from "@/components/NewsletterModal";
import PricingModal from "@/components/PricingModal";

interface SessionPayload {
  authenticated: boolean;
  user: { id: string; email: string } | null;
  tier: { isPro: boolean; planTier: string } | null;
}

/**
 * Mounts the pricing and newsletter modals once per session so any surface (navigation,
 * deal card, feature section, alert quota notice) can open them by dispatching a window
 * event instead of threading state through the component tree.
 */
export default function GlobalModals({ priceInrMinor, priceUsdMinor }: { priceInrMinor: number; priceUsdMinor: number }) {
  const [pricingOpen, setPricingOpen] = useState(false);
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;
        setSession((await response.json()) as SessionPayload);
      } catch (error) {
        console.warn("[modal-host] session probe failed", String(error));
      }
    };
    void loadSession();

    const onPricing = () => setPricingOpen(true);
    const onNewsletter = () => setNewsletterOpen(true);
    window.addEventListener("dealsniper:open-pricing", onPricing);
    window.addEventListener("dealsniper:open-newsletter", onNewsletter);

    return () => {
      window.removeEventListener("dealsniper:open-pricing", onPricing);
      window.removeEventListener("dealsniper:open-newsletter", onNewsletter);
    };
  }, []);

  return (
    <>
      <PricingModal
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        authenticated={session?.authenticated === true}
        isPro={session?.tier?.isPro === true}
        priceInrMinor={priceInrMinor}
        priceUsdMinor={priceUsdMinor}
        nextPath="/dashboard"
      />
      <NewsletterModal open={newsletterOpen} onClose={() => setNewsletterOpen(false)} sourcePage="newsletter_event" />
    </>
  );
}
