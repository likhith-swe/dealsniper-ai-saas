"use client";

import { Sparkles } from "lucide-react";

/** Client trigger for the pricing modal, usable from server-rendered pages. */
export default function PricingCtaButton({
  label = "Compare plans",
  primary = false,
}: {
  label?: string;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("dealsniper:open-pricing"))}
      className={`btn ${primary ? "btn-primary" : ""}`}
    >
      <Sparkles className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
