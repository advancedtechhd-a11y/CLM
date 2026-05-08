/**
 * Single-merchant single-day daily metrics computer (v1.5 Phase 3).
 *
 * Used by:
 *   * /api/cron/compute-daily-metrics — calls computeDailyMetrics(yesterday)
 *     for each active merchant
 *   * Onboarding setup pipeline — calls backfillDailyMetrics(merchantId, 90)
 *     so a brand-new merchant has a Health Score Trend on day 1
 *   * scripts/run-compute-daily-metrics.ts — manual trigger for testing
 *
 * Idempotent: ON CONFLICT (merchant_id, metric_date) DO UPDATE.
 */

import type { Client } from "pg";
import {
  calcAvgHealthScore,
  calcMedianHealthScore,
  countByLifecycle,
  sumRevenue,
  countOrders,
  countNewCustomers,
  sumPredictedClv,
  sumRevenueAtRisk,
  calcRepeatRate,
  calcAov,
  calcDiscountUsageRate,
  getTopDiscountCode,
} from "./queries";

export type DailyMetricsRow = {
  merchant_id: string;
  metric_date: string; // 'YYYY-MM-DD'
  avg_health_score: number | null;
  median_health_score: number | null;
  customers_active: number;
  customers_new: number;
  customers_slipping: number;
  customers_at_risk: number;
  customers_churned: number;
  revenue: number;
  orders_count: number;
  new_customers: number;
  aov: number | null;
  predicted_clv: number;
  revenue_at_risk: number;
  repeat_rate: number;
  pct_orders_with_discount: number;
  top_discount_code_usage_pct: number | null;
  top_discount_code_name: string | null;
};

/**
 * Compute one merchant_daily_metrics row for one merchant + one date.
 * Reads from existing schema (orders, customers, customer_health_history,
 * customer_metrics, merchant_metrics) — no new tables required to source data.
 */
export async function computeDailyMetrics(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<DailyMetricsRow> {
  const [
    avgHealth,
    medianHealth,
    cActive,
    cNew,
    cSlipping,
    cAtRisk,
    cChurned,
    revenue,
    ordersCount,
    newCustomers,
    aov,
    predictedClv,
    rar,
    repeatRate,
    discountRate,
    topCode,
  ] = await Promise.all([
    calcAvgHealthScore(pg, merchantId, date),
    calcMedianHealthScore(pg, merchantId, date),
    countByLifecycle(pg, merchantId, "active", date),
    countByLifecycle(pg, merchantId, "new", date),
    countByLifecycle(pg, merchantId, "slipping", date),
    countByLifecycle(pg, merchantId, "at_risk", date),
    countByLifecycle(pg, merchantId, "churned", date),
    sumRevenue(pg, merchantId, date),
    countOrders(pg, merchantId, date),
    countNewCustomers(pg, merchantId, date),
    calcAov(pg, merchantId, date),
    sumPredictedClv(pg, merchantId),
    sumRevenueAtRisk(pg, merchantId),
    calcRepeatRate(pg, merchantId),
    calcDiscountUsageRate(pg, merchantId, date),
    getTopDiscountCode(pg, merchantId, date),
  ]);

  const isoDate = date.toISOString().slice(0, 10);

  const row: DailyMetricsRow = {
    merchant_id: merchantId,
    metric_date: isoDate,
    avg_health_score: avgHealth,
    median_health_score: medianHealth,
    customers_active: cActive,
    customers_new: cNew,
    customers_slipping: cSlipping,
    customers_at_risk: cAtRisk,
    customers_churned: cChurned,
    revenue,
    orders_count: ordersCount,
    new_customers: newCustomers,
    aov,
    predicted_clv: predictedClv,
    revenue_at_risk: rar,
    repeat_rate: repeatRate,
    pct_orders_with_discount: discountRate,
    top_discount_code_usage_pct: topCode?.usage_pct ?? null,
    top_discount_code_name: topCode?.code ?? null,
  };

  await pg.query(
    `INSERT INTO public.merchant_daily_metrics (
       merchant_id, metric_date,
       avg_health_score, median_health_score,
       customers_active, customers_new, customers_slipping, customers_at_risk, customers_churned,
       revenue, orders_count, new_customers, aov,
       predicted_clv, revenue_at_risk, repeat_rate,
       pct_orders_with_discount, top_discount_code_usage_pct, top_discount_code_name,
       computed_at
     ) VALUES (
       $1, $2,
       $3, $4,
       $5, $6, $7, $8, $9,
       $10, $11, $12, $13,
       $14, $15, $16,
       $17, $18, $19,
       NOW()
     )
     ON CONFLICT (merchant_id, metric_date) DO UPDATE SET
       avg_health_score = EXCLUDED.avg_health_score,
       median_health_score = EXCLUDED.median_health_score,
       customers_active = EXCLUDED.customers_active,
       customers_new = EXCLUDED.customers_new,
       customers_slipping = EXCLUDED.customers_slipping,
       customers_at_risk = EXCLUDED.customers_at_risk,
       customers_churned = EXCLUDED.customers_churned,
       revenue = EXCLUDED.revenue,
       orders_count = EXCLUDED.orders_count,
       new_customers = EXCLUDED.new_customers,
       aov = EXCLUDED.aov,
       predicted_clv = EXCLUDED.predicted_clv,
       revenue_at_risk = EXCLUDED.revenue_at_risk,
       repeat_rate = EXCLUDED.repeat_rate,
       pct_orders_with_discount = EXCLUDED.pct_orders_with_discount,
       top_discount_code_usage_pct = EXCLUDED.top_discount_code_usage_pct,
       top_discount_code_name = EXCLUDED.top_discount_code_name,
       computed_at = NOW()`,
    [
      row.merchant_id,
      row.metric_date,
      row.avg_health_score,
      row.median_health_score,
      row.customers_active,
      row.customers_new,
      row.customers_slipping,
      row.customers_at_risk,
      row.customers_churned,
      row.revenue,
      row.orders_count,
      row.new_customers,
      row.aov,
      row.predicted_clv,
      row.revenue_at_risk,
      row.repeat_rate,
      row.pct_orders_with_discount,
      row.top_discount_code_usage_pct,
      row.top_discount_code_name,
    ]
  );

  return row;
}

/**
 * Backfill the last `days` days of merchant_daily_metrics for one merchant.
 * Called from onboarding so a fresh merchant has a populated trend chart.
 *
 * Notes:
 *   * Health scores backfill ONLY for dates that have a row in
 *     customer_health_history. New merchants who just connected and haven't
 *     yet had the rules engine snapshot run will see NULLs for those days —
 *     the widget hides them gracefully.
 *   * Sequential, not parallel — each day is a small fan-out of queries
 *     already, and we don't want to slam the DB on first install.
 */
export async function backfillDailyMetrics(
  pg: Client,
  merchantId: string,
  days: number = 90
): Promise<{ days_processed: number }> {
  const today = new Date();
  let processed = 0;
  for (let i = days; i >= 1; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    d.setUTCHours(0, 0, 0, 0);
    await computeDailyMetrics(pg, merchantId, d);
    processed++;
  }
  return { days_processed: processed };
}
