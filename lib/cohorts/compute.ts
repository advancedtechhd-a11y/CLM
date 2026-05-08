/**
 * Compute merchant_cohort_metrics for one merchant (v1.5 Phase 4).
 *
 * Iterates the last 12 calendar months. For each cohort month:
 *   - cohort_size = customers whose first_order_at ∈ [month, month+1mo)
 *   - retained_30d / 60d / 90d = customers in the cohort who placed AT
 *     LEAST one additional order ≥ N days after their first
 *   - retained columns are NULL if the cohort hasn't matured N days yet
 *     (countRetainedAt returns null in that case)
 *   - total_revenue = sum of all-time order_total from cohort customers
 *
 * Empty cohorts (size = 0) are skipped — saves a row per inactive month.
 *
 * Used by:
 *   * /api/cron/compute-cohort-metrics (nightly, 2am UTC)
 *   * runFirstTimeSetup (onboarding) — so widget renders on day 1
 *   * scripts/run-compute-cohort-metrics.ts (manual trigger)
 *
 * Idempotent — ON CONFLICT (merchant_id, cohort_month) DO UPDATE.
 */

import type { Client } from "pg";
import {
  countCohortSize,
  countRetainedAt,
  sumCohortRevenue,
} from "./queries";
import { getLastNMonths } from "../dates";

const COHORT_MONTHS = 12;

export type CohortComputeResult = {
  months_processed: number;
  cohorts_written: number;
  cohorts_skipped_empty: number;
};

export async function computeCohortMetricsForMerchant(
  pg: Client,
  merchantId: string,
  now: Date = new Date()
): Promise<CohortComputeResult> {
  const months = getLastNMonths(COHORT_MONTHS, now);

  let written = 0;
  let skipped = 0;

  for (const month of months) {
    const size = await countCohortSize(pg, merchantId, month);
    if (size === 0) {
      skipped++;
      continue;
    }

    const [retained30, retained60, retained90, revenue] = await Promise.all([
      countRetainedAt(pg, merchantId, month, 30, now),
      countRetainedAt(pg, merchantId, month, 60, now),
      countRetainedAt(pg, merchantId, month, 90, now),
      sumCohortRevenue(pg, merchantId, month),
    ]);

    await pg.query(
      `INSERT INTO public.merchant_cohort_metrics
         (merchant_id, cohort_month, cohort_size, retained_30d, retained_60d, retained_90d, total_revenue, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (merchant_id, cohort_month) DO UPDATE SET
         cohort_size = EXCLUDED.cohort_size,
         retained_30d = EXCLUDED.retained_30d,
         retained_60d = EXCLUDED.retained_60d,
         retained_90d = EXCLUDED.retained_90d,
         total_revenue = EXCLUDED.total_revenue,
         computed_at = NOW()`,
      [
        merchantId,
        month.toISOString().slice(0, 10),
        size,
        retained30,
        retained60,
        retained90,
        revenue,
      ]
    );
    written++;
  }

  return {
    months_processed: months.length,
    cohorts_written: written,
    cohorts_skipped_empty: skipped,
  };
}
