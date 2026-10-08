import type { NextRequest } from "next/server";

import { clientIpFromHeaders, hashIp } from "@/lib/affiliate";
import { issueMagicLink } from "@/lib/auth/session";
import { magicLinkDeliveryMode, resendApiKey, siteUrl } from "@/lib/env";
import { sendEmail } from "@/lib/notify";
import { enforceRateLimit, rateLimitHeaders } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * POST /api/auth/magic-link
 *
 * Issues a single-use sign-in token valid for 15 minutes. When RESEND_API_KEY is set the
 * link is emailed; otherwise `delivery` is `preview_link` and the URL is returned in the
 * response so a self-hosted operator can sign in without configuring a mail provider.
 */
export async function POST(request: NextRequest) {
  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const decision = await enforceRateLimit("magic_link", `ip:${ipHash}`, false);
  if (!decision.allowed) {
    return Response.json(
      { ok: false, error: "Sign-in link requests are limited to 5 per 10 minutes.", code: "rate_limited" },
      { status: 429, headers: rateLimitHeaders(decision) },
    );
  }

  let body: { email?: unknown; next?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; next?: unknown };
  } catch (error) {
    return Response.json(
      { ok: false, error: `Request body must be valid JSON (${String(error)})`, code: "invalid_body" },
      { status: 400 },
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) {
    return Response.json({ ok: false, error: "A valid email address is required.", code: "invalid_email" }, { status: 400 });
  }

  const nextPath = typeof body.next === "string" && body.next.startsWith("/") ? body.next.slice(0, 120) : "/dashboard";

  try {
    const record = await issueMagicLink(email, { purpose: nextPath === "/dashboard" ? "magic_link" : "magic_link_redirect" });
    // Prefer the configured public origin; otherwise use the origin that served this
    // request so local and preview deployments produce a working link.
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin || siteUrl();
    const verifyUrl = `${origin}/api/auth/verify?token=${encodeURIComponent(record.token)}&next=${encodeURIComponent(nextPath)}`;
    const mode = magicLinkDeliveryMode();

    if (mode === "email") {
      const delivery = await sendEmail({
        to: email,
        subject: "Your DealSniper AI sign-in link",
        html: renderMagicLinkHtml(verifyUrl),
        text: `Sign in to DealSniper AI: ${verifyUrl}\nThis link expires in 15 minutes and can be used once.`,
        tags: ["magic-link"],
      });

      if (delivery.status === "failed") {
        return Response.json(
          { ok: false, error: `Sign-in email could not be delivered (${delivery.detail}).`, code: "delivery_failed" },
          { status: 502, headers: rateLimitHeaders(decision) },
        );
      }

      return Response.json(
        {
          ok: true,
          delivery: "email",
          email,
          expiresAt: record.expiresAt.toISOString(),
          provider: resendApiKey() ? "resend" : "none",
        },
        { headers: rateLimitHeaders(decision) },
      );
    }

    return Response.json(
      {
        ok: true,
        delivery: "preview_link",
        email,
        verifyUrl,
        expiresAt: record.expiresAt.toISOString(),
        note: "RESEND_API_KEY is not configured, so the verification URL is returned directly. Set RESEND_API_KEY to deliver this by email only.",
      },
      { headers: rateLimitHeaders(decision) },
    );
  } catch (error) {
    console.error("[api/auth/magic-link] failure", { email, error: String(error) });
    return Response.json({ ok: false, error: "Sign-in link generation failed.", code: "internal_error" }, { status: 500 });
  }
}

function renderMagicLinkHtml(verifyUrl: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;background:#08090e;font-family:Inter,Segoe UI,system-ui,sans-serif;color:#e7e9ee">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#08090e;padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#11131c;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:28px">
        <tr><td style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#10b981">DealSniper AI</td></tr>
        <tr><td style="padding-top:14px;font-size:22px;font-weight:600;line-height:1.3">Sign in to your deal terminal</td></tr>
        <tr><td style="padding-top:12px;font-size:14px;line-height:1.65;color:#9aa3b2">
          The link below authenticates this device and expires in 15 minutes. It works once.
        </td></tr>
        <tr><td style="padding-top:22px">
          <a href="${verifyUrl}" style="display:inline-block;background:#10b981;color:#04150f;font-weight:600;font-size:14px;text-decoration:none;padding:13px 22px;border-radius:10px">Open my terminal</a>
        </td></tr>
        <tr><td style="padding-top:20px;font-size:12px;line-height:1.6;color:#6b7480">
          If the button does not respond, paste this URL into the browser: <br />${verifyUrl}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
