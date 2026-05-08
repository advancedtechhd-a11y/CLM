/**
 * Cohort metrics — used by the Phase 4 nightly cron
 * (app/api/cron/compute-cohort-metrics) to populate merchant_cohort_metrics.
 *
 * A cohort is the set of customers whose first_order_at falls within a single
 * calendar month (UTC). Retention is "did any cohort customer place another
 * order at least N days after their first?" — measured at 30/60/90 day marks.
 *
 * All functions take a pg.Client because the cron opens one connection.
 */

import type { Client } from "pg";

/**
 * Number of customers whose first order was in the given month.
 * Pass any Date inside the month — we floor to the first day internally.
 */
export async function countCohortSize(
  pg: Client,
  merchantId: string,
  month: Date
): Promise<number> {
  const start = monthStart(month);
  const end = monthEnd(month);
  const { rows } = await pg.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM public.customers
     WHERE merchant_id = $1
       AND first_order_at >= $2
       AND first_order_at <  $3`,
    [merchantId, start, end]
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Of customers in the cohort (first_order_at in `month`), how many placed
 * AT LEAST ONE additional order on or after first_order_at + `days`.
 *
 * Returns null if not enough time has elapsed yet (cohort is younger than
 * `days`) — caller should write NULL into the column rather than 0, so the
 * widget can render a dash instead of a misleading zero.
 */
export async function countRetainedAt(
  pg: Client,
  merchantId: string,
  month: Date,
  days: number,
  now: Date = new Date()
): Promise<number | null> {
  const start = monthStart(month);
  const end = monthEnd(month);

  // Cold-start guard: if even the LAST day of the cohort month hasn't yet
  // had `days` elapse, retention at this mark is undefined.
  const cohortMaturityDate = new Date(end.getTime() + days * 24 * 60 * 60 * 1000);
  if (now < cohortMaturityDate) return null;

  const { rows } = await pg.query<{ count: string }>(
    `SELECT COUNT(DISTINCT c.id) AS count
     FROM public.customers c
     JOIN public.orders o ON o.customer_id = c.id
     WHERE c.merchant_id = $1
       AND c.first_order_at >= $2
       AND c.first_order_at <  $3
       AND o.ordered_at >= c.first_order_at + ($4 || ' days')::interval
       AND o.id <> (
         SELECT id FROM public.orders
         WHERE customer_id = c.id
         ORDER BY ordered_at ASC
         LIMIT 1
       )`,
    [merchantId, start, end, String(days)]
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Total revenue from all orders placed by the cohort, all-time.
 * Useful for "lifetime value of this cohort" reporting.
 */
export async function sumCohortRevenue(
  pg: Client,
  merchantId: string,
  month: Date
): Promise<number> {
  const start = monthStart(month);
  const end = monthEnd(month);
  const { rows } = await pg.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(o.order_total), 0)::numeric AS total
     FROM public.customers c
     JOIN public.orders o ON o.customer_id = c.id
     WHERE c.merchant_id = $1
       AND c.first_order_at >= $2
       AND c.first_order_at <  $3`,
    [merchantId, start, end]
  );
  return Number(rows[0]?.total ?? 0);
}

// ============================================================
// Internal
// ============================================================

function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function monthEnd(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}
