/**
 * 5-signal sale auto-detector (v1.5 Phase 6).
 *
 * Compares one day's metrics against the trailing 14-day baseline to
 * identify "this day looks like a sale". Used by the threshold-layering
 * logic to widen anomaly thresholds during a likely sale (5σ instead of
 * 3σ), preventing the seasonality detector from flagging "discount usage
 * up 200%" when the merchant actually ran a Black Friday promo.
 *
 * COLD-START GUARD: returns null if the merchant has fewer than 14 days
 * of merchant_daily_metrics rows for the trailing window. New merchants
 * may legitimately experience their first 2-week sale as false-positive
 * anomalies — acceptable trade-off vs. broken detection on day 3.
 *
 * Persists detections to merchant_detected_sales as `pending`. The
 * merchant confirms / corrects / rejects via the AnomaliesPanel widget,
 * which flips `merchant_confirmation`. Confirmation feedback isn't yet
 * used to retrain — that's a v1.6 ML candidate.
 */

import type { Client } from "pg";
import type { SaleDetection, SaleSignal } from "./types";

const COLD_START_MIN_DAYS = 14;
const SIGNAL_CONFIDENCE = 0.2; // each matched signal contributes 0.2
const MIN_SIGNALS = 2;

/**
 * Run the 5-signal check for a single merchant on a single date.
 * Returns null if cold-start, no data, or fewer than 2 signals fire.
 *
 * Side effect: when ≥2 signals fire, inserts a row into
 * merchant_detected_sales with merchant_confirmation = 'pending'. The
 * caller should NOT also insert — this function owns persistence.
 */
export async function detectSale(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<SaleDetection | null> {
  // ── Cold-start guard ─────────────────────────────────────
  // We need 14 days of trailing data. If the merchant_daily_metrics
  // table doesn't yet have that many rows for this merchant, sale
  // detection is unreliable — return null and let the seasonality
  // detector fall back to the normal threshold for the day.
  const baselineRow = await pg.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM public.merchant_daily_metrics
     WHERE merchant_id = $1
       AND metric_date >= $2::date - INTERVAL '14 days'
       AND metric_date < $2::date`,
    [merchantId, isoDate(date)]
  );
  const baselineDays = parseInt(baselineRow.rows[0]?.count ?? "0", 10);
  if (baselineDays < COLD_START_MIN_DAYS) {
    return null;
  }

  // ── Today's row + trailing-14d averages ─────────────────
  const today = await getDayMetrics(pg, merchantId, date);
  if (!today) return null;

  const baseline = await getBaselineAverages(pg, merchantId, date);
  if (!baseline) return null;

  const signals: SaleSignal[] = [];

  // Signal 1: discount usage rate >2x baseline
  if (
    baseline.pct_orders_with_discount > 0 &&
    today.pct_orders_with_discount > baseline.pct_orders_with_discount * 2
  ) {
    signals.push("discount_usage_2x");
  }

  // Signal 2: AOV <75% of baseline
  if (
    baseline.aov !== null &&
    baseline.aov > 0 &&
    today.aov !== null &&
    today.aov < baseline.aov * 0.75
  ) {
    signals.push("aov_drop");
  }

  // Signal 3: order volume >2x baseline
  if (
    baseline.orders_count > 0 &&
    today.orders_count > baseline.orders_count * 2
  ) {
    signals.push("order_volume_spike");
  }

  // Signal 4: new customers >2x baseline
  if (
    baseline.new_customers > 0 &&
    today.new_customers > baseline.new_customers * 2
  ) {
    signals.push("new_customer_surge");
  }

  // Signal 5: a single discount code accounts for >40% of orders
  if (
    today.top_discount_code_usage_pct !== null &&
    today.top_discount_code_usage_pct > 0.4
  ) {
    signals.push("dominant_discount_code");
  }

  if (signals.length < MIN_SIGNALS) return null;

  const confidence = Math.min(1.0, signals.length * SIGNAL_CONFIDENCE);

  // Persist as pending — merchant confirms / corrects / rejects via the widget
  await pg.query(
    `INSERT INTO public.merchant_detected_sales
       (merchant_id, detected_start, detected_end, signals_matched, confidence_score, merchant_confirmation)
     VALUES ($1, $2, $2, $3, $4, 'pending')`,
    [merchantId, isoDate(date), signals, confidence]
  );

  return { signals, confidence };
}

// ============================================================
// Internal helpers
// ============================================================

type DayMetrics = {
  pct_orders_with_discount: number;
  aov: number | null;
  orders_count: number;
  new_customers: number;
  top_discount_code_usage_pct: number | null;
};

async function getDayMetrics(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<DayMetrics | null> {
  const { rows } = await pg.query<{
    pct_orders_with_discount: string | null;
    aov: string | null;
    orders_count: number;
    new_customers: number;
    top_discount_code_usage_pct: string | null;
  }>(
    `SELECT pct_orders_with_discount, aov, orders_count, new_customers, top_discount_code_usage_pct
     FROM public.merchant_daily_metrics
     WHERE merchant_id = $1 AND metric_date = $2`,
    [merchantId, isoDate(date)]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    pct_orders_with_discount: r.pct_orders_with_discount !== null
      ? Number(r.pct_orders_with_discount)
      : 0,
    aov: r.aov !== null ? Number(r.aov) : null,
    orders_count: r.orders_count ?? 0,
    new_customers: r.new_customers ?? 0,
    top_discount_code_usage_pct: r.top_discount_code_usage_pct !== null
      ? Number(r.top_discount_code_usage_pct)
      : null,
  };
}

async function getBaselineAverages(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<DayMetrics | null> {
  const { rows } = await pg.query<{
    pct_orders_with_discount: string | null;
    aov: string | null;
    orders_count: string | null;
    new_customers: string | null;
  }>(
    `SELECT
       AVG(pct_orders_with_discount) AS pct_orders_with_discount,
       AVG(aov) AS aov,
       AVG(orders_count)::numeric AS orders_count,
       AVG(new_customers)::numeric AS new_customers
     FROM public.merchant_daily_metrics
     WHERE merchant_id = $1
       AND metric_date >= $2::date - INTERVAL '14 days'
       AND metric_date < $2::date`,
    [merchantId, isoDate(date)]
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    pct_orders_with_discount: Number(r.pct_orders_with_discount ?? 0),
    aov: r.aov !== null ? Number(r.aov) : null,
    orders_count: Number(r.orders_count ?? 0),
    new_customers: Number(r.new_customers ?? 0),
    // Baseline for the dominant-code signal isn't averaged — the signal
    // is a same-day threshold (>40%), not a delta-vs-baseline check.
    top_discount_code_usage_pct: null,
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
