"use client";

import { LayoutDashboard, LogOut, Menu, Radio, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import DealTicker from "@/components/DealTicker";
import type { Deal } from "@/lib/types";

interface SessionPayload {
  authenticated: boolean;
  user: { id: string; email: string; fullName: string | null } | null;
  tier: { isPro: boolean; planTier: string; delaySeconds: number } | null;
}

const NAV_LINKS = [
  { href: "/deals/computing/40-percent-off", label: "Computing" },
  { href: "/deals/audio/30-percent-off", label: "Audio" },
  { href: "/deals/gaming/40-percent-off", label: "Gaming" },
  { href: "/deals/footwear/40-percent-off", label: "Footwear" },
];

/**
 * Navigation with a live deal ticker, condensed search, tier badge and session-aware
 * account control. Session state is fetched from /api/auth/session so the layout keeps
 * static rendering for the programmatic SEO pages.
 */
export default function Navigation({ initialDeals = [] }: { initialDeals?: Deal[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [query, setQuery] = useState(searchParams.get("search") ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const initialQuery = useMemo(() => searchParams.get("search") ?? "", [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as SessionPayload & { ok: boolean };
        if (!cancelled) setSession(payload);
      } catch (error) {
        console.warn("[navigation] session probe failed", String(error));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = query.trim();
    router.push(term.length > 0 ? `/?search=${encodeURIComponent(term)}#terminal` : "/#terminal");
    setMobileOpen(false);
  };

  const openPricing = () => {
    window.dispatchEvent(new CustomEvent("dealsniper:open-pricing"));
    setMobileOpen(false);
  };

  const openNewsletter = () => {
    window.dispatchEvent(new CustomEvent("dealsniper:open-newsletter"));
    setMobileOpen(false);
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST", headers: { accept: "application/json" } });
      setSession({ authenticated: false, user: null, tier: null });
      router.push("/");
      router.refresh();
    } catch (error) {
      console.error("[navigation] sign out failed", String(error));
    } finally {
      setSigningOut(false);
    }
  };

  const isPro = session?.tier?.isPro === true;

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-obsidian/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-deal text-[13px] font-bold text-[#04150f]">DS</span>
          <span className="hidden flex-col leading-none sm:flex">
            <span className="text-[15px] font-semibold tracking-tight">DealSniper AI</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-faint">price drop radar</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-white/[0.05] hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="relative hidden flex-1 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder="Search a product, brand or ASIN (Sony WH-1000XM5, keychron, B0CX23V2ZK)"
            aria-label="Search tracked deals"
            className="input pl-9"
          />
        </form>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={openNewsletter} className="btn btn-ghost hidden xl:inline-flex">
            <Radio className="h-3.5 w-3.5" />
            Daily 10 Glitch Drops
          </button>

          {isPro ? (
            <span className="chip chip-vip hidden sm:inline-flex">
              <Sparkles className="h-3 w-3" /> VIP Pro
            </span>
          ) : (
            <button type="button" onClick={openPricing} className="btn btn-primary hidden sm:inline-flex">
              <Sparkles className="h-3.5 w-3.5" />
              Go VIP Pro
            </button>
          )}

          {session?.authenticated && session.user ? (
            <div className="flex items-center gap-2">
              <Link href="/dashboard" className="btn btn-ghost hidden sm:inline-flex">
                <LayoutDashboard className="h-3.5 w-3.5" />
                Dashboard
              </Link>
              <button type="button" onClick={signOut} disabled={signingOut} className="btn btn-ghost h-9 w-9 p-0" aria-label="Sign out">
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Link href="/login" className="btn">
              Sign in
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="btn btn-ghost h-9 w-9 p-0 lg:hidden"
            aria-expanded={mobileOpen}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="border-t border-white/[0.06] bg-[#0a0b11] px-4 py-1.5 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1440px] items-center gap-3">
          <span className="flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-deal">
            <span className="live-dot" /> live
          </span>
          <DealTicker initialDeals={initialDeals} />
        </div>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/[0.08] bg-surface px-4 py-4 lg:hidden">
          <form onSubmit={submitSearch} className="relative mb-3 md:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search tracked deals"
              aria-label="Search tracked deals"
              className="input pl-9"
            />
          </form>
          <div className="grid gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/[0.05] hover:text-ink"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/alerts"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white/[0.05] hover:text-ink"
            >
              Alert triggers
            </Link>
            <button type="button" onClick={openPricing} className="btn btn-primary mt-2 justify-start">
              <Sparkles className="h-3.5 w-3.5" /> Compare Free and VIP Pro
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
