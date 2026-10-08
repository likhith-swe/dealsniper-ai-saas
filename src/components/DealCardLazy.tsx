"use client";

import { useState } from "react";

import AlertModal from "@/components/AlertModal";
import DealCard from "@/components/DealCard";
import PriceHistoryModal from "@/components/PriceHistoryModal";
import type { Deal } from "@/lib/types";

/**
 * Deal card with its own modal state. Used on server-rendered surfaces (listing detail,
 * landing sections) where the grid-level state provider is not mounted.
 */
export default function DealCardLazy({
  deal,
  highlight = "none",
}: {
  deal: Deal;
  highlight?: "none" | "sponsored" | "glitch";
}) {
  const [chartDeal, setChartDeal] = useState<Deal | null>(null);
  const [alertDeal, setAlertDeal] = useState<Deal | null>(null);

  return (
    <>
      <DealCard deal={deal} onOpenChart={setChartDeal} onOpenAlert={setAlertDeal} highlight={highlight} />
      <PriceHistoryModal deal={chartDeal} onClose={() => setChartDeal(null)} />
      <AlertModal deal={alertDeal} onClose={() => setAlertDeal(null)} />
    </>
  );
}
