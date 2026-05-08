/**
 * Resend wrapper — single place that knows how to send transactional email.
 *
 * Why Resend: clean API, free tier 3000/month, Vercel partnership.
 * Pricing: free → $20/mo for 50K emails (covers ~5K merchants on monthly digest cadence).
 *
 * Env vars required:
 *   RESEND_API_KEY  — generated at resend.com/api-keys
 *   EMAIL_FROM      — e.g. "LifecycleAI <reports@lifecycleai.app>"
 *                     domain must be verified in Resend dashboard before production
 */

import { Resend } from "resend";

let _client: Resend | null = null;

function getClient(): Resend {
  if (_client) return _client;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set. Add it to .env.local before sending email.");
  }
  _client = new Resend(apiKey);
  return _client;
}

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /**
   * Optional dedupe key. When set, Resend rejects duplicate sends with the
   * same key (standard Idempotency-Key semantics, ~24h dedupe window).
   * Use for any retry-on-network-failure code path: e.g.
   *   `monthly-report:${report.id}` so a partial-send retry can't double-deliver.
   * Per Resend docs, errors `invalid_idempotent_request` and
   * `concurrent_idempotent_requests` indicate dedupe rejection.
   */
  idempotencyKey?: string;
};

export type SendEmailResult = {
  ok: boolean;
  message_id?: string;
  error?: string;
  /** True when Resend rejected as a duplicate of a prior send with the same
   *  idempotency key. Caller treats this as "already sent" — not a failure. */
  deduped?: boolean;
};

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const from = process.env.EMAIL_FROM ?? "LifecycleAI <onboarding@resend.dev>";

  try {
    const client = getClient();
    const result = await client.emails.send(
      {
        from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {}),
        ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      },
      args.idempotencyKey ? { idempotencyKey: args.idempotencyKey } : undefined
    );

    if (result.error) {
      // Idempotency-rejection codes mean a prior send with this key already
      // succeeded — surface as deduped (caller writes emailed_at as if normal)
      const code = (result.error as { name?: string }).name;
      if (
        code === "invalid_idempotent_request" ||
        code === "concurrent_idempotent_requests"
      ) {
        console.warn(
          `[Resend] idempotency dedupe (key=${args.idempotencyKey}): ${result.error.message}`
        );
        return { ok: true, deduped: true };
      }
      console.error("[Resend] send failed:", result.error);
      return { ok: false, error: result.error.message };
    }

    return { ok: true, message_id: result.data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Resend] exception:", msg);
    return { ok: false, error: msg };
  }
}

/** Returns true iff RESEND_API_KEY is configured. UI uses this to gate "send a test" buttons. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
