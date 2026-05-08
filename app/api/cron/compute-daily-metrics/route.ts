/**
 * Nightly compute-daily-metrics cron (chunked, v1.5).
 *
 * Schedule: 1am UTC daily — see vercel.json
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Chunked self-firing pattern: each chunk processes 5 merchants, fires the
 * next chunk fire-and-forget. State tracked in cron_runs. Survives 100+
 * merchant scale where the unchunked single-invocation version would have
 * timed out at the Vercel 5-min budget.
 *
 * Idempotent — computeDailyMetrics uses ON CONFLICT (merchant_id, metric_date)
 * DO UPDATE, so a re-fired chunk is safe.
 */

import { NextRequest } from "next/server";
import { runChunkedCron } from "@/lib/cron/chunked-handler";
import { computeDailyMetrics } from "@/lib/metrics/backfill";
import { yesterday } from "@/lib/dates";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const date = yesterday();
  return runChunkedCron(req, {
    cronPath: "/api/cron/compute-daily-metrics",
    batchSize: 5,
    merchantFilter: null,
    metadata: { metric_date: date.toISOString().slice(0, 10) },
    processOne: async (pg, merchant) => {
      await computeDailyMetrics(pg, merchant.id, date);
    },
  });
}
