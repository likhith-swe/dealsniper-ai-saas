import { getClickAnalytics } from "@/lib/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { freeDelaySeconds, isSupabaseConfigured, vipDelaySeconds } from "@/lib/env";
import { magicLinkDeliveryMode } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/auth/session
 *
 * Session probe for client components. Returns the signed-in profile, the publication
 * delay that caller receives, and a permanent-click count so the navigation bar can render
 * the correct tier without server-rendering the whole tree from cookies.
 */
export async function GET() {
  const user = await getCurrentUser();
  const delaySeconds = user?.isPro ? vipDelaySeconds() : freeDelaySeconds();

  if (!user) {
    return Response.json({
      ok: true,
      authenticated: false,
      user: null,
      tier: {
        isPro: false,
        planTier: "free",
        delaySeconds,
        alertQuota: 3,
      },
      integrations: {
        googleOAuth: isSupabaseConfigured(),
        magicLinkDelivery: magicLinkDeliveryMode(),
      },
    });
  }

  const analytics = await getClickAnalytics(user.id, 30);

  return Response.json({
    ok: true,
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      provider: user.provider,
    },
    tier: {
      isPro: user.isPro,
      planTier: user.planTier,
      delaySeconds,
      alertQuota: user.isPro ? null : 3,
      customAlertsCount: user.customAlertsCount,
    },
    analytics,
    integrations: {
      googleOAuth: isSupabaseConfigured(),
      magicLinkDelivery: magicLinkDeliveryMode(),
    },
  });
}
