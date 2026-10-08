"use client";

import { useEffect, useState } from "react";

import { formatCountdown } from "@/lib/format";

/**
 * Deal window countdown. Listings are published in eight-hour claim windows aligned to the
 * ingest cycle, so the timer counts down to the next window boundary and refreshes every
 * second without re-rendering the parent grid.
 */
export default function Countdown({ windowHours = 8 }: { windowHours?: number }) {
  const [label, setLabel] = useState<string>("--:--:--");

  useEffect(() => {
    const computeExpiry = () => {
      const now = Date.now();
      const windowMs = windowHours * 3_600_000;
      return Math.ceil(now / windowMs) * windowMs;
    };

    const tick = () => setLabel(formatCountdown(computeExpiry()));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [windowHours]);

  return <span className="mono text-[12px] text-muted">{label}</span>;
}
