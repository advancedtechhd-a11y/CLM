/**
 * Historical health-score backfill (v1.5 Phase 3.5).
 *
 * Walks back N days, reconstructing each customer's state as of each
 * historical date. Writes to customer_health_history with computed_on =
 * historical_date, which the existing daily-metrics backfill picks up.
 *
 * After the per-day reconstruction completes, re-runs backfillDailyMetrics
 * so merchant_daily_metrics.avg_health_score / median_health_score columns
 * get populated for the same window. Net effect: a merchant who installs
 * today sees a populated 30-day Health Score Trend within a few minutes.
 *
 * Two execution modes:
 *   1. Chunked (production)  — processBackfillChunk + the helpers below.
 *      Driven by /api/internal/backfill-health-history; each chunk runs in
 *      its own ≤ 5-min Vercel function invocation, fires the next chunk
 *      fire-and-forget. Survives 100K+ customer merchants without timeout.
 *   2. All-at-once (script)  — backfillCustomerHealthHistory wrapper.
 *      Used by scripts/run-historical-health-backfill.ts for ops/recovery.
 *      Runs locally so Vercel timeouts don't apply.
 *
 * Design notes:
 *   * Uses CURRENT merchant_metrics as the threshold approximation. Spend
 *     percentiles / median repurchase cycle shift slowly — not worth
 *     reconstructing those historically for an MVP backfill.
 *   * Uses CURRENT email_unsubscribed (we don't track unsubscribe history).
 *   * Reuses the SAME scoring helpers as the live rules engine — drift is
 *     impossible because both code paths import from customer-metrics.ts.
 *   * Bulk-inserts rows in batches of 500 to keep memory + per-statement
 *     parameter count bounded.
 *   * Idempotent — ON CONFLICT (customer_id, computed_on) DO UPDATE — so
 *     re-running a chunk after a partial failure is safe.
 */

import type { Client } from "pg";
import { median, daysBetween } from "../rules/stats";
import {
  classifyLifecycleStage,
  classifyValueTier,
  computeHealthScore,
} from "../rules/customer-metrics";
import { backfillDailyMetrics } from "./backfill";

// ============================================================
// Constants
// ============================================================

export const DEFAULT_DAYS = 90;
export const DEFAULT_DAYS_PER_CHUNK = 10;
export const DEFAULT_TOTAL_CHUNKS = DEFAULT_DAYS / DEFAULT_DAYS_PER_CHUNK; // 9

// ============================================================
// Types — matched to the existing schema
// ============================================================

type MerchantMetricsRow = {
  median_repurchase_days: number;
  median_orders_per_customer: number;
  p90_orders_per_customer: number;
  spend_p50: number;
  spend_p80: number;
  spend_p95: number;
};

type CustomerRow = {
  id: string;
  email_unsubscribed: boolean;
};

type ReconstructedRow = {
  customer_id: string;
  health_score: number;
  health_score_band: string;
  recency_score: number;
  frequency_score: number;
  monetary_score: number;
  engagement_score: number;
  cycle_adherence_score: number;
  lifecycle_stage: string;
  value_tier: string;
};

// ============================================================
// One-day reconstruction (the unit of work)
// ============================================================

/**
 * Reconstruct customer_health_history rows for one merchant on one
 * historical date. Returns the count of rows written.
 */
export async function reconstructHealthAt(
  pg: Client,
  merchantId: string,
  asOfDate: Date
): Promise<{ date: string; customers_reconstructed: number }> {
  const isoDate = asOfDate.toISOString().slice(0, 10);

  // Threshold approximation — current merchant_metrics is good enough
  const mmRes = await pg.query<MerchantMetricsRow>(
    `SELECT median_repurchase_days, median_orders_per_customer, p90_orders_per_customer,
            spend_p50, spend_p80, spend_p95
     FROM public.merchant_metrics
     WHERE merchant_id = $1`,
    [merchantId]
  );
  if (mmRes.rows.length === 0) {
    throw new Error(
      `No merchant_metrics row for ${merchantId} — run runRulesEngine first`
    );
  }
  const mm = mmRes.rows[0];

  const { rows: customers } = await pg.query<CustomerRow>(
    `SELECT id, email_unsubscribed
     FROM public.customers
     WHERE merchant_id = $1`,
    [merchantId]
  );

  const { rows: orders } = await pg.query<{
    customer_id: string;
    ordered_at: string;
    order_total: string;
  }>(
    `SELECT customer_id, ordered_at, order_total
     FROM public.orders
     WHERE merchant_id = $1
       AND ordered_at <= $2
       AND customer_id IS NOT NULL`,
    [merchantId, asOfDate]
  );

  // Group historical orders by customer
  const datesByCustomer = new Map<string, string[]>();
  const spentByCustomer = new Map<string, number>();
  for (const o of orders) {
    if (!datesByCustomer.has(o.customer_id)) datesByCustomer.set(o.customer_id, []);
    datesByCustomer.get(o.customer_id)!.push(o.ordered_at);
    spentByCustomer.set(
      o.customer_id,
      (spentByCustomer.get(o.customer_id) ?? 0) + parseFloat(o.order_total)
    );
  }

  // Spend distribution as of asOfDate — used for tier classification
  const allHistoricalSpend = Array.from(spentByCustomer.values());

  const reconstructed: ReconstructedRow[] = [];

  for (const c of customers) {
    const customerOrders = datesByCustomer.get(c.id);
    if (!customerOrders || customerOrders.length === 0) {
      // Customer didn't have any orders by asOfDate — skip (matches the live
      // rules engine, which treats no-order customers as "lead" but doesn't
      // snapshot them into history)
      continue;
    }

    const sortedDates = [...customerOrders].sort();
    const firstOrder = new Date(sortedDates[0]);
    const lastOrder = new Date(sortedDates[sortedDates.length - 1]);
    const ordersCount = customerOrders.length;
    const totalSpent = spentByCustomer.get(c.id) ?? 0;
    const recencyDays = Math.max(0, daysBetween(lastOrder, asOfDate));

    // Personal repurchase cycle from intervals strictly before asOfDate
    const personalIntervals: number[] = [];
    if (sortedDates.length >= 2) {
      for (let i = 1; i < sortedDates.length; i++) {
        const days = daysBetween(sortedDates[i - 1], sortedDates[i]);
        if (days >= 1 && days <= 365) personalIntervals.push(days);
      }
    }
    let expectedCycle: number;
    if (personalIntervals.length >= 3) {
      expectedCycle = median(personalIntervals);
    } else if (personalIntervals.length >= 1) {
      const w = personalIntervals.length / 3;
      expectedCycle =
        w * median(personalIntervals) + (1 - w) * mm.median_repurchase_days;
    } else {
      expectedCycle = mm.median_repurchase_days || 30;
    }
    expectedCycle = Math.max(1, Math.round(expectedCycle));

    const cycleRatio = expectedCycle > 0 ? recencyDays / expectedCycle : null;

    const stage = classifyLifecycleStage(
      {
        id: c.id,
        total_spent: String(totalSpent),
        orders_count: ordersCount,
        first_order_at: firstOrder.toISOString(),
        last_order_at: lastOrder.toISOString(),
        email_unsubscribed: c.email_unsubscribed,
      },
      recencyDays,
      expectedCycle,
      asOfDate
    );

    const valueTier = classifyValueTier(totalSpent, allHistoricalSpend);

    const personalCycleDays =
      personalIntervals.length >= 1 ? Math.round(median(personalIntervals)) : null;

    const health = computeHealthScore({
      cycleRatio,
      ordersCount,
      mmMedianOrders: mm.median_orders_per_customer,
      mmP90Orders: mm.p90_orders_per_customer,
      totalSpent,
      mmSpendP50: mm.spend_p50,
      mmSpendP80: mm.spend_p80,
      mmSpendP95: mm.spend_p95,
      personalCycleDays,
      recencyDays,
      emailUnsubscribed: c.email_unsubscribed,
    });

    reconstructed.push({
      customer_id: c.id,
      health_score: health.health_score,
      health_score_band: health.band,
      recency_score: health.recency_score,
      frequency_score: health.frequency_score,
      monetary_score: health.monetary_score,
      engagement_score: health.engagement_score,
      cycle_adherence_score: health.cycle_adherence_score,
      lifecycle_stage: stage,
      value_tier: valueTier,
    });
  }

  // Bulk insert in 500-row batches
  const BATCH = 500;
  for (let i = 0; i < reconstructed.length; i += BATCH) {
    const slice = reconstructed.slice(i, i + BATCH);
    const valueClauses: string[] = [];
    const params: any[] = [];
    let p = 0;
    for (const r of slice) {
      const clause = Array.from({ length: 12 }, () => `$${++p}`).join(", ");
      valueClauses.push(`(${clause})`);
      params.push(
        merchantId,
        r.customer_id,
        r.health_score,
        r.health_score_band,
        r.recency_score,
        r.frequency_score,
        r.monetary_score,
        r.engagement_score,
        r.cycle_adherence_score,
        r.lifecycle_stage,
        r.value_tier,
        isoDate
      );
    }
    await pg.query(
      `INSERT INTO public.customer_health_history (
         merchant_id, customer_id, health_score, health_score_band,
         recency_score, frequency_score, monetary_score, engagement_score, cycle_adherence_score,
         lifecycle_stage, value_tier, computed_on
       ) VALUES ${valueClauses.join(", ")}
       ON CONFLICT (customer_id, computed_on) DO UPDATE SET
         health_score = EXCLUDED.health_score,
         health_score_band = EXCLUDED.health_score_band,
         recency_score = EXCLUDED.recency_score,
         frequency_score = EXCLUDED.frequency_score,
         monetary_score = EXCLUDED.monetary_score,
         engagement_score = EXCLUDED.engagement_score,
         cycle_adherence_score = EXCLUDED.cycle_adherence_score,
         lifecycle_stage = EXCLUDED.lifecycle_stage,
         value_tier = EXCLUDED.value_tier`,
      params
    );
  }

  return { date: isoDate, customers_reconstructed: reconstructed.length };
}

// ============================================================
// Chunk processor — one chunk = `daysPerChunk` consecutive days
// ============================================================

/**
 * Process a contiguous range of days into customer_health_history.
 *
 * `chunkIndex` is 0-based. With `daysPerChunk = 10`:
 *   chunk 0 → days 1..10 (most recent)
 *   chunk 1 → days 11..20
 *   ...
 *   chunk 8 → days 81..90 (oldest)
 *
 * Days are 1-based "days ago": day 1 = yesterday, day 90 = 90 days ago.
 */
export async function processBackfillChunk(
  pg: Client,
  merchantId: string,
  chunkIndex: number,
  daysPerChunk: number = DEFAULT_DAYS_PER_CHUNK,
  totalDays: number = DEFAULT_DAYS
): Promise<{ days_processed: number; total_history_rows: number }> {
  const startDay = chunkIndex * daysPerChunk + 1; // 1-based, inclusive
  const endDay = Math.min(startDay + daysPerChunk, totalDays + 1); // exclusive

  let totalRows = 0;
  let processed = 0;
  for (let i = startDay; i < endDay; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    const r = await reconstructHealthAt(pg, merchantId, d);
    totalRows += r.customers_reconstructed;
    processed++;
  }
  return { days_processed: processed, total_history_rows: totalRows };
}

// ============================================================
// Status / progress helpers
// ============================================================

export async function markBackfillStarted(
  pg: Client,
  merchantId: string,
  totalChunks: number
): Promise<void> {
  await pg.query(
    `UPDATE public.merchants
     SET health_backfill_status = 'in_progress',
         health_backfill_started_at = NOW(),
         health_backfill_completed_at = NULL,
         health_backfill_error = NULL,
         health_backfill_chunks_completed = 0,
         health_backfill_chunks_total = $2,
         health_backfill_last_chunk_at = NOW(),
         health_backfill_recovery_attempts = 0
     WHERE id = $1`,
    [merchantId, totalChunks]
  );
}

/**
 * Successful chunk → reset the recovery counter to 0.
 *
 * Per-incident semantics: the 3-attempt cap means "3 consecutive failed
 * recovery attempts WITHOUT any chunk succeeding in between", not
 * "3 attempts cumulative for the lifetime of this merchant row". A merchant
 * that hits one stuck event mid-backfill, recovers, and finishes cleanly
 * shouldn't enter a future stuck event with a non-zero counter — that
 * would compound across months for any future re-backfill.
 */
export async function recordChunkComplete(
  pg: Client,
  merchantId: string,
  chunkIndex: number
): Promise<void> {
  await pg.query(
    `UPDATE public.merchants
     SET health_backfill_chunks_completed = $2,
         health_backfill_last_chunk_at = NOW(),
         health_backfill_recovery_attempts = 0
     WHERE id = $1`,
    [merchantId, chunkIndex + 1]
  );
}

export async function markBackfillComplete(
  pg: Client,
  merchantId: string
): Promise<void> {
  await pg.query(
    `UPDATE public.merchants
     SET health_backfill_status = 'complete',
         health_backfill_completed_at = NOW(),
         health_backfill_last_chunk_at = NOW()
     WHERE id = $1`,
    [merchantId]
  );
}

export async function markBackfillFailed(
  pg: Client,
  merchantId: string,
  error: string
): Promise<void> {
  await pg.query(
    `UPDATE public.merchants
     SET health_backfill_status = 'failed',
         health_backfill_error = $2,
         health_backfill_last_chunk_at = NOW()
     WHERE id = $1`,
    [merchantId, error]
  );
}

// ============================================================
// All-at-once orchestrator (for scripts/manual use, not Vercel)
// ============================================================

/**
 * Runs every chunk back-to-back in one process. Suitable for the manual
 * recovery script (no Vercel function timeout) but NOT for production
 * post-install — use the chunked endpoint there instead.
 *
 * `fromChunk` lets you resume a stuck merchant: existing chunks 0..N-1 stay
 * on disk thanks to ON CONFLICT, and we just continue from chunk N.
 */
export async function backfillCustomerHealthHistory(
  pg: Client,
  merchantId: string,
  totalDays: number = DEFAULT_DAYS,
  fromChunk: number = 0,
  daysPerChunk: number = DEFAULT_DAYS_PER_CHUNK
): Promise<{
  ok: boolean;
  days_processed: number;
  total_history_rows: number;
  chunks_processed: number;
}> {
  const totalChunks = Math.ceil(totalDays / daysPerChunk);

  if (fromChunk === 0) {
    await markBackfillStarted(pg, merchantId, totalChunks);
  }

  try {
    let totalRows = 0;
    let totalDaysProcessed = 0;
    for (let c = fromChunk; c < totalChunks; c++) {
      const r = await processBackfillChunk(pg, merchantId, c, daysPerChunk, totalDays);
      totalRows += r.total_history_rows;
      totalDaysProcessed += r.days_processed;
      await recordChunkComplete(pg, merchantId, c);
    }

    // Now that customer_health_history is populated, refresh the daily
    // aggregates so HealthScoreTrend has avg_health_score for the window.
    await backfillDailyMetrics(pg, merchantId, totalDays);

    await markBackfillComplete(pg, merchantId);

    return {
      ok: true,
      days_processed: totalDaysProcessed,
      total_history_rows: totalRows,
      chunks_processed: totalChunks - fromChunk,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markBackfillFailed(pg, merchantId, msg);
    throw err;
  }
}
