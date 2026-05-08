/**
 * Shared chunked-cron infrastructure (v1.5).
 *
 * Cron routes that iterate active merchants use this helper to:
 *   - Auth via Bearer CRON_SECRET
 *   - Read ?run_id=X&offset=N from the URL (cron triggers offset=0)
 *   - On chunk 0: count total merchants, create cron_runs row
 *   - On every chunk: process N merchants (caller-supplied work fn),
 *     advance chunks_completed, fire next chunk fire-and-forget
 *   - On last chunk: mark cron_runs row complete
 *   - On error: mark failed with error message
 *
 * Self-firing pattern matches the Phase 3.5 historical-health-backfill
 * endpoint. Each chunk runs in its own ≤ 5-min Vercel function invocation,
 * so 100+ merchants no longer hit the single-invocation timeout.
 *
 * Usage in a cron route:
 *
 *   export async function GET(req: NextRequest) {
 *     return runChunkedCron(req, {
 *       cronPath: "/api/cron/compute-daily-metrics",
 *       batchSize: 5,
 *       merchantFilter: null,            // null = all active merchants
 *       metadata: { metric_date: "2026-05-07" },
 *       processOne: async (pg, merchant) => {
 *         await computeDailyMetrics(pg, merchant.id, yesterday());
 *       },
 *     });
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import {
  countActiveMerchants,
  getActiveMerchants,
  type ActiveMerchant,
} from "@/lib/metrics/queries";
import {
  startCronRun,
  recordChunkComplete,
  markCronRunComplete,
  markCronRunFailed,
  getCronRun,
} from "./run-state";

export type ChunkedCronOptions = {
  /** The cron's path. Used in the `cron_runs.cron_path` column and to
   *  fire-and-forget the next chunk back to itself. */
  cronPath: string;
  /** Merchants per chunk. Tune per cron based on per-merchant work duration. */
  batchSize: number;
  /** Extra SQL WHERE clause appended to `status = 'active'`. Pass null for
   *  no extra filter. Used by detect-anomalies → "anomaly_detection_enabled = TRUE". */
  merchantFilter: string | null;
  /** Stored on the cron_runs.metadata column. Useful for ops/debug. */
  metadata?: Record<string, unknown>;
  /** Per-merchant work. Errors here mark the run failed. */
  processOne: (pg: Client, merchant: ActiveMerchant) => Promise<void>;
};

export async function runChunkedCron(
  req: NextRequest,
  opts: ChunkedCronOptions
): Promise<NextResponse> {
  // ── Auth ─────────────────────────────────────────────
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

  // ── Parse chunk position ─────────────────────────────
  const url = new URL(req.url);
  const runIdParam = url.searchParams.get("run_id");
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  if (!Number.isInteger(offset) || offset < 0) {
    return NextResponse.json({ error: "invalid offset" }, { status: 400 });
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const startedAt = Date.now();
  let runId = runIdParam;

  try {
    // ── Chunk 0: bootstrap the run row ──────────────────
    if (!runId) {
      const total = await countActiveMerchants(pg, opts.merchantFilter);
      if (total === 0) {
        // Nothing to do — return without creating a run row
        return NextResponse.json({
          ok: true,
          duration_ms: Date.now() - startedAt,
          run_id: null,
          chunk: 0,
          merchants_in_chunk: 0,
          total_merchants: 0,
          is_last: true,
          note: "no merchants matched filter — skipped",
        });
      }
      runId = await startCronRun(pg, {
        cronPath: opts.cronPath,
        totalMerchants: total,
        metadata: opts.metadata,
      });
    }

    // ── Fetch this chunk's merchants ────────────────────
    const batch = await getActiveMerchants(pg, {
      limit: opts.batchSize,
      offset,
      extraWhere: opts.merchantFilter,
    });

    // ── Process this chunk ──────────────────────────────
    const errors: Array<{ merchant_id: string; error: string }> = [];
    for (const m of batch) {
      try {
        await opts.processOne(pg, m);
      } catch (err) {
        // Per-merchant errors don't kill the whole chunk — log and continue.
        // The run only fails if EVERY merchant in a chunk errors (handled below)
        // or if the helper itself throws (caught at the outer try/catch).
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${opts.cronPath}] ${m.shop_domain} failed: ${msg}`);
        errors.push({ merchant_id: m.id, error: msg });
      }
    }

    // ── Advance chunk counter (resets recovery_attempts to 0) ─
    const newChunksCompleted = Math.floor(offset / opts.batchSize) + 1;
    await recordChunkComplete(pg, runId, newChunksCompleted);

    // ── Decide: more chunks, or done? ───────────────────
    const isLast = batch.length < opts.batchSize;
    if (isLast) {
      await markCronRunComplete(pg, runId);
    } else {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      const nextOffset = offset + opts.batchSize;
      void fetch(
        `${baseUrl}${opts.cronPath}?run_id=${runId}&offset=${nextOffset}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${cronSecret}` },
        }
      ).catch((err) => {
        console.error(
          `[${opts.cronPath}] chunk fire-and-forget failed (run=${runId}, offset=${nextOffset}):`,
          err
        );
      });
    }

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      run_id: runId,
      chunk: newChunksCompleted - 1,
      merchants_in_chunk: batch.length,
      errors,
      next_offset: isLast ? null : offset + opts.batchSize,
      is_last: isLast,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${opts.cronPath}] chunk failed at offset=${offset}: ${msg}`);
    if (runId) {
      try {
        await markCronRunFailed(pg, runId, `chunk offset=${offset}: ${msg}`);
      } catch {
        /* secondary failure — primary already logged */
      }
    }
    return NextResponse.json(
      { ok: false, run_id: runId, offset, error: msg },
      { status: 500 }
    );
  } finally {
    await pg.end();
  }
}

/** Re-export so cron routes don't need to import from two places. */
export { getCronRun };
