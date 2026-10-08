"use client";

import { BellPlus, Sparkles } from "lucide-react";
import { useState } from "react";

import AlertModal from "@/components/AlertModal";
import type { Deal } from "@/lib/types";

/** Deal-detail controls: alert trigger and VIP upsell, both client side. */
export default function DealDetailActions({ deal }: { deal: Deal }) {
  const [alertOpen, setAlertOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setAlertOpen(true)} className="btn">
        <BellPlus className="h-3.5 w-3.5" /> Alert me below a target price
      </button>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("dealsniper:open-pricing"))}
        className="btn btn-ghost"
      >
        <Sparkles className="h-3.5 w-3.5" /> VIP Pro instant pings
      </button>
      <AlertModal deal={alertOpen ? deal : null} onClose={() => setAlertOpen(false)} />
    </div>
  );
}
