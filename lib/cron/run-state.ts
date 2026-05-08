/**
 * Cron-run state helpers for chunked self-firing crons (v1.5).
 *
 * Each cron route's GET handler calls these to:
 *   1. startCronRun() at chunk 0 — creates the row, returns the run_id
 *      that subsequent chunks pass back via query string
 *   2. recordChunkComplete() after each successful chunk — increments
 *      chunks_completed, refreshes last_chunk_at, RESETS recovery_attempts
 *      to 0 (per-incident semantics, NOT cumulative)
 *   3. markCronRunComplete() after the last chunk — sets status='complete'
 *   4. markCronRunFailed() on any unrecoverable error
 *   5. incrementRecoveryAttempt() — used by detect-stuck-cron-runs when
 *      it nudges a stuck run; if returned counter is >= 3, caller marks
 *      the run failed instead of re-firing
 *
 * The reset-on-success pattern matches Phase 3.5's per-incident counter:
 * a run that gets stuck once (counter → 1), recovers, runs 8 more chunks
 * fine, then gets stuck again should NOT inherit the prior counter.
 * Otherwise a sporadically-flaky cron over months would compound to the
 * 3-attempt cap on a future routine stuck event.
 */

import type { Client } from "pg";

export const MAX_RECOVERY_ATTEMPTS = 3;

export type CronRun = {
  id: string;
  cron_path: string;
  started_at: string;
  last_chunk_at: string;
  completed_at: string | null;
  status: "in_progress" | "complete" | "failed";
  chunks_completed: number;
  total_merchants: number;
  recovery_attempts: number;
  error: string | null;
  metadata: Record<string, unknown> | null;
};

export async function startCronRun(
  pg: Client,
  args: {
    cronPath: string;
    totalMerchants: number;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const { rows } = await pg.query<{ id: string }>(
    `INSERT INTO public.cron_runs
       (cron_path, total_merchants, metadata, status, chunks_completed, recovery_attempts)
     VALUES ($1, $2, $3::jsonb, 'in_progress', 0, 0)
     RETURNING id`,
    [
      args.cronPath,
      args.totalMerchants,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ]
  );
  return rows[0].id;
}

export async function recordChunkComplete(
  pg: Client,
  runId: string,
  newChunksCompleted: number
): Promise<void> {
  await pg.query(
    `UPDATE public.cron_runs
     SET chunks_completed = $2,
         last_chunk_at = NOW(),
         recovery_attempts = 0
     WHERE id = $1`,
    [runId, newChunksCompleted]
  );
}

export async function markCronRunComplete(
  pg: Client,
  runId: string
): Promise<void> {
  await pg.query(
    `UPDATE public.cron_runs
     SET status = 'complete',
         completed_at = NOW(),
         last_chunk_at = NOW()
     WHERE id = $1`,
    [runId]
  );
}

export async function markCronRunFailed(
  pg: Client,
  runId: string,
  error: string
): Promise<void> {
  await pg.query(
    `UPDATE public.cron_runs
     SET status = 'failed',
         error = $2,
         last_chunk_at = NOW()
     WHERE id = $1`,
    [runId, error]
  );
}

/**
 * Increment the recovery counter and return the new value. Caller checks
 * the return value against MAX_RECOVERY_ATTEMPTS to decide whether to
 * re-fire or mark failed.
 */
export async function incrementRecoveryAttempt(
  pg: Client,
  runId: string
): Promise<number> {
  const { rows } = await pg.query<{ recovery_attempts: number }>(
    `UPDATE public.cron_runs
     SET recovery_attempts = recovery_attempts + 1,
         last_chunk_at = NOW()
     WHERE id = $1
     RETURNING recovery_attempts`,
    [runId]
  );
  return rows[0]?.recovery_attempts ?? 0;
}

export async function getCronRun(
  pg: Client,
  runId: string
): Promise<CronRun | null> {
  const { rows } = await pg.query<CronRun>(
    `SELECT id, cron_path, started_at::text, last_chunk_at::text,
            completed_at::text, status, chunks_completed, total_merchants,
            recovery_attempts, error, metadata
     FROM public.cron_runs
     WHERE id = $1`,
    [runId]
  );
  return rows[0] ?? null;
}
