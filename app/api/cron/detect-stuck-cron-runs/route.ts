/**
 * Daily cron — detect-stuck-cron-runs (v1.5).
 *
 * Schedule: 7am UTC daily — see vercel.json
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Companion to detect-stuck-backfills. Same self-healing pattern, different
 * target table:
 *   - detect-stuck-backfills scans `merchants.health_backfill_*` for stuck
 *     historical-health-history reconstructions
 *   - detect-stuck-cron-runs scans `cron_runs` for stuck chunked-cron runs
 *     (compute-daily-metrics, compute-cohort-metrics, detect-anomalies,
 *     email-monthly-reports)
 *
 * Stuck = `status = 'in_progress' AND last_chunk_at < NOW() - INTERVAL '1 hour'`.
 * Cause: fire-and-forget chain dropped a chunk somewhere — Vercel's runtime
 * killed the function before the next-chunk fetch initiated, or the next
 * fetch landed but failed silently.
 *
 * Recovery (per-incident counter, NOT cumulative):
 *   - recovery_attempts < 3 → increment, re-fire next chunk via fetch
 *     to the cron's path with ?run_id=X&offset=N
 *   - recovery_attempts >= 3 → mark 'failed' with diagnostic, surface for
 *     manual handling via scripts/run-cron-chunk.ts
 *
 * Note: chunks_completed × batch_size assumes batch_size=5 for metrics crons.
 * email-monthly-reports doesn't use offset (it uses claim-based iteration),
 * so we omit offset for that path and let it figure out next batch from
 * `emailed_at IS NULL` again.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";

export const maxDuration = 60;

const STUCK_THRESHOLD = "1 hour";
const MAX_RECOVERY_ATTEMPTS = 3;

// Chunked metrics crons use offset-based pagination with batch_size=5.
// Email cron uses claim-based pagination — no offset needed.
const OFFSET_BASED_CRONS = new Set([
  "/api/cron/compute-daily-metrics",
  "/api/cron/compute-cohort-metrics",
  "/api/cron/detect-anomalies",
]);
const BATCH_SIZE = 5;

type StuckRun = {
  id: string;
  cron_path: string;
  chunks_completed: number;
  recovery_attempts: number;
  last_chunk_at: string;
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
    const { rows } = await pg.query<StuckRun>(
      `SELECT id, cron_path, chunks_completed, recovery_attempts, last_chunk_at::text
       FROM public.cron_runs
       WHERE status = 'in_progress'
         AND last_chunk_at < NOW() - INTERVAL '${STUCK_THRESHOLD}'`
    );

    console.log(`[detect-stuck-cron-runs] found ${rows.length} stuck run(s)`);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

    for (const r of rows) {
      // CAP: 3 attempts then give up
      if (r.recovery_attempts >= MAX_RECOVERY_ATTEMPTS) {
        const errorMsg =
          `Stuck after ${MAX_RECOVERY_ATTEMPTS} recovery attempts. ` +
          `cron_path=${r.cron_path}, chunks_completed=${r.chunks_completed}, ` +
          `last_chunk_at=${r.last_chunk_at}. ` +
          `Manual recovery: scripts/run-cron-chunk.ts --run-id=${r.id}`;

        await pg.query(
          `UPDATE public.cron_runs
           SET status = 'failed', error = $2
           WHERE id = $1`,
          [r.id, errorMsg]
        );

        console.error(
          `[detect-stuck-cron-runs] GAVE UP run=${r.id} cron=${r.cron_path} ` +
            `attempts=${r.recovery_attempts} chunks=${r.chunks_completed} ` +
            `last_chunk_at=${r.last_chunk_at}`
        );
        failed.push(r.id);
        continue;
      }

      // Increment counter BEFORE re-firing — if the fetch ALSO drops, the
      // counter persists and tomorrow's stuck-detector sees attempt N+1.
      await pg.query(
        `UPDATE public.cron_runs
         SET recovery_attempts = recovery_attempts + 1,
             last_chunk_at = NOW()
         WHERE id = $1`,
        [r.id]
      );

      // Build the re-fire URL based on cron type
      let url: string;
      if (OFFSET_BASED_CRONS.has(r.cron_path)) {
        const nextOffset = r.chunks_completed * BATCH_SIZE;
        url = `${baseUrl}${r.cron_path}?run_id=${r.id}&offset=${nextOffset}`;
      } else {
        // email-monthly-reports uses claim-based iteration — just pass run_id
        url = `${baseUrl}${r.cron_path}?run_id=${r.id}`;
      }

      void fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${cronSecret}` },
      }).catch((err) => {
        console.error(
          `[detect-stuck-cron-runs] re-fire failed for run=${r.id}:`,
          err
        );
      });

      console.error(
        `[detect-stuck-cron-runs] RECOVERED run=${r.id} cron=${r.cron_path} ` +
          `attempt=${r.recovery_attempts + 1}/${MAX_RECOVERY_ATTEMPTS}`
      );
      recovered.push(r.id);
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
