/**
 * Data-layer helpers used by Phase 3+ Vercel Cron jobs.
 *
 * Read from existing schema (orders / customers / customer_metrics /
 * customer_health_history / merchant_metrics) to compute one row per
 * merchant per day, written to merchant_daily_metrics.
 *
 * All functions take a pg.Client because the cron job opens one connection
 * for the whole batch — see app/api/cron/compute-daily-metrics/route.ts.
 *
 * UTC throughout. We aggregate by `ordered_at::date` in UTC; merchant-local
 * timezone bucketing is a v1.6+ refinement.
 */

import type { Client } from "pg";

export type ActiveMerchant = {
  id: string;
  shop_domain: string;
  country_code: string | null;
  timezone: string | null;
};

export type ActiveMerchantsOptions = {
  /** Pagination — used by chunked cron handlers. */
  limit?: number;
  offset?: number;
  /** Adds an additional WHERE clause (parameterized via $N). Used by detect-anomalies
   *  to filter for `anomaly_detection_enabled = TRUE`. Pass null to skip. */
  extraWhere?: string | null;
};

/**
 * Fetch active merchants with optional pagination + extra filter.
 *
 * Without options, returns all active merchants in install-recency order
 * (the v1 default). With `limit`/`offset`, supports chunked iteration so
 * cron jobs can process N merchants per Vercel function invocation and
 * fire-and-forget the next chunk.
 */
export async function getActiveMerchants(
  pg: Client,
  options?: ActiveMerchantsOptions
): Promise<ActiveMerchant[]> {
  const limit = options?.limit;
  const offset = options?.offset ?? 0;
  const extra = options?.extraWhere?.trim();

  // Stable ordering = `installed_at DESC, id` so OFFSET pagination is
  // deterministic across chunks. (Without ORDER BY, Postgres can return
  // a different page on each call.)
  let sql = `SELECT id, shop_domain, country_code, store_timezone AS timezone
             FROM public.merchants
             WHERE status = 'active'`;
  if (extra && extra.length > 0) sql += ` AND ${extra}`;
  sql += ` ORDER BY installed_at DESC, id`;
  if (typeof limit === "number") sql += ` LIMIT ${limit}`;
  if (offset > 0) sql += ` OFFSET ${offset}`;

  const { rows } = await pg.query<ActiveMerchant>(sql);
  return rows;
}

/** Count of active merchants matching the optional extra filter. Used by chunked
 *  crons to know when to stop firing the next chunk. */
export async function countActiveMerchants(
  pg: Client,
  extraWhere?: string | null
): Promise<number> {
  const extra = extraWhere?.trim();
  let sql = `SELECT COUNT(*)::text AS c FROM public.merchants WHERE status = 'active'`;
  if (extra && extra.length > 0) sql += ` AND ${extra}`;
  const { rows } = await pg.query<{ c: string }>(sql);
  return parseInt(rows[0].c, 10);
}

export async function calcAvgHealthScore(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<number | null> {
  const { rows } = await pg.query<{ avg: string | null }>(
    `SELECT AVG(health_score)::numeric AS avg
     FROM public.customer_health_history
     WHERE merchant_id = $1 AND computed_on = $2`,
    [merchantId, isoDate(date)]
  );
  return rows[0]?.avg !== null && rows[0]?.avg !== undefined ? Number(rows[0].avg) : null;
}

export async function calcMedianHealthScore(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<number | null> {
  const { rows } = await pg.query<{ median: string | null }>(
    `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY health_score)::numeric AS median
     FROM public.customer_health_history
     WHERE merchant_id = $1 AND computed_on = $2`,
    [merchantId, isoDate(date)]
  );
  return rows[0]?.median !== null && rows[0]?.median !== undefined
    ? Number(rows[0].median)
    : null;
}

export type LifecycleStage =
  | "lead"
  | "new"
  | "active"
  | "slipping"
  | "at_risk"
  | "churned"
  | "dormant";

export async function countByLifecycle(
  pg: Client,
  merchantId: string,
  stage: LifecycleStage,
  date: Date
): Promise<number> {
  const { rows } = await pg.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM public.customer_health_history
     WHERE merchant_id = $1 AND computed_on = $2 AND lifecycle_stage = $3`,
    [merchantId, isoDate(date), stage]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function sumRevenue(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<number> {
  const { rows } = await pg.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(order_total), 0)::numeric AS total
     FROM public.orders
     WHERE merchant_id = $1
       AND ordered_at >= $2::date
       AND ordered_at <  ($2::date + INTERVAL '1 day')`,
    [merchantId, isoDate(date)]
  );
  return Number(rows[0]?.total ?? 0);
}

export async function countOrders(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<number> {
  const { rows } = await pg.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM public.orders
     WHERE merchant_id = $1
       AND ordered_at >= $2::date
       AND ordered_at <  ($2::date + INTERVAL '1 day')`,
    [merchantId, isoDate(date)]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countNewCustomers(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<number> {
  const { rows } = await pg.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM public.customers
     WHERE merchant_id = $1
       AND first_order_at >= $2::date
       AND first_order_at <  ($2::date + INTERVAL '1 day')`,
    [merchantId, isoDate(date)]
  );
  return Number(rows[0]?.count ?? 0);
}

export async function sumPredictedClv(
  pg: Client,
  merchantId: string
): Promise<number> {
  const { rows } = await pg.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(predicted_clv_365d), 0)::numeric AS total
     FROM public.customer_metrics
     WHERE merchant_id = $1`,
    [merchantId]
  );
  return Number(rows[0]?.total ?? 0);
}

export async function sumRevenueAtRisk(
  pg: Client,
  merchantId: string
): Promise<number> {
  const { rows } = await pg.query<{ rar: string | null }>(
    `SELECT COALESCE(revenue_at_risk, 0)::numeric AS rar
     FROM public.merchant_metrics
     WHERE merchant_id = $1`,
    [merchantId]
  );
  return Number(rows[0]?.rar ?? 0);
}

export async function calcRepeatRate(
  pg: Client,
  merchantId: string
): Promise<number> {
  const { rows } = await pg.query<{ rate: string | null }>(
    `SELECT COALESCE(repeat_purchase_rate, 0)::numeric AS rate
     FROM public.merchant_metrics
     WHERE merchant_id = $1`,
    [merchantId]
  );
  return Number(rows[0]?.rate ?? 0);
}

// ============================================================
// Sale-detection signals (Phase 6 — anomaly seasonality stack)
// ============================================================

export async function calcAov(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<number | null> {
  const { rows } = await pg.query<{ aov: string | null }>(
    `SELECT AVG(order_total)::numeric AS aov
     FROM public.orders
     WHERE merchant_id = $1
       AND ordered_at >= $2::date
       AND ordered_at <  ($2::date + INTERVAL '1 day')`,
    [merchantId, isoDate(date)]
  );
  return rows[0]?.aov !== null && rows[0]?.aov !== undefined ? Number(rows[0].aov) : null;
}

export async function calcDiscountUsageRate(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<number> {
  const { rows } = await pg.query<{ rate: string | null }>(
    `SELECT
       CASE WHEN COUNT(*) = 0 THEN 0
            ELSE COUNT(*) FILTER (WHERE discount_total > 0)::numeric / COUNT(*)
       END AS rate
     FROM public.orders
     WHERE merchant_id = $1
       AND ordered_at >= $2::date
       AND ordered_at <  ($2::date + INTERVAL '1 day')`,
    [merchantId, isoDate(date)]
  );
  return Number(rows[0]?.rate ?? 0);
}

/**
 * Most-used Shopify discount code on a given day, with usage % of all orders.
 *
 * Reads `discount_codes` array out of orders.raw_data (Shopify's payload shape).
 * Returns null if no orders or no discount codes seen.
 */
export async function getTopDiscountCode(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<{ code: string; usage_pct: number } | null> {
  const { rows } = await pg.query<{ code: string; usage_count: string; total_orders: string }>(
    `WITH day_orders AS (
       SELECT id, raw_data
       FROM public.orders
       WHERE merchant_id = $1
         AND ordered_at >= $2::date
         AND ordered_at <  ($2::date + INTERVAL '1 day')
     ),
     codes AS (
       SELECT
         (jsonb_array_elements(raw_data->'discount_codes')->>'code') AS code
       FROM day_orders
       WHERE jsonb_typeof(raw_data->'discount_codes') = 'array'
         AND jsonb_array_length(raw_data->'discount_codes') > 0
     )
     SELECT
       code,
       COUNT(*)::text AS usage_count,
       (SELECT COUNT(*) FROM day_orders)::text AS total_orders
     FROM codes
     WHERE code IS NOT NULL AND code <> ''
     GROUP BY code
     ORDER BY COUNT(*) DESC
     LIMIT 1`,
    [merchantId, isoDate(date)]
  );
  if (rows.length === 0) return null;
  const totalOrders = Number(rows[0].total_orders);
  if (totalOrders === 0) return null;
  return {
    code: rows[0].code,
    usage_pct: Number(rows[0].usage_count) / totalOrders,
  };
}

// ============================================================
// Internal
// ============================================================

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}
