import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

import { db } from "@/db";
import { userAlerts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/alerts/[id]  — pauses or resumes a trigger.
 * DELETE /api/alerts/[id] — removes a trigger and frees the quota slot.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Sign in to manage alert triggers.", code: "unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ ok: false, error: "Alert id must be a UUID", code: "invalid_id" }, { status: 400 });
  }

  let isActive = true;
  try {
    const body = (await request.json()) as { isActive?: unknown };
    isActive = body.isActive !== false;
  } catch {
    return Response.json({ ok: false, error: "Request body must include isActive", code: "invalid_body" }, { status: 400 });
  }

  try {
    const updated = await db
      .update(userAlerts)
      .set({ isActive })
      .where(and(eq(userAlerts.id, id), eq(userAlerts.userId, user.id)))
      .returning({ id: userAlerts.id, isActive: userAlerts.isActive });

    if (updated.length === 0) {
      return Response.json({ ok: false, error: "Alert not found for this account", code: "not_found" }, { status: 404 });
    }

    return Response.json({ ok: true, alert: updated[0] });
  } catch (error) {
    console.error("[api/alerts/[id]] update failed", { id, error: String(error) });
    return Response.json({ ok: false, error: "Alert update failed.", code: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ ok: false, error: "Sign in to manage alert triggers.", code: "unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return Response.json({ ok: false, error: "Alert id must be a UUID", code: "invalid_id" }, { status: 400 });
  }

  try {
    const removed = await db
      .delete(userAlerts)
      .where(and(eq(userAlerts.id, id), eq(userAlerts.userId, user.id)))
      .returning({ id: userAlerts.id });

    if (removed.length === 0) {
      return Response.json({ ok: false, error: "Alert not found for this account", code: "not_found" }, { status: 404 });
    }

    return Response.json({ ok: true, removed: removed[0].id });
  } catch (error) {
    console.error("[api/alerts/[id]] delete failed", { id, error: String(error) });
    return Response.json({ ok: false, error: "Alert deletion failed.", code: "internal_error" }, { status: 500 });
  }
}
