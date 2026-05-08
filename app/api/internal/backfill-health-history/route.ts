/**
 * Chunked historical health-history backfill endpoint (v1.5 Phase 3.5+).
 *
 * Each POST processes ONE chunk (default 10 days). When the chunk
 * completes, this handler fires the NEXT chunk fire-and-forget to itself,
 * so the work spans multiple Vercel function invocations and survives the
 * 5-minute timeout for very large merchants.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Body: {
 *   merchant_id: string,
 *   chunk?: number,             // default 0 — first chunk
 *   total_chunks?: number,      // default 9 — 90 days / 10 per chunk
 *   days_per_chunk?: number,    // default 10
 *   total_days?: number,        // default 90
 * }
 *
 * Idempotent — ON CONFLICT in the underlying writes means re-running a
 * chunk is safe. The manual recovery script can resume from any chunk N.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import {
  processBackfillChunk,
  markBackfillStarted,
  recordChunkComplete,
  markBackfillComplete,
  markBackfillFailed,
  DEFAULT_DAYS,
  DEFAULT_DAYS_PER_CHUNK,
  DEFAULT_TOTAL_CHUNKS,
} from "@/lib/metrics/historical-backfill";
import { backfillDailyMetrics } from "@/lib/metrics/backfill";

export const maxDuration = 300; // per chunk

type Body = {
  merchant_id?: string;
  chunk?: number;
  total_chunks?: number;
  days_per_chunk?: number;
  total_days?: number;
};

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const merchantId = body.merchant_id;
  const chunk = body.chunk ?? 0;
  const totalChunks = body.total_chunks ?? DEFAULT_TOTAL_CHUNKS;
  const daysPerChunk = body.days_per_chunk ?? DEFAULT_DAYS_PER_CHUNK;
  const totalDays = body.total_days ?? DEFAULT_DAYS;

  if (!merchantId) {
    return NextResponse.json({ error: "merchant_id required" }, { status: 400 });
  }
  if (!Number.isInteger(chunk) || chunk < 0 || chunk >= totalChunks) {
    return NextResponse.json({ error: "chunk out of range" }, { status: 400 });
  }
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 36) {
    return NextResponse.json({ error: "total_chunks out of range" }, { status: 400 });
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const startedAt = Date.now();
  try {
    if (chunk === 0) {
      await markBackfillStarted(pg, merchantId, totalChunks);
    }

    const result = await processBackfillChunk(
      pg,
      merchantId,
      chunk,
      daysPerChunk,
      totalDays
    );
    await recordChunkComplete(pg, merchantId, chunk);

    const isLast = chunk + 1 >= totalChunks;
    if (isLast) {
      // After all per-customer history is in place, refresh the daily
      // aggregates the trend widget reads from.
      await backfillDailyMetrics(pg, merchantId, totalDays);
      await markBackfillComplete(pg, merchantId);
    } else {
      // Fire next chunk fire-and-forget. We deliberately do not await — the
      // next invocation runs as a separate Vercel function with its own
      // 5-min budget. If the fetch never lands (rare), the manual recovery
      // script (--from-chunk=N) resumes from where progress was last
      // recorded.
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      void fetch(`${baseUrl}/api/internal/backfill-health-history`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchant_id: merchantId,
          chunk: chunk + 1,
          total_chunks: totalChunks,
          days_per_chunk: daysPerChunk,
          total_days: totalDays,
        }),
      }).catch((err) => {
        console.error(
          `[backfill chunk ${chunk}] failed to fire next chunk:`,
          err
        );
      });
    }

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      merchant_id: merchantId,
      chunk_processed: chunk,
      next_chunk: isLast ? null : chunk + 1,
      chunks_total: totalChunks,
      days_processed: result.days_processed,
      rows_written: result.total_history_rows,
      is_last: isLast,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[backfill chunk ${chunk}] ${merchantId} failed: ${msg}`
    );
    try {
      await markBackfillFailed(pg, merchantId, `chunk ${chunk}: ${msg}`);
    } catch {
      /* secondary failure — already logging primary */
    }
    return NextResponse.json(
      { ok: false, merchant_id: merchantId, chunk, error: msg },
      { status: 500 }
    );
  } finally {
    await pg.end();
  }
}
