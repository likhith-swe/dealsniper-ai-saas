import type { NextRequest } from "next/server";

import { runIngestCycle, verifyCronAuthorization } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/cron/refresh-deals   (GET is accepted for scheduler compatibility)
 *
 * Price ingest cycle: refreshes every tracked listing from RapidAPI when a key is
 * configured, advances the deterministic market model otherwise, recomputes Deal Scores,
 * appends price samples, evaluates subscriber triggers, dispatches notifications and
 * prunes expired cache and session rows.
 *
 * Authorization: `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is configured.
 * Without the secret the route reports `authorizationMode: "open"` in the response so an
 * operator can see that the endpoint is unauthenticated.
 */
async function handle(request: NextRequest) {
  const authorization = verifyCronAuthorization(request.headers.get("authorization"));
  if (!authorization.authorized) {
    return Response.json(
      { ok: false, error: "Authorization header must carry the CRON_SECRET bearer token.", code: "unauthorized" },
      { status: 401 },
    );
  }

  try {
    const options = request.nextUrl.searchParams;
    const limitParam = options.get("limit");
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    const summary = await runIngestCycle({
      ...(Number.isFinite(parsedLimit) ? { limit: parsedLimit } : {}),
      dryRun: options.get("dryRun") === "true",
    });

    return Response.json(
      {
        ok: true,
        summary,
        authorizationMode: authorization.mode,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[api/cron/refresh-deals] ingest failure", { error: String(error) });
    return Response.json(
      { ok: false, error: `Ingest cycle failed: ${String(error)}`, code: "internal_error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
