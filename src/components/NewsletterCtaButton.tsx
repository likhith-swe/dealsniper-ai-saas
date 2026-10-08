"use client";

import { Mail } from "lucide-react";

/** Client trigger for the newsletter modal, used from server-rendered sections. */
export default function NewsletterCtaButton({ label = "Get the ten" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("dealsniper:open-newsletter"))}
      className="btn btn-primary"
    >
      <Mail className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
