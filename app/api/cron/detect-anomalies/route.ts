/**
 * Daily seasonality-aware anomaly detection (chunked, v1.5 Phase 6).
 *
 * Schedule: 9am UTC on Mondays — preserved from v1.1 path.
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Chunked self-firing pattern. Only iterates merchants where
 * `anomaly_detection_enabled = TRUE` (quiet rollout — see Ops Runbook
 * entry 5 to enable per merchant).
 *
 * The detector is idempotent for re-runs — seasonality-detector deletes
 * prior same-day rows before insert (see seasonality-detector.ts:175-184).
 *
 * Rollback: change vercel.json's cron entry to /api/cron/detect-anomalies-legacy.
 * See PROJECT-STATUS.md → Ops Runbook entry 6.
 */

import { NextRequest } from "next/server";
import { runChunkedCron } from "@/lib/cron/chunked-handler";
import { detectAnomaliesForMerchant } from "@/lib/anomalies/seasonality-detector";
import { yesterday } from "@/lib/dates";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const date = yesterday();
  return runChunkedCron(req, {
    cronPath: "/api/cron/detect-anomalies",
    batchSize: 5,
    merchantFilter: "anomaly_detection_enabled = TRUE",
    metadata: { metric_date: date.toISOString().slice(0, 10) },
    processOne: async (pg, merchant) => {
      await detectAnomaliesForMerchant(pg, merchant.id, date);
    },
  });
}
