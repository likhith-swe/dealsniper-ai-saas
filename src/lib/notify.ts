import { resendApiKey, telegramBotToken } from "@/lib/env";

export interface DeliveryResult {
  channel: "email" | "telegram" | "whatsapp" | "log";
  status: "delivered" | "queued" | "failed" | "skipped";
  detail: string;
  latencyMs: number;
}

const FROM_ADDRESS = "alerts@dealsniper.ai";

async function timed<T>(work: () => Promise<T>): Promise<{ value: T; latencyMs: number }> {
  const started = Date.now();
  const value = await work();
  return { value, latencyMs: Date.now() - started };
}

/**
 * Transactional email through Resend. When RESEND_API_KEY is absent the message is
 * written to the server log and reported as `queued` so the alert pipeline records the
 * match without silently discarding it.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: string[];
}): Promise<DeliveryResult> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    console.info("[notify] email queued without provider", { to: input.to, subject: input.subject });
    return {
      channel: "email",
      status: "queued",
      detail: "RESEND_API_KEY is not configured; message logged for manual dispatch",
      latencyMs: 0,
    };
  }

  try {
    const { value, latencyMs } = await timed(async () => {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `DealSniper Alerts <${FROM_ADDRESS}>`,
          to: [input.to],
          subject: input.subject,
          html: input.html,
          text: input.text,
          tags: (input.tags ?? []).map((name) => ({ name, value: "true" })),
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`resend responded ${response.status}: ${body.slice(0, 200)}`);
      }
      return (await response.json()) as { id?: string };
    });
    return {
      channel: "email",
      status: "delivered",
      detail: `resend message ${value.id ?? "accepted"}`,
      latencyMs,
    };
  } catch (error) {
    return { channel: "email", status: "failed", detail: String(error), latencyMs: 0 };
  }
}

/** Telegram Bot API delivery. `destination` is a chat id or channel id (e.g. -1001234567890). */
export async function sendTelegramMessage(destination: string, text: string): Promise<DeliveryResult> {
  const token = telegramBotToken();
  const chatId = destination.trim();
  if (!token) {
    console.info("[notify] telegram queued without bot token", { chatId, preview: text.slice(0, 80) });
    return {
      channel: "telegram",
      status: "queued",
      detail: "TELEGRAM_BOT_TOKEN is not configured; message logged for manual dispatch",
      latencyMs: 0,
    };
  }
  if (chatId.length === 0) {
    return { channel: "telegram", status: "skipped", detail: "no chat id on the alert record", latencyMs: 0 };
  }

  try {
    const { value, latencyMs } = await timed(async () => {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`telegram responded ${response.status}: ${body.slice(0, 200)}`);
      }
      return (await response.json()) as { result?: { message_id?: number } };
    });
    return {
      channel: "telegram",
      status: "delivered",
      detail: `telegram message ${value.result?.message_id ?? "accepted"}`,
      latencyMs,
    };
  } catch (error) {
    return { channel: "telegram", status: "failed", detail: String(error), latencyMs: 0 };
  }
}

/**
 * WhatsApp delivery through the Cloud API. `destination` must be an E.164 number
 * without the leading plus. Uses the WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID
 * environment pair; when either is missing the delivery is recorded as queued.
 */
export async function sendWhatsAppMessage(destination: string, text: string): Promise<DeliveryResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN ?? null;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? null;
  const to = destination.replace(/[^0-9]/g, "");

  if (!accessToken || !phoneNumberId) {
    console.info("[notify] whatsapp queued without cloud api credentials", { to, preview: text.slice(0, 80) });
    return {
      channel: "whatsapp",
      status: "queued",
      detail: "WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID is not configured",
      latencyMs: 0,
    };
  }
  if (to.length < 8) {
    return { channel: "whatsapp", status: "skipped", detail: "destination is not a valid E.164 number", latencyMs: 0 };
  }

  try {
    const { value, latencyMs } = await timed(async () => {
      const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { preview_url: true, body: text },
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`whatsapp responded ${response.status}: ${body.slice(0, 200)}`);
      }
      return (await response.json()) as { messages?: { id?: string }[] };
    });
    return {
      channel: "whatsapp",
      status: "delivered",
      detail: `whatsapp message ${value.messages?.[0]?.id ?? "accepted"}`,
      latencyMs,
    };
  } catch (error) {
    return { channel: "whatsapp", status: "failed", detail: String(error), latencyMs: 0 };
  }
}

/**
 * Newsletter CRM sync. Loops.so is the primary CRM; Resend Contacts is the fallback.
 * The returned provider string is persisted so the operations dashboard can report which
 * system holds the subscriber list.
 */
export async function syncSubscriberToCrm(input: {
  email: string;
  source: string;
  interestTags: string[];
}): Promise<{ provider: "loops" | "resend" | "none"; status: "synced" | "queued" | "failed"; detail: string }> {
  const loopsKey = process.env.LOOPS_API_KEY ?? null;

  if (loopsKey) {
    try {
      const response = await fetch("https://app.loops.so/api/v1/contacts/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${loopsKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          source: input.source,
          userGroup: "deal-hunters",
          subscribed: true,
          dealCategories: input.interestTags.join(","),
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        return { provider: "loops", status: "failed", detail: `loops responded ${response.status}: ${body.slice(0, 160)}` };
      }
      return { provider: "loops", status: "synced", detail: "loops contact created" };
    } catch (error) {
      return { provider: "loops", status: "failed", detail: String(error) };
    }
  }

  const apiKey = resendApiKey();
  if (apiKey) {
    try {
      const response = await fetch("https://api.resend.com/contacts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: input.email,
          first_name: null,
          unsubscribed: false,
          audience_id: process.env.RESEND_AUDIENCE_ID ?? undefined,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        return { provider: "resend", status: "failed", detail: `resend responded ${response.status}: ${body.slice(0, 160)}` };
      }
      return { provider: "resend", status: "synced", detail: "resend contact created" };
    } catch (error) {
      return { provider: "resend", status: "failed", detail: String(error) };
    }
  }

  return {
    provider: "none",
    status: "queued",
    detail: "no CRM credentials configured; subscriber stored in Postgres for later sync",
  };
}

export interface AlertDispatchInput {
  alertId: string | null;
  userId: string | null;
  dealId: string;
  keyword: string;
  notifyChannel: "email" | "telegram" | "whatsapp";
  destination: string;
  dealTitle: string;
  currentPriceLabel: string;
  targetPriceLabel: string | null;
  discountPercent: number;
  claimUrl: string;
}

/**
 * Renders and dispatches a single alert match on the channel stored with the alert.
 * Returns the delivery result so the ingest cycle can persist a dispatch log row.
 */
export async function dispatchAlert(input: AlertDispatchInput): Promise<DeliveryResult> {
  const lines = [
    `<b>Price drop confirmed</b> — ${input.dealTitle}`,
    `Now ${input.currentPriceLabel} (${input.discountPercent}% off list)`,
    input.targetPriceLabel ? `Your target: ${input.targetPriceLabel}` : `Trigger keyword: ${input.keyword}`,
    `Claim: ${input.claimUrl}`,
    "DealSniper AI tracks this listing every 30 minutes and closes the alert when stock ends.",
  ];
  const body = lines.join("\n");
  const html = lines
    .map((line, index) => (index === 0 ? `<h2 style="margin:0 0 12px">${line}</h2>` : `<p style="margin:0 0 8px">${line}</p>`))
    .join("");

  switch (input.notifyChannel) {
    case "telegram":
      return sendTelegramMessage(input.destination, body);
    case "whatsapp":
      return sendWhatsAppMessage(input.destination, body.replace(/<\/?b>/g, "*"));
    case "email":
    default:
      if (!input.destination.includes("@")) {
        return { channel: "email", status: "skipped", detail: "alert destination is not an email address", latencyMs: 0 };
      }
      return sendEmail({
        to: input.destination,
        subject: `${input.keyword}: now ${input.currentPriceLabel}`,
        html,
        text: body.replace(/<\/?b>/g, ""),
        tags: ["price-drop", input.keyword.slice(0, 24)],
      });
  }
}
