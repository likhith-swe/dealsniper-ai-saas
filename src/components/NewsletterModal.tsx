"use client";

import { Mail } from "lucide-react";
import { useState } from "react";

import Modal from "@/components/Modal";

export interface NewsletterModalProps {
  open: boolean;
  onClose: () => void;
  sourcePage?: string;
}

interface SubscribeResponse {
  ok: boolean;
  alreadySubscribed?: boolean;
  sendTime?: string;
  sponsorSlotRate?: string;
  crm?: { provider: string; status: string; detail: string };
  error?: string;
}

const INTERESTS = ["computing", "audio", "gaming", "mobile", "kitchen", "footwear"];

/**
 * Lead capture for the Daily 10 Glitch Drops digest. Collects the address plus optional
 * category interests, writes the subscriber, and reports the CRM sync result so the operator
 * can see whether Loops.so or Resend accepted the contact.
 */
export default function NewsletterModal({ open, onClose, sourcePage = "home_modal" }: NewsletterModalProps) {
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<string[]>(["computing", "audio"]);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const toggleInterest = (tag: string) => {
    setInterests((previous) => (previous.includes(tag) ? previous.filter((entry) => entry !== tag) : [...previous, tag]));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setFeedback(null);

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ email, sourcePage, interestTags: interests }),
      });
      const payload = (await response.json()) as SubscribeResponse;

      if (!response.ok || !payload.ok) {
        setStatus("error");
        setFeedback(payload.error ?? `Subscription failed with status ${response.status}`);
        return;
      }

      setStatus("success");
      setFeedback(
        `${payload.alreadySubscribed ? "You are already on the list" : "Subscribed"}. Next send: ${payload.sendTime ?? "07:30 IST"}. CRM: ${
          payload.crm?.provider ?? "none"
        } (${payload.crm?.status ?? "queued"}). ${payload.crm?.detail ?? ""}`,
      );
    } catch (error) {
      setStatus("error");
      setFeedback(`Network failure: ${String(error)}`);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Daily 10 Glitch Drops"
      title="The ten biggest price errors, every morning at 07:30 IST"
      subtitle="One send per day, ten listings, the price history behind each one. Delivered before the same listings appear on the public terminal."
    >
      <form onSubmit={submit} className="grid gap-4">
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

        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Categories to prioritise</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTERESTS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleInterest(tag)}
                aria-pressed={interests.includes(tag)}
                className={`chip ${interests.includes(tag) ? "chip-deal" : ""}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </fieldset>

        {feedback ? (
          <p
            className={`rounded-lg border px-3 py-2 text-[12px] ${
              status === "success" ? "border-deal/40 bg-deal/10 text-deal" : "border-alert/40 bg-alert/10 text-alert"
            }`}
          >
            {feedback}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] pt-4">
          <p className="max-w-sm text-[11px] text-faint">
            Sponsor slot: one D2C brand per send at USD 50-90 CPM. Unsubscribe link on every email; addresses are stored in Postgres and
            mirrored to Loops.so or Resend.
          </p>
          <button type="submit" disabled={status === "submitting"} className="btn btn-primary">
            {status === "submitting" ? "Subscribing..." : "Send me the ten"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
