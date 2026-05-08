/**
 * Fire-and-forget event emitter (v1.5 Phase 5).
 *
 * CONTRACT — read this before adding emit calls:
 *
 *   1. emitEvent NEVER throws. Internal try/catch swallows DB errors so
 *      a failed events insert can't break order processing, DNA recompute,
 *      or any other parent operation. Events are observability, not state.
 *
 *   2. Callers MUST still wrap with try/catch defensively. Belt-and-braces:
 *      if a future refactor makes emitEvent throw, parent code still
 *      survives. Pattern:
 *
 *        try { await emitEvent(pg, {...}); } catch { /* never blocks * / }
 *
 *   3. Pass `dedupeKey` for any event with a natural unique key (Shopify
 *      order ID, etc.). ON CONFLICT (dedupe_key) DO NOTHING means webhook
 *      retries from Shopify don't create duplicate activity entries.
 *
 *   4. `payload` is denormalized at emit time — include customer_name,
 *      order_total, etc. so the render helper never JOINs to other tables.
 *      GDPR-critical: when a customer is deleted, their historical events
 *      still render from the cached payload.
 */

import type { Client } from "pg";
import type { EmitParams } from "./types";

export async function emitEvent(pg: Client, params: EmitParams): Promise<void> {
  try {
    await pg.query(
      `INSERT INTO public.events
         (merchant_id, event_type, entity_type, entity_id,
          actor_type, actor_id, dedupe_key, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [
        params.merchantId,
        params.eventType,
        params.entityType ?? null,
        params.entityId ?? null,
        params.actorType ?? "system",
        params.actorId ?? null,
        params.dedupeKey ?? null,
        JSON.stringify(params.payload),
      ]
    );
  } catch (err) {
    // Never throw — events are NEVER in the critical path.
    // Logged via console.error → lands in Vercel log explorer. Trivial swap
    // to Sentry.captureException() once Sentry is wired up.
    console.error(
      `[emitEvent] failed silently (event_type=${params.eventType} merchant=${params.merchantId}):`,
      err instanceof Error ? err.message : err
    );
  }
}
