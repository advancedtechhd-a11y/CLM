/**
 * Compute merchant-level aggregate metrics.
 *
 * Reads from public.customers + public.orders.
 * Writes one row per merchant to public.merchant_metrics (upsert).
 */

import type { Client } from "pg";
import { median, percentile, daysBetween } from "./stats";

export interface MerchantMetrics {
  // Repurchase cycle
  median_repurchase_days: number;
  p75_repurchase_days: number;
  p90_repurchase_days: number;
  repurchase_sample_size: number;

  // Customer base
  total_customers: number;
  active_customers_30d: number;
  total_orders: number;
  total_revenue: number;
  avg_order_value: number;
  avg_orders_per_customer: number;
  median_orders_per_customer: number;
  p90_orders_per_customer: number;
  repeat_purchase_rate: number;

  // Spend percentiles (for tier assignment)
  spend_p50: number;
  spend_p80: number;
  spend_p95: number;

  // First-to-Second tracker
  first_to_second_conversion_rate: number;
  median_days_to_second_purchase: number;

  // Concentration
  top_10_pct_revenue_share: number;
  concentration_risk_level: string;
  top_5_customer_annual_value: number;

  // Discount dependency (merchant-wide)
  merchant_discount_dependency_pct: number;
}

export async function computeMerchantMetrics(
  pg: Client,
  merchantId: string
): Promise<MerchantMetrics> {
  // === Get all customers + their order data ===
  const customersRes = await pg.query<{
    id: string;
    total_spent: string;
    orders_count: number;
    first_order_at: string | null;
    last_order_at: string | null;
  }>(
    `
    SELECT id, total_spent, orders_count, first_order_at, last_order_at
    FROM public.customers
    WHERE merchant_id = $1
    `,
    [merchantId]
  );
  const customers = customersRes.rows;
  const totalCustomers = customers.length;

  // === Get all orders ===
  const ordersRes = await pg.query<{
    id: string;
    customer_id: string | null;
    order_total: string;
    discount_total: string;
    ordered_at: string;
  }>(
    `
    SELECT id, customer_id, order_total, discount_total, ordered_at
    FROM public.orders
    WHERE merchant_id = $1
    ORDER BY customer_id, ordered_at
    `,
    [merchantId]
  );
  const orders = ordersRes.rows;
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((s, o) => s + parseFloat(o.order_total), 0);
  const totalDiscountedOrders = orders.filter((o) => parseFloat(o.discount_total) > 0).length;

  // === Repurchase cycle (median, p75, p90) ===
  // Group orders by customer, compute intervals between consecutive orders
  const ordersByCustomer = new Map<string, string[]>();
  for (const o of orders) {
    if (!o.customer_id) continue;
    if (!ordersByCustomer.has(o.customer_id)) ordersByCustomer.set(o.customer_id, []);
    ordersByCustomer.get(o.customer_id)!.push(o.ordered_at);
  }

  const intervals: number[] = [];
  for (const [, dates] of ordersByCustomer) {
    if (dates.length < 2) continue;
    dates.sort();
    for (let i = 1; i < dates.length; i++) {
      const days = daysBetween(dates[i - 1], dates[i]);
      if (days >= 1 && days <= 365) intervals.push(days);
    }
  }
  const medianRepurchase = intervals.length > 0 ? median(intervals) : 0;
  const p75Repurchase = intervals.length > 0 ? percentile(intervals, 75) : 0;
  const p90Repurchase = intervals.length > 0 ? percentile(intervals, 90) : 0;

  // === Customer base aggregates (derived from orders table — more reliable) ===
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  // Per-customer order date map (use this instead of customers.last_order_at)
  const ordersByCustomerLocal = new Map<string, string[]>();
  for (const o of orders) {
    if (!o.customer_id) continue;
    if (!ordersByCustomerLocal.has(o.customer_id)) ordersByCustomerLocal.set(o.customer_id, []);
    ordersByCustomerLocal.get(o.customer_id)!.push(o.ordered_at);
  }

  const activeCustomers30d = Array.from(ordersByCustomerLocal.values()).filter((dates) => {
    const sorted = [...dates].sort();
    return new Date(sorted[sorted.length - 1]) > thirtyDaysAgo;
  }).length;

  const ordersPerCustomer = customers.map((c) => ordersByCustomerLocal.get(c.id)?.length ?? 0);
  const customersWithRepeats = ordersPerCustomer.filter((n) => n >= 2).length;
  const repeatPurchaseRate = totalCustomers > 0 ? customersWithRepeats / totalCustomers : 0;

  // === Spend percentiles (derived from orders, not customers.total_spent — more reliable) ===
  const spendByCustomer = new Map<string, number>();
  for (const o of orders) {
    if (!o.customer_id) continue;
    spendByCustomer.set(o.customer_id, (spendByCustomer.get(o.customer_id) ?? 0) + parseFloat(o.order_total));
  }
  const spend = Array.from(spendByCustomer.values()).filter((v) => v > 0);
  const spendP50 = spend.length > 0 ? percentile(spend, 50) : 0;
  const spendP80 = spend.length > 0 ? percentile(spend, 80) : 0;
  const spendP95 = spend.length > 0 ? percentile(spend, 95) : 0;

  // === First-to-Second purchase tracker (derived from orders table) ===
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(today.getDate() - 90);

  let eligibleForFtSCount = 0;
  let convertedFtSCount = 0;
  for (const [, dates] of ordersByCustomerLocal) {
    if (dates.length === 0) continue;
    const sorted = [...dates].sort();
    if (new Date(sorted[0]) > ninetyDaysAgo) continue; // first purchase <90d ago, not eligible
    eligibleForFtSCount++;
    if (dates.length >= 2) convertedFtSCount++;
  }
  const ftsConversionRate =
    eligibleForFtSCount > 0 ? convertedFtSCount / eligibleForFtSCount : 0;

  // Days from 1st to 2nd order for converted customers
  const daysToSecond: number[] = [];
  for (const [customerId, dates] of ordersByCustomer) {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer || (customer.orders_count ?? 0) < 2) continue;
    if (dates.length < 2) continue;
    dates.sort();
    daysToSecond.push(daysBetween(dates[0], dates[1]));
  }
  const medianDaysToSecond = daysToSecond.length > 0 ? Math.round(median(daysToSecond)) : 0;

  // === Concentration risk (derived from orders table) ===
  const spendSorted = Array.from(spendByCustomer.values()).sort((a, b) => b - a);
  const top10PctCount = Math.max(1, Math.floor(totalCustomers * 0.1));
  const top10PctRevenue = spendSorted.slice(0, top10PctCount).reduce((s, v) => s + v, 0);
  const top10PctShare = totalRevenue > 0 ? top10PctRevenue / totalRevenue : 0;
  const concentrationRiskLevel =
    top10PctShare > 0.5 ? "high" : top10PctShare > 0.35 ? "medium" : "low";
  const top5CustomerAnnualValue = spendSorted.slice(0, 5).reduce((s, v) => s + v, 0);

  // === Discount dependency (merchant-wide) ===
  const merchantDiscountPct = totalOrders > 0 ? totalDiscountedOrders / totalOrders : 0;

  return {
    median_repurchase_days: Math.round(medianRepurchase),
    p75_repurchase_days: Math.round(p75Repurchase),
    p90_repurchase_days: Math.round(p90Repurchase),
    repurchase_sample_size: intervals.length,

    total_customers: totalCustomers,
    active_customers_30d: activeCustomers30d,
    total_orders: totalOrders,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    avg_order_value: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    avg_orders_per_customer:
      totalCustomers > 0 ? Math.round((totalOrders / totalCustomers) * 100) / 100 : 0,
    median_orders_per_customer:
      ordersPerCustomer.length > 0 ? Math.round(median(ordersPerCustomer)) : 0,
    p90_orders_per_customer:
      ordersPerCustomer.length > 0 ? Math.round(percentile(ordersPerCustomer, 90)) : 0,
    repeat_purchase_rate: Math.round(repeatPurchaseRate * 10000) / 10000,

    spend_p50: Math.round(spendP50 * 100) / 100,
    spend_p80: Math.round(spendP80 * 100) / 100,
    spend_p95: Math.round(spendP95 * 100) / 100,

    first_to_second_conversion_rate: Math.round(ftsConversionRate * 10000) / 10000,
    median_days_to_second_purchase: medianDaysToSecond,

    top_10_pct_revenue_share: Math.round(top10PctShare * 10000) / 10000,
    concentration_risk_level: concentrationRiskLevel,
    top_5_customer_annual_value: Math.round(top5CustomerAnnualValue * 100) / 100,

    merchant_discount_dependency_pct: Math.round(merchantDiscountPct * 10000) / 10000,
  };
}

export async function saveMerchantMetrics(
  pg: Client,
  merchantId: string,
  m: MerchantMetrics
): Promise<void> {
  await pg.query(
    `
    INSERT INTO public.merchant_metrics (
      merchant_id,
      median_repurchase_days, p75_repurchase_days, p90_repurchase_days, repurchase_sample_size,
      total_customers, active_customers_30d, total_orders, total_revenue,
      avg_order_value, avg_orders_per_customer, median_orders_per_customer, p90_orders_per_customer,
      repeat_purchase_rate,
      spend_p50, spend_p80, spend_p95,
      first_to_second_conversion_rate, median_days_to_second_purchase,
      top_10_pct_revenue_share, concentration_risk_level, top_5_customer_annual_value,
      merchant_discount_dependency_pct,
      computed_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW()
    )
    ON CONFLICT (merchant_id) DO UPDATE SET
      median_repurchase_days = EXCLUDED.median_repurchase_days,
      p75_repurchase_days = EXCLUDED.p75_repurchase_days,
      p90_repurchase_days = EXCLUDED.p90_repurchase_days,
      repurchase_sample_size = EXCLUDED.repurchase_sample_size,
      total_customers = EXCLUDED.total_customers,
      active_customers_30d = EXCLUDED.active_customers_30d,
      total_orders = EXCLUDED.total_orders,
      total_revenue = EXCLUDED.total_revenue,
      avg_order_value = EXCLUDED.avg_order_value,
      avg_orders_per_customer = EXCLUDED.avg_orders_per_customer,
      median_orders_per_customer = EXCLUDED.median_orders_per_customer,
      p90_orders_per_customer = EXCLUDED.p90_orders_per_customer,
      repeat_purchase_rate = EXCLUDED.repeat_purchase_rate,
      spend_p50 = EXCLUDED.spend_p50,
      spend_p80 = EXCLUDED.spend_p80,
      spend_p95 = EXCLUDED.spend_p95,
      first_to_second_conversion_rate = EXCLUDED.first_to_second_conversion_rate,
      median_days_to_second_purchase = EXCLUDED.median_days_to_second_purchase,
      top_10_pct_revenue_share = EXCLUDED.top_10_pct_revenue_share,
      concentration_risk_level = EXCLUDED.concentration_risk_level,
      top_5_customer_annual_value = EXCLUDED.top_5_customer_annual_value,
      merchant_discount_dependency_pct = EXCLUDED.merchant_discount_dependency_pct,
      computed_at = NOW()
    `,
    [
      merchantId,
      m.median_repurchase_days,
      m.p75_repurchase_days,
      m.p90_repurchase_days,
      m.repurchase_sample_size,
      m.total_customers,
      m.active_customers_30d,
      m.total_orders,
      m.total_revenue,
      m.avg_order_value,
      m.avg_orders_per_customer,
      m.median_orders_per_customer,
      m.p90_orders_per_customer,
      m.repeat_purchase_rate,
      m.spend_p50,
      m.spend_p80,
      m.spend_p95,
      m.first_to_second_conversion_rate,
      m.median_days_to_second_purchase,
      m.top_10_pct_revenue_share,
      m.concentration_risk_level,
      m.top_5_customer_annual_value,
      m.merchant_discount_dependency_pct,
    ]
  );
}
