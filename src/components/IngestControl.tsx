"use client";

import { PlayCircle, Sparkles } from "lucide-react";
import { useState } from "react";

interface IngestSummary {
  mode: string;
  runCount: number;
  dealsProcessed: number;
  priceChanges: number;
  newLows: number;
  historyPoints: number;
  alertsMatched: number;
  alertsDelivered: number;
  alertsQueued: number;
  cacheEntriesPruned: number;
  sessionsPruned: number;
  durationMs: number;
  upstreamErrors: number;
}

interface IngestResponse {
  ok: boolean;
  summary?: IngestSummary;
  error?: string;
  code?: string;
  authorizationMode?: string;
}

/**
 * Operator control: runs the ingest cycle on demand and reports the summary. When
 * CRON_SECRET is configured the request carries it from the browser session form field.
 */
export default function IngestControl({ cronSecretConfigured }: { cronSecretConfigured: boolean }) {
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<IngestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setSummary(null);

    try {
      const response = await fetch("/api/cron/refresh-deals", {
        method: "POST",
        headers: {
          accept: "application/json",
          ...(secret.trim().length > 0 ? { authorization: `Bearer ${secret.trim()}` } : {}),
        },
      });
      const payload = (await response.json()) as IngestResponse;

      if (!response.ok || !payload.ok || !payload.summary) {
        setError(payload.error ?? `Ingest responded ${response.status}`);
        return;
      }
      setSummary(payload.summary);
    } catch (caught) {
      setError(`Network failure: ${String(caught)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Ingest cycle</h2>
          <p className="mt-1 text-[12px] text-muted">
            Refreshes prices, recomputes Deal Scores, appends samples, evaluates triggers and prunes expired cache rows.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cronSecretConfigured ? (
            <input
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="CRON_SECRET"
              className="input max-w-[180px]"
              aria-label="Cron secret"
            />
          ) : null}
          <button type="button" onClick={run} disabled={busy} className="btn btn-primary">
            <PlayCircle className="h-3.5 w-3.5" /> {busy ? "Running..." : "Run cycle now"}
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("dealsniper:open-pricing"))}
            className="btn"
          >
            <Sparkles className="h-3.5 w-3.5" /> Plans
          </button>
        </div>
      </header>

      {error ? <p className="mt-3 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[12px] text-alert">{error}</p> : null}

      {summary ? (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-4">
          <Metric label="Mode" value={summary.mode} />
          <Metric label="Cycle" value={`#${summary.runCount}`} />
          <Metric label="Listings refreshed" value={String(summary.dealsProcessed)} />
          <Metric label="Price changes" value={String(summary.priceChanges)} />
          <Metric label="New 90-day lows" value={String(summary.newLows)} />
          <Metric label="Samples written" value={String(summary.historyPoints)} />
          <Metric label="Triggers matched" value={String(summary.alertsMatched)} />
          <Metric label="Delivered / queued" value={`${summary.alertsDelivered} / ${summary.alertsQueued}`} />
          <Metric label="Cache rows pruned" value={String(summary.cacheEntriesPruned)} />
          <Metric label="Sessions pruned" value={String(summary.sessionsPruned)} />
          <Metric label="Upstream errors" value={String(summary.upstreamErrors)} />
          <Metric label="Duration" value={`${summary.durationMs} ms`} />
        </dl>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-2 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</dt>
      <dd className="mono mt-1 text-[13px] font-semibold text-ink">{value}</dd>
    </div>
  );
}
