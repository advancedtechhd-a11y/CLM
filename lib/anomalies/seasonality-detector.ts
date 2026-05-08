/**
 * Day-of-week seasonality-aware anomaly detector (v1.5 Phase 6).
 *
 * The core algorithm. Replaces the v1.1 detector that used a global
 * 14-day-rolling baseline (which spuriously flagged every Tuesday revenue
 * dip on a merchant whose business is M/W/F-heavy).
 *
 * Algorithm per merchant per day:
 *   1. Pull yesterday's row from merchant_daily_metrics
 *   2. Pull last 8 weeks of SAME-DAY-OF-WEEK rows (Tuesdays to Tuesdays)
 *   3. Cold-start guard — need ≥4 same-day samples; bail if not
 *   4. Determine threshold via the layering helper:
 *        snoozed → null (skip)
 *        sale → 5σ
 *        public_holiday → 4σ
 *        normal → 3σ
 *   5. For each metric in ANOMALY_METRICS:
 *        - compute mean + sample stddev of the same-day baseline
 *        - z-score = |today - mean| / stddev
 *        - if z > threshold → record anomaly with metric-specific
 *          description and severity bucket
 *   6. Bulk-INSERT anomalies in one statement (idempotent: dedupes via
 *      a composite key check on (merchant_id, metric, detected_at::date))
 *
 * Quiet rollout: caller (the cron route) is expected to filter merchants
 * by anomaly_detection_enabled = TRUE before invoking. This module does
 * NOT re-check, so manual scripts can run it on any merchant.
 */

import type { Client } from "pg";
import { mean, standardDeviation } from "../rules/stats";
import { ANOMALY_METRICS, type AnomalyMetric, type DetectedAnomaly } from "./types";
import { determineThreshold } from "./threshold";
import { describeAnomaly, severityFromSigma } from "./description";

const BASELINE_WEEKS = 8;
const MIN_SAME_DAY_SAMPLES = 4;

type DailyMetricsRow = {
  metric_date: string;
  avg_health_score: number | null;
  revenue: number;
  orders_count: number;
  new_customers: number;
  repeat_rate: number;
  revenue_at_risk: number;
};

export type DetectionResult = {
  merchant_id: string;
  date: string;
  detected: number;
  reason: string | null; // 'snoozed' | 'no_data' | 'cold_start' | 'completed'
};

export async function detectAnomaliesForMerchant(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<DetectionResult> {
  const isoDate = date.toISOString().slice(0, 10);
  const dayOfWeek = date.getUTCDay();

  // Pull yesterday's row
  const todayRow = await fetchRow(pg, merchantId, date);
  if (!todayRow) {
    return { merchant_id: merchantId, date: isoDate, detected: 0, reason: "no_data" };
  }

  // Pull last 8 weeks of same-day-of-week rows
  const sameDaySamples = await fetchSameDayBaseline(pg, merchantId, date, BASELINE_WEEKS);
  if (sameDaySamples.length < MIN_SAME_DAY_SAMPLES) {
    return {
      merchant_id: merchantId,
      date: isoDate,
      detected: 0,
      reason: "cold_start",
    };
  }

  // Determine threshold (snoozed/sale/holiday/normal). Side effect: persists
  // detected sales to merchant_detected_sales when sale signals fire.
  const threshold = await determineThreshold(pg, merchantId, date);
  if (threshold === null) {
    return { merchant_id: merchantId, date: isoDate, detected: 0, reason: "snoozed" };
  }

  // Get merchant currency (for revenue/RAR descriptions)
  const merchantInfo = await pg.query<{ store_currency: string | null }>(
    `SELECT store_currency FROM public.merchants WHERE id = $1`,
    [merchantId]
  );
  const currency = merchantInfo.rows[0]?.store_currency ?? "USD";

  // Test each metric
  const detected: DetectedAnomaly[] = [];

  for (const metric of ANOMALY_METRICS) {
    const baselineValues = sameDaySamples
      .map((s) => extractMetric(s, metric))
      .filter((v): v is number => v !== null);

    if (baselineValues.length < MIN_SAME_DAY_SAMPLES) continue;

    const baselineMean = mean(baselineValues);
    const baselineStd = standardDeviation(baselineValues);
    if (baselineStd === 0) continue; // perfectly stable metric — skip

    const todayValue = extractMetric(todayRow, metric);
    if (todayValue === null) continue;

    const sigma = Math.abs((todayValue - baselineMean) / baselineStd);
    if (sigma <= threshold.value) continue;

    detected.push({
      merchant_id: merchantId,
      metric,
      current_value: todayValue,
      expected_value: baselineMean,
      deviation_sigma: sigma,
      severity: severityFromSigma(sigma, threshold.value),
      description: describeAnomaly({
        metric,
        currentValue: todayValue,
        expectedValue: baselineMean,
        dayOfWeek,
        currency,
      }),
      detected_for_day_of_week: dayOfWeek,
      detection_reason: threshold.reason,
      threshold_used: threshold.value,
    });
  }

  if (detected.length > 0) {
    await insertAnomalies(pg, detected, date);
  }

  return {
    merchant_id: merchantId,
    date: isoDate,
    detected: detected.length,
    reason: "completed",
  };
}

// ============================================================
// Internal helpers
// ============================================================

async function fetchRow(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<DailyMetricsRow | null> {
  const { rows } = await pg.query(
    `SELECT metric_date::text, avg_health_score, revenue, orders_count, new_customers,
            repeat_rate, revenue_at_risk
     FROM public.merchant_daily_metrics
     WHERE merchant_id = $1 AND metric_date = $2`,
    [merchantId, date.toISOString().slice(0, 10)]
  );
  if (rows.length === 0) return null;
  return normalizeRow(rows[0]);
}

async function fetchSameDayBaseline(
  pg: Client,
  merchantId: string,
  date: Date,
  weeks: number
): Promise<DailyMetricsRow[]> {
  // Same-day-of-week samples: today's date minus 7, 14, 21, ..., (weeks*7) days
  const dates: string[] = [];
  for (let w = 1; w <= weeks; w++) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() - 7 * w);
    dates.push(d.toISOString().slice(0, 10));
  }

  const { rows } = await pg.query(
    `SELECT metric_date::text, avg_health_score, revenue, orders_count, new_customers,
            repeat_rate, revenue_at_risk
     FROM public.merchant_daily_metrics
     WHERE merchant_id = $1 AND metric_date = ANY($2::date[])`,
    [merchantId, dates]
  );
  return rows.map(normalizeRow);
}

function normalizeRow(r: any): DailyMetricsRow {
  return {
    metric_date: r.metric_date,
    avg_health_score: r.avg_health_score !== null ? Number(r.avg_health_score) : null,
    revenue: Number(r.revenue ?? 0),
    orders_count: Number(r.orders_count ?? 0),
    new_customers: Number(r.new_customers ?? 0),
    repeat_rate: Number(r.repeat_rate ?? 0),
    revenue_at_risk: Number(r.revenue_at_risk ?? 0),
  };
}

function extractMetric(row: DailyMetricsRow, metric: AnomalyMetric): number | null {
  switch (metric) {
    case "avg_health_score":
      return row.avg_health_score;
    case "revenue":
      return row.revenue;
    case "orders_count":
      return row.orders_count;
    case "new_customers":
      return row.new_customers;
    case "repeat_rate":
      return row.repeat_rate;
    case "revenue_at_risk":
      return row.revenue_at_risk;
  }
}

/**
 * Insert anomaly rows. Idempotent within a single day per (merchant, metric):
 * deletes any existing seasonality-detected anomaly for the same merchant+metric
 * detected today before inserting, so re-running the cron doesn't duplicate.
 *
 * Legacy v1.1 anomalies (anomaly_type IS NOT NULL, metric IS NULL) are NOT
 * affected — the WHERE clause only matches new-format rows.
 */
async function insertAnomalies(
  pg: Client,
  anomalies: DetectedAnomaly[],
  date: Date
): Promise<void> {
  const isoDate = date.toISOString().slice(0, 10);
  const merchantId = anomalies[0].merchant_id;
  const metrics = anomalies.map((a) => a.metric);

  // Delete prior same-day rows for these specific metrics (idempotency)
  await pg.query(
    `DELETE FROM public.anomalies
     WHERE merchant_id = $1
       AND metric = ANY($2::text[])
       AND detected_at::date = $3::date
       AND anomaly_type IS NULL`, // only new-format rows
    [merchantId, metrics, isoDate]
  );

  // Bulk insert
  const valueClauses: string[] = [];
  const params: any[] = [];
  let p = 0;
  for (const a of anomalies) {
    const slots = Array.from({ length: 11 }, () => `$${++p}`).join(", ");
    valueClauses.push(`(${slots})`);
    params.push(
      a.merchant_id,
      a.severity,
      a.metric,
      a.current_value,
      a.expected_value,
      a.deviation_sigma,
      a.description,
      a.detected_for_day_of_week,
      a.detection_reason,
      a.threshold_used,
      isoDate // detected_at — explicit so re-runs use the correct date
    );
  }

  await pg.query(
    `INSERT INTO public.anomalies
       (merchant_id, severity, metric, current_value, expected_value,
        deviation_sigma, description, detected_for_day_of_week,
        detection_reason, threshold_used, detected_at)
     VALUES ${valueClauses.join(", ")}`,
    params
  );
}
