/**
 * Nightly compute-cohort-metrics cron (chunked, v1.5).
 *
 * Schedule: 2am UTC daily — see vercel.json
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Chunked self-firing pattern. Each chunk recomputes the last 12 cohort
 * months for 5 merchants, then fires the next chunk fire-and-forget.
 * Idempotent — ON CONFLICT (merchant_id, cohort_month) DO UPDATE.
 */

import { NextRequest } from "next/server";
import { runChunkedCron } from "@/lib/cron/chunked-handler";
import { computeCohortMetricsForMerchant } from "@/lib/cohorts/compute";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return runChunkedCron(req, {
    cronPath: "/api/cron/compute-cohort-metrics",
    batchSize: 5,
    merchantFilter: null,
    processOne: async (pg, merchant) => {
      await computeCohortMetricsForMerchant(pg, merchant.id);
    },
  });
}
