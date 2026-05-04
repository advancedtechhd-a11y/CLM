/**
 * Compute per-customer metrics: RFM, lifecycle stage, churn prob, CLV, tier, Health Score.
 *
 * Reads from public.customers + public.orders + public.merchant_metrics.
 * Writes one row per customer to public.customer_metrics (upsert).
 *
 * For MVP: rules-based (median multipliers, formulas).
 * Phase 4 will replace churn/CLV/NBP with ML models.
 */

import type { Client } from "pg";
import { median, percentile, daysBetween } from "./stats";

interface CustomerData {
  id: string;
  total_spent: string;
  orders_count: number;
  first_order_at: string | null;
  last_order_at: string | null;
  email_unsubscribed: boolean;
}

interface MerchantMetricsRow {
  median_repurchase_days: number;
  median_orders_per_customer: number;
  p90_orders_per_customer: number;
  spend_p50: number;
  spend_p80: number;
  spend_p95: number;
  total_customers: number;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function computeCustomerMetrics(
  pg: Client,
  merchantId: string
): Promise<{ customersComputed: number; lifecycleDistribution: Record<string, number>; tierDistribution: Record<string, number> }> {
  // Load merchant metrics (we need them for thresholds)
  const mmRes = await pg.query<MerchantMetricsRow>(
    `SELECT median_repurchase_days, median_orders_per_customer, p90_orders_per_customer,
            spend_p50, spend_p80, spend_p95, total_customers
     FROM public.merchant_metrics WHERE merchant_id = $1`,
    [merchantId]
  );
  if (mmRes.rows.length === 0) {
    throw new Error("No merchant_metrics row — run computeMerchantMetrics first");
  }
  const mm = mmRes.rows[0];

  // Load all customers + their orders
  const customersRes = await pg.query<CustomerData>(
    `SELECT id, total_spent, orders_count, first_order_at, last_order_at, email_unsubscribed
     FROM public.customers WHERE merchant_id = $1`,
    [merchantId]
  );
  const customers = customersRes.rows;

  // Pre-load all order intervals per customer (for personal cycle calculation)
  const ordersByCustomer = new Map<string, string[]>();
  const discountByCustomer = new Map<string, { total: number; discounted: number }>();
  const bnplByCustomer = new Map<string, boolean>();
  const orderTotalByCustomer = new Map<string, number>();
  const allOrders = await pg.query<{
    customer_id: string;
    ordered_at: string;
    discount_total: string;
    order_total: string;
    bnpl_provider: string | null;
  }>(
    `SELECT customer_id, ordered_at, discount_total, order_total, bnpl_provider
     FROM public.orders WHERE merchant_id = $1`,
    [merchantId]
  );
  for (const o of allOrders.rows) {
    if (!o.customer_id) continue;
    if (!ordersByCustomer.has(o.customer_id)) ordersByCustomer.set(o.customer_id, []);
    ordersByCustomer.get(o.customer_id)!.push(o.ordered_at);

    if (!discountByCustomer.has(o.customer_id))
      discountByCustomer.set(o.customer_id, { total: 0, discounted: 0 });
    const dd = discountByCustomer.get(o.customer_id)!;
    dd.total++;
    if (parseFloat(o.discount_total) > 0) dd.discounted++;

    orderTotalByCustomer.set(
      o.customer_id,
      (orderTotalByCustomer.get(o.customer_id) ?? 0) + parseFloat(o.order_total)
    );

    if (o.bnpl_provider) bnplByCustomer.set(o.customer_id, true);
  }

  const lifecycleDistribution: Record<string, number> = {};
  const tierDistribution: Record<string, number> = {};

  // Compute spend percentiles for each customer (used in monetary score)
  const allSpend = customers.map((c) => parseFloat(c.total_spent ?? "0"));

  let computedCount = 0;
  for (const c of customers) {
    // Derive ground-truth from orders table (Shopify's customer.last_order_at is unreliable for backdated orders)
    const customerOrderDates = ordersByCustomer.get(c.id) ?? [];
    const sortedDates = [...customerOrderDates].sort();
    const firstOrderFromOrders = sortedDates.length > 0 ? new Date(sortedDates[0]) : null;
    const lastOrderFromOrders = sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]) : null;

    // Use derived values, falling back to customers table
    const totalSpent = orderTotalByCustomer.get(c.id) ?? parseFloat(c.total_spent ?? "0");
    const ordersCount = customerOrderDates.length || (c.orders_count ?? 0);
    const lastOrderAt = lastOrderFromOrders ?? (c.last_order_at ? new Date(c.last_order_at) : null);
    const firstOrderAt = firstOrderFromOrders ?? (c.first_order_at ? new Date(c.first_order_at) : null);
    const recencyDays = lastOrderAt
      ? Math.max(0, daysBetween(lastOrderAt, new Date()))
      : null;

    // === Personal repurchase cycle ===
    const personalIntervals: number[] = [];
    const dates = ordersByCustomer.get(c.id) ?? [];
    if (dates.length >= 2) {
      const sorted = [...dates].sort();
      for (let i = 1; i < sorted.length; i++) {
        const days = daysBetween(sorted[i - 1], sorted[i]);
        if (days >= 1 && days <= 365) personalIntervals.push(days);
      }
    }
    let expectedCycle: number;
    if (personalIntervals.length >= 3) {
      expectedCycle = median(personalIntervals);
    } else if (personalIntervals.length >= 1) {
      const w = personalIntervals.length / 3;
      expectedCycle = w * median(personalIntervals) + (1 - w) * mm.median_repurchase_days;
    } else {
      expectedCycle = mm.median_repurchase_days || 30; // fallback
    }
    expectedCycle = Math.max(1, Math.round(expectedCycle));

    // === Lifecycle stage ===
    const stage = classifyLifecycleStage(
      { ...c, orders_count: ordersCount, first_order_at: firstOrderAt ? firstOrderAt.toISOString() : null },
      recencyDays,
      expectedCycle
    );

    // === Cycle ratio ===
    const cycleRatio = recencyDays !== null && expectedCycle > 0 ? recencyDays / expectedCycle : null;
    const isOverdue = cycleRatio !== null && cycleRatio > 1.0;

    // === RFM ===
    const recencyScore_5 = scoreRecency5(recencyDays, expectedCycle);
    const frequencyScore_5 = scoreFrequency5(ordersCount, mm);
    const monetaryScore_5 = scoreMonetary5(totalSpent, mm);
    const rfmScore = `${recencyScore_5}${frequencyScore_5}${monetaryScore_5}`;
    const rfmSegment = classifyRFM(recencyScore_5, frequencyScore_5, monetaryScore_5);

    // === Value tier ===
    const valueTier = classifyValueTier(totalSpent, allSpend);

    // === Churn probability (rules-based) ===
    const churnProb = computeChurnProb(ordersCount, cycleRatio);

    // === CLV (simple historical + projected) ===
    const aov = ordersCount > 0 ? totalSpent / ordersCount : 0;
    const survivalProb = 1 - churnProb;
    const yearlyOrders = expectedCycle > 0 ? 365 / expectedCycle : 0;
    const clv90 = ordersCount > 0 ? aov * (90 / expectedCycle) * survivalProb : 0;
    const clv180 = ordersCount > 0 ? aov * (180 / expectedCycle) * survivalProb * 0.85 : 0;
    const clv365 = ordersCount > 0 ? aov * (365 / expectedCycle) * survivalProb * 0.65 : 0;

    // === Predicted next order date ===
    const predictedNext = lastOrderAt
      ? new Date(lastOrderAt.getTime() + expectedCycle * 86400000)
      : null;

    // === Discount dependency ===
    const dd = discountByCustomer.get(c.id) ?? { total: 0, discounted: 0 };
    const ddPct = dd.total > 0 ? dd.discounted / dd.total : 0;
    const ddCategory =
      ddPct >= 0.7
        ? "highly_dependent"
        : ddPct >= 0.4
        ? "moderately_dependent"
        : ddPct >= 0.15
        ? "occasional_user"
        : "full_price_buyer";

    // === BNPL flag ===
    const isBnpl = bnplByCustomer.get(c.id) ?? false;

    // === Health Score ===
    const health = computeHealthScore({
      cycleRatio,
      ordersCount,
      mmMedianOrders: mm.median_orders_per_customer,
      mmP90Orders: mm.p90_orders_per_customer,
      totalSpent,
      mmSpendP50: mm.spend_p50,
      mmSpendP80: mm.spend_p80,
      mmSpendP95: mm.spend_p95,
      personalCycleDays: personalIntervals.length >= 1 ? Math.round(median(personalIntervals)) : null,
      recencyDays,
      emailUnsubscribed: c.email_unsubscribed,
    });

    // Track distribution
    lifecycleDistribution[stage] = (lifecycleDistribution[stage] ?? 0) + 1;
    tierDistribution[valueTier] = (tierDistribution[valueTier] ?? 0) + 1;

    // === Upsert ===
    await pg.query(
      `
      INSERT INTO public.customer_metrics (
        merchant_id, customer_id,
        recency_days, frequency, monetary, rfm_score, rfm_segment,
        lifecycle_stage,
        value_tier,
        churn_probability,
        predicted_clv_90d, predicted_clv_180d, predicted_clv_365d,
        predicted_next_order_date, expected_repurchase_cycle_days,
        is_overdue, overdue_ratio,
        health_score, health_score_band,
        recency_score, frequency_score, monetary_score, engagement_score, cycle_adherence_score,
        avg_order_value, avg_order_frequency_days,
        discount_dependency_pct, discount_dependency_category,
        is_bnpl_user,
        computed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, NOW()
      )
      ON CONFLICT (merchant_id, customer_id) DO UPDATE SET
        recency_days = EXCLUDED.recency_days,
        frequency = EXCLUDED.frequency,
        monetary = EXCLUDED.monetary,
        rfm_score = EXCLUDED.rfm_score,
        rfm_segment = EXCLUDED.rfm_segment,
        lifecycle_stage = EXCLUDED.lifecycle_stage,
        value_tier = EXCLUDED.value_tier,
        churn_probability = EXCLUDED.churn_probability,
        predicted_clv_90d = EXCLUDED.predicted_clv_90d,
        predicted_clv_180d = EXCLUDED.predicted_clv_180d,
        predicted_clv_365d = EXCLUDED.predicted_clv_365d,
        predicted_next_order_date = EXCLUDED.predicted_next_order_date,
        expected_repurchase_cycle_days = EXCLUDED.expected_repurchase_cycle_days,
        is_overdue = EXCLUDED.is_overdue,
        overdue_ratio = EXCLUDED.overdue_ratio,
        health_score = EXCLUDED.health_score,
        health_score_band = EXCLUDED.health_score_band,
        recency_score = EXCLUDED.recency_score,
        frequency_score = EXCLUDED.frequency_score,
        monetary_score = EXCLUDED.monetary_score,
        engagement_score = EXCLUDED.engagement_score,
        cycle_adherence_score = EXCLUDED.cycle_adherence_score,
        avg_order_value = EXCLUDED.avg_order_value,
        avg_order_frequency_days = EXCLUDED.avg_order_frequency_days,
        discount_dependency_pct = EXCLUDED.discount_dependency_pct,
        discount_dependency_category = EXCLUDED.discount_dependency_category,
        is_bnpl_user = EXCLUDED.is_bnpl_user,
        computed_at = NOW()
      `,
      [
        merchantId,
        c.id,
        recencyDays,
        ordersCount,
        totalSpent,
        rfmScore,
        rfmSegment,
        stage,
        valueTier,
        Math.round(churnProb * 1000) / 1000,
        Math.round(clv90 * 100) / 100,
        Math.round(clv180 * 100) / 100,
        Math.round(clv365 * 100) / 100,
        predictedNext ? predictedNext.toISOString().slice(0, 10) : null,
        expectedCycle,
        isOverdue,
        cycleRatio !== null ? Math.round(cycleRatio * 1000) / 1000 : null,
        health.health_score,
        health.band,
        health.recency_score,
        health.frequency_score,
        health.monetary_score,
        health.engagement_score,
        health.cycle_adherence_score,
        Math.round(aov * 100) / 100,
        ordersCount > 1 && personalIntervals.length > 0 ? Math.round(median(personalIntervals)) : null,
        Math.round(ddPct * 10000) / 10000,
        ddCategory,
        isBnpl,
      ]
    );
    computedCount++;
  }

  return {
    customersComputed: computedCount,
    lifecycleDistribution,
    tierDistribution,
  };
}

// ============================================================
// HELPERS — Lifecycle Stage Classification
// ============================================================
function classifyLifecycleStage(
  c: CustomerData,
  recencyDays: number | null,
  expectedCycle: number
): string {
  if ((c.orders_count ?? 0) === 0) {
    return "lead";
  }
  if (recencyDays === null) return "lead";

  const cycleRatio = expectedCycle > 0 ? recencyDays / expectedCycle : 0;

  // First 90 days post first order = New (in onboarding window)
  const firstOrder = c.first_order_at ? new Date(c.first_order_at) : null;
  if (firstOrder) {
    const daysSinceFirst = daysBetween(firstOrder, new Date());
    const onboardingWindow = Math.max(90, Math.round(expectedCycle * 1.5));
    if (daysSinceFirst <= onboardingWindow && c.orders_count === 1) {
      return "new";
    }
  }

  // Active states based on cycle ratio
  if (cycleRatio <= 1.0) return "active";
  if (cycleRatio <= 1.5) return "slipping";
  if (cycleRatio <= 2.5) return "at_risk";
  if (cycleRatio <= 6.0) return "churned";
  return "dormant";
}

// ============================================================
// HELPERS — RFM Scoring (1-5 scale)
// ============================================================
function scoreRecency5(recencyDays: number | null, expectedCycle: number): number {
  if (recencyDays === null) return 1;
  const ratio = expectedCycle > 0 ? recencyDays / expectedCycle : 0;
  if (ratio <= 0.5) return 5;
  if (ratio <= 1.0) return 4;
  if (ratio <= 1.5) return 3;
  if (ratio <= 2.5) return 2;
  return 1;
}

function scoreFrequency5(orders: number, mm: MerchantMetricsRow): number {
  if (orders >= mm.p90_orders_per_customer) return 5;
  if (orders >= mm.median_orders_per_customer + 2) return 4;
  if (orders >= mm.median_orders_per_customer) return 3;
  if (orders >= 1) return 2;
  return 1;
}

function scoreMonetary5(spent: number, mm: MerchantMetricsRow): number {
  if (spent >= mm.spend_p95) return 5;
  if (spent >= mm.spend_p80) return 4;
  if (spent >= mm.spend_p50) return 3;
  if (spent > 0) return 2;
  return 1;
}

function classifyRFM(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return "champions";
  if (r >= 3 && f >= 4 && m >= 4) return "loyal_customers";
  if (r >= 4 && f <= 2 && m <= 2) return "new_customers";
  if (r >= 4 && f >= 2 && m >= 3) return "potential_loyalists";
  if (r >= 3 && f >= 2 && m >= 2) return "promising";
  if (r === 3 && f === 3 && m === 3) return "needs_attention";
  if (r === 2 && f >= 2) return "about_to_sleep";
  if (r <= 2 && f >= 4 && m >= 4) return "cant_lose_them";
  if (r <= 2 && f >= 2 && m >= 2) return "at_risk";
  if (r <= 2 && f <= 2 && m <= 2) return "hibernating";
  if (r === 1 && f === 1 && m === 1) return "lost";
  return "promising";
}

// ============================================================
// HELPERS — Value Tier
// ============================================================
function classifyValueTier(spent: number, allSpend: number[]): string {
  if (allSpend.length < 5) return "standard";
  const p80 = percentile(allSpend, 80);
  const p95 = percentile(allSpend, 95);
  if (spent >= p95) return "vip";
  if (spent >= p80) return "premium";
  return "standard";
}

// ============================================================
// HELPERS — Churn Probability (Rules-based for MVP)
// ============================================================
function computeChurnProb(ordersCount: number, cycleRatio: number | null): number {
  if (ordersCount === 0 || cycleRatio === null) return 0.5; // unknown
  if (cycleRatio < 0.5) return 0.05;
  if (cycleRatio < 1.0) return 0.1;
  if (cycleRatio < 1.5) return 0.3;
  if (cycleRatio < 2.0) return 0.55;
  if (cycleRatio < 2.5) return 0.75;
  if (cycleRatio < 3.5) return 0.88;
  return 0.95;
}

// ============================================================
// HELPERS — Health Score
// ============================================================
interface HealthInput {
  cycleRatio: number | null;
  ordersCount: number;
  mmMedianOrders: number;
  mmP90Orders: number;
  totalSpent: number;
  mmSpendP50: number;
  mmSpendP80: number;
  mmSpendP95: number;
  personalCycleDays: number | null;
  recencyDays: number | null;
  emailUnsubscribed: boolean;
}

function computeHealthScore(input: HealthInput) {
  // Recency Score (30% weight)
  let recencyScore: number;
  const cr = input.cycleRatio ?? 1.0;
  if (cr <= 1.0) recencyScore = 90 + (1.0 - cr) * 10;
  else if (cr <= 1.5) recencyScore = 60 + ((1.5 - cr) / 0.5) * 20;
  else if (cr <= 2.5) recencyScore = 30 + ((2.5 - cr) / 1.0) * 20;
  else recencyScore = Math.max(0, 20 - (cr - 2.5) * 5);

  // Frequency Score (20%)
  let frequencyScore: number;
  if (input.ordersCount >= input.mmP90Orders && input.mmP90Orders > 0) {
    frequencyScore = 90 + Math.min(10, (input.ordersCount - input.mmP90Orders) * 2);
  } else if (input.ordersCount >= input.mmMedianOrders + 1 && input.mmMedianOrders > 0) {
    const denom = Math.max(1, input.mmP90Orders - input.mmMedianOrders);
    frequencyScore = 70 + ((input.ordersCount - input.mmMedianOrders) / denom) * 15;
  } else if (input.ordersCount >= input.mmMedianOrders && input.mmMedianOrders > 0) {
    frequencyScore = 50 + (input.ordersCount - input.mmMedianOrders) * 15;
  } else if (input.ordersCount >= 1) {
    frequencyScore = 30 + input.ordersCount * 15;
  } else {
    frequencyScore = 10;
  }
  frequencyScore = Math.min(100, Math.max(0, frequencyScore));

  // Monetary Score (15%)
  let monetaryScore: number;
  if (input.totalSpent >= input.mmSpendP95 && input.mmSpendP95 > 0) {
    const range = Math.max(1, input.mmSpendP95);
    monetaryScore = 90 + Math.min(10, ((input.totalSpent - input.mmSpendP95) / range) * 10);
  } else if (input.totalSpent >= input.mmSpendP80 && input.mmSpendP80 > 0) {
    const range = Math.max(1, input.mmSpendP95 - input.mmSpendP80);
    monetaryScore = 70 + ((input.totalSpent - input.mmSpendP80) / range) * 20;
  } else if (input.totalSpent >= input.mmSpendP50 && input.mmSpendP50 > 0) {
    const range = Math.max(1, input.mmSpendP80 - input.mmSpendP50);
    monetaryScore = 50 + ((input.totalSpent - input.mmSpendP50) / range) * 20;
  } else if (input.totalSpent > 0) {
    monetaryScore = 20 + (input.totalSpent / Math.max(1, input.mmSpendP50)) * 30;
  } else {
    monetaryScore = 10;
  }
  monetaryScore = Math.min(100, Math.max(0, monetaryScore));

  // Engagement Score (15%) — default 50 since no engagement data yet (Phase 2 v1.5)
  let engagementScore = input.emailUnsubscribed ? 0 : 50;

  // Cycle Adherence Score (20%)
  let cycleAdherenceScore: number;
  if (input.personalCycleDays && input.recencyDays !== null && input.personalCycleDays > 0) {
    const dev = Math.abs(input.recencyDays - input.personalCycleDays) / input.personalCycleDays;
    if (dev <= 0.2) cycleAdherenceScore = 85 + (0.2 - dev) * 75;
    else if (dev <= 0.5) cycleAdherenceScore = 55 + ((0.5 - dev) / 0.3) * 25;
    else if (dev <= 1.0) cycleAdherenceScore = 25 + ((1.0 - dev) / 0.5) * 25;
    else cycleAdherenceScore = Math.max(0, 20 - (dev - 1.0) * 10);
  } else {
    cycleAdherenceScore = recencyScore; // fallback
  }
  cycleAdherenceScore = Math.min(100, Math.max(0, cycleAdherenceScore));

  // Final weighted
  const finalScore = Math.round(
    recencyScore * 0.3 +
      frequencyScore * 0.2 +
      monetaryScore * 0.15 +
      engagementScore * 0.15 +
      cycleAdherenceScore * 0.2
  );

  let band: string;
  if (finalScore >= 80) band = "thriving";
  else if (finalScore >= 60) band = "healthy";
  else if (finalScore >= 40) band = "slipping";
  else if (finalScore >= 20) band = "at_risk";
  else band = "critical";

  return {
    health_score: finalScore,
    band,
    recency_score: Math.round(recencyScore),
    frequency_score: Math.round(frequencyScore),
    monetary_score: Math.round(monetaryScore),
    engagement_score: Math.round(engagementScore),
    cycle_adherence_score: Math.round(cycleAdherenceScore),
  };
}
