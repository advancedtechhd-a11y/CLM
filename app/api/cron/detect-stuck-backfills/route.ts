/**
 * Daily cron — detect-stuck-backfills (v1.5 Phase 3.5+)
 *
 * Schedule: 6am UTC — see vercel.json
 *
 * Finds merchants whose health backfill chain has silently dropped:
 *   * health_backfill_status = 'in_progress'
 *   * health_backfill_last_chunk_at < NOW() - INTERVAL '1 hour'
 *
 * Worst-case legitimate runtime is ~30 min for a 100K-customer merchant
 * (9 chunks × ~3 min). One hour is comfortably past that — no progress
 * for an hour means the fire-and-forget chain dropped a chunk.
 *
 * Recovery policy:
 *   * recovery_attempts < 3 → increment counter, re-fire the next chunk,
 *     status stays 'in_progress' (widget UI doesn't flap)
 *   * recovery_attempts >= 3 → mark 'failed' with diagnostic message in
 *     health_backfill_error so manual handling is obvious
 *
 * Observability: console.error with merchant_id + chunks_completed +
 * attempt #. Lands in Vercel log explorer. Trivial swap to
 * Sentry.captureException once Sentry is wired up.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import {
  DEFAULT_TOTAL_CHUNKS,
  DEFAULT_DAYS_PER_CHUNK,
  DEFAULT_DAYS,
} from "@/lib/metrics/historical-backfill";

export const maxDuration = 60;

const STUCK_THRESHOLD = "1 hour";
const MAX_RECOVERY_ATTEMPTS = 3;

type StuckMerchant = {
  id: string;
  shop_domain: string;
  health_backfill_chunks_completed: number;
  health_backfill_chunks_total: number | null;
  health_backfill_recovery_attempts: number;
  health_backfill_last_chunk_at: string;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const startedAt = Date.now();
  const recovered: string[] = [];
  const failed: string[] = [];

  try {
    const { rows } = await pg.query<StuckMerchant>(
      `SELECT id, shop_domain,
              health_backfill_chunks_completed,
              health_backfill_chunks_total,
              health_backfill_recovery_attempts,
              health_backfill_last_chunk_at
       FROM public.merchants
       WHERE status = 'active'
         AND health_backfill_status = 'in_progress'
         AND health_backfill_last_chunk_at < NOW() - INTERVAL '${STUCK_THRESHOLD}'`
    );

    console.log(
      `[detect-stuck-backfills] found ${rows.length} stuck merchant(s)`
    );

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

    for (const m of rows) {
      const nextAttempt = m.health_backfill_recovery_attempts + 1;
      const nextChunk = m.health_backfill_chunks_completed;
      const totalChunks = m.health_backfill_chunks_total ?? DEFAULT_TOTAL_CHUNKS;

      // CAP: after 3 attempts, give up automatic recovery and surface for manual handling
      if (m.health_backfill_recovery_attempts >= MAX_RECOVERY_ATTEMPTS) {
        const errorMsg =
          `Stuck after ${MAX_RECOVERY_ATTEMPTS} recovery attempts. ` +
          `chunks_completed=${m.health_backfill_chunks_completed}, ` +
          `last_chunk_at=${m.health_backfill_last_chunk_at}. ` +
          `Manual recovery: scripts/run-historical-health-backfill.ts ` +
          `${m.shop_domain} --from-chunk=${nextChunk}`;

        await pg.query(
          `UPDATE public.merchants
           SET health_backfill_status = 'failed',
               health_backfill_error = $2
           WHERE id = $1`,
          [m.id, errorMsg]
        );

        console.error(
          `[detect-stuck-backfills] GAVE UP merchant=${m.id} shop=${m.shop_domain} ` +
            `attempts=${m.health_backfill_recovery_attempts} chunks=${m.health_backfill_chunks_completed}/${totalChunks} ` +
            `last_chunk_at=${m.health_backfill_last_chunk_at}`
        );
        failed.push(m.id);
        continue;
      }

      // Increment counter BEFORE firing — so if the fetch ALSO drops, the
      // counter still reflects the attempt and the next cron will see it.
      await pg.query(
        `UPDATE public.merchants
         SET health_backfill_recovery_attempts = $2,
             health_backfill_last_chunk_at = NOW()
         WHERE id = $1`,
        [m.id, nextAttempt]
      );

      // Re-fire the next chunk fire-and-forget. Same Bearer secret.
      void fetch(`${baseUrl}/api/internal/backfill-health-history`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchant_id: m.id,
          chunk: nextChunk,
          total_chunks: totalChunks,
          days_per_chunk: DEFAULT_DAYS_PER_CHUNK,
          total_days: DEFAULT_DAYS,
        }),
      }).catch((err) => {
        console.error(
          `[detect-stuck-backfills] re-fire failed for ${m.shop_domain}:`,
          err
        );
      });

      console.error(
        `[detect-stuck-backfills] RECOVERED merchant=${m.id} shop=${m.shop_domain} ` +
          `attempt=${nextAttempt}/${MAX_RECOVERY_ATTEMPTS} re-firing chunk=${nextChunk}/${totalChunks}`
      );
      recovered.push(m.id);
    }

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      stuck_found: rows.length,
      recovered: recovered.length,
      gave_up: failed.length,
      recovered_ids: recovered,
      gave_up_ids: failed,
    });
  } finally {
    await pg.end();
  }
}
