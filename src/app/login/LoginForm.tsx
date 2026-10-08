"use client";

import { Globe, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export interface LoginFormProps {
  nextPath: string;
  initialError: string | null;
  googleConfigured: boolean;
  deliveryMode: "email" | "preview_link";
}

interface MagicLinkResponse {
  ok: boolean;
  delivery?: "email" | "preview_link";
  verifyUrl?: string;
  expiresAt?: string;
  note?: string;
  error?: string;
  provider?: string;
}

const ERROR_COPY: Record<string, string> = {
  session_required: "That page requires a signed-in session.",
  missing_token: "The sign-in link was missing its token.",
  expired_or_used: "That sign-in link expired or was already used. Request a new one.",
  verification_failed: "The sign-in link could not be verified. Request a new one.",
  google_not_configured: "Google OAuth requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  missing_code: "The Google callback arrived without an authorization code.",
  code_exchange_failed: "Supabase rejected the Google authorization code.",
  callback_failed: "The Google callback could not be completed.",
  signin_required_for_upgrade: "Sign in first, then the VIP Pro activation link continues automatically.",
};

/**
 * Sign-in form: passwordless magic link plus Google OAuth when Supabase is configured. In
 * preview-link mode the returned verification URL is rendered as a button so a self-hosted
 * operator can complete the flow without a mail provider.
 */
export default function LoginForm({ nextPath, initialError, googleConfigured, deliveryMode }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">(initialError ? "error" : "idle");
  const [feedback, setFeedback] = useState<string | null>(initialError ? ERROR_COPY[initialError] ?? initialError : null);
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setFeedback(null);
    setVerifyUrl(null);

    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, next: nextPath }),
      });
      const payload = (await response.json()) as MagicLinkResponse;

      if (!response.ok || !payload.ok) {
        setStatus("error");
        setFeedback(payload.error ?? `Request failed with status ${response.status}`);
        return;
      }

      setStatus("sent");
      if (payload.delivery === "preview_link" && payload.verifyUrl) {
        setVerifyUrl(payload.verifyUrl);
        setFeedback(payload.note ?? "Email delivery is not configured; use the button below to finish signing in.");
      } else {
        setFeedback(`Sign-in link sent to ${email}. It expires in 15 minutes and works once.`);
      }
    } catch (error) {
      setStatus("error");
      setFeedback(`Network failure: ${String(error)}`);
    }
  };

  return (
    <div className="panel w-full max-w-md p-6">
      <span className="chip chip-deal">Account</span>
      <h1 className="mt-3 text-[22px] font-semibold tracking-tight">Sign in to the deal terminal</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Sessions are server-side. The cookie carries an opaque session id and a secret whose hash is stored in Postgres; nothing else leaves
        the account row.
      </p>

      <form onSubmit={submit} className="mt-5 grid gap-3">
        <label>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Email address</span>
          <div className="relative mt-1.5">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="input pl-9"
            />
          </div>
        </label>

        <button type="submit" disabled={status === "submitting"} className="btn btn-primary w-full">
          {status === "submitting" ? "Sending..." : "Send magic link"}
        </button>
      </form>

      {verifyUrl ? (
        <a href={verifyUrl} className="btn mt-3 w-full">
          <ShieldCheck className="h-3.5 w-3.5" /> Open my sign-in link
        </a>
      ) : null}

      {feedback ? (
        <p
          className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${
            status === "error" ? "border-alert/40 bg-alert/10 text-alert" : "border-deal/40 bg-deal/10 text-deal"
          }`}
        >
          {feedback}
        </p>
      ) : null}

      <div className="mt-5 border-t border-white/[0.08] pt-4">
        {googleConfigured ? (
          <a href={`/api/auth/google?next=${encodeURIComponent(nextPath)}`} className="btn w-full">
            <Globe className="h-3.5 w-3.5" /> Continue with Google
          </a>
        ) : (
          <p className="text-[11px] leading-relaxed text-faint">
            Google OAuth is unavailable until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are configured. The magic link above
            works without Supabase.
          </p>
        )}
      </div>

      <p className="mt-4 text-[11px] text-faint">
        Delivery mode: <span className="mono">{deliveryMode === "email" ? "resend" : "preview link"}</span>.{" "}
        <Link href="/" className="text-muted underline decoration-dotted hover:text-ink">
          Return to the terminal
        </Link>
      </p>
    </div>
  );
}
