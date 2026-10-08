import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import AlertManager from "@/components/AlertManager";
import { getCurrentUser } from "@/lib/auth/current-user";
import { freeTierAlertQuota } from "@/lib/env";
import { listUserAlerts } from "@/lib/queries";
import type { AlertRecord, Currency, NotificationChannel } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alert triggers",
  description: "Manage keyword price-drop triggers, delivery channels and thresholds for DealSniper AI alerts.",
  robots: { index: false, follow: false },
};

/** Trigger management surface. Requires a session; quota depends on plan tier. */
export default async function AlertsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/alerts&error=session_required");

  const rows = await listUserAlerts(user.id);
  const alerts: AlertRecord[] = rows.map((row) => ({
    id: row.id,
    keyword: row.keyword,
    targetPriceMinor: row.targetPriceMinor,
    currency: (row.currency === "USD" ? "USD" : "INR") as Currency,
    category: row.category,
    minDiscountPercent: row.minDiscountPercent,
    notifyChannel: row.notifyChannel as NotificationChannel,
    destination: row.destination,
    isActive: row.isActive,
    matchCount: row.matchCount,
    lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <div className="pt-4">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="chip">Triggers</span>
          <h1 className="mt-3 text-[26px] font-semibold tracking-tight">Price-drop alerts</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            Every active trigger is matched against the ingest cycle output. Telegram and WhatsApp delivery requires VIP Pro for immediate
            dispatch; email delivery is available on every plan.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard" className="btn">
            Dashboard
          </Link>
          <Link href="/#terminal" className="btn btn-primary">
            Browse the terminal
          </Link>
        </div>
      </header>

      <AlertManager
        initialAlerts={alerts}
        isPro={user.isPro}
        quota={user.isPro ? null : freeTierAlertQuota()}
        email={user.email}
      />
    </div>
  );
}
