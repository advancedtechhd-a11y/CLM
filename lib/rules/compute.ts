/**
 * Orchestrator — runs the full rules engine for one merchant.
 *
 * Order:
 *   1. Compute merchant-level metrics (medians, percentiles, etc.)
 *   2. Compute per-customer metrics using merchant metrics as inputs
 *   3. Compute Revenue at Risk (post-customer aggregation)
 *   4. Snapshot health scores to history
 */

import type { Client } from "pg";
import { computeMerchantMetrics, saveMerchantMetrics } from "./merchant-metrics";
import { computeCustomerMetrics } from "./customer-metrics";

export async function runRulesEngine(pg: Client, merchantId: string) {
  const start = Date.now();

  console.log("📊 Computing merchant-level metrics...");
  const merchantMetrics = await computeMerchantMetrics(pg, merchantId);
  await saveMerchantMetrics(pg, merchantId, merchantMetrics);

  console.log("👥 Computing per-customer metrics (RFM, lifecycle, health, CLV, churn)...");
  const customerResult = await computeCustomerMetrics(pg, merchantId);

  console.log("💸 Computing Revenue at Risk...");
  const rar = await computeRevenueAtRisk(pg, merchantId);

  console.log("📈 Storing customers_by_lifecycle_stage + Revenue at Risk in merchant_metrics...");
  await pg.query(
    `
    UPDATE public.merchant_metrics
    SET customers_by_lifecycle_stage = $2::jsonb,
        customers_by_value_tier = $3::jsonb,
        revenue_at_risk = $4,
        estimated_recoverable_revenue = $5,
        at_risk_customer_count = $6,
        computed_at = NOW()
    WHERE merchant_id = $1
    `,
    [
      merchantId,
      JSON.stringify(customerResult.lifecycleDistribution),
      JSON.stringify(customerResult.tierDistribution),
      Math.round(rar.total_at_risk * 100) / 100,
      Math.round(rar.estimated_recoverable * 100) / 100,
      rar.at_risk_customer_count,
    ]
  );

  console.log("📸 Snapshotting health scores to history...");
  await snapshotHealthHistory(pg, merchantId);

  return {
    durationMs: Date.now() - start,
    merchantMetrics,
    customerResult,
    revenueAtRisk: rar,
  };
}

// ============================================================
// Revenue at Risk — sum of (CLV × churn_prob) for at-risk customers
// ============================================================
async function computeRevenueAtRisk(pg: Client, merchantId: string) {
  const { rows } = await pg.query<{
    total_at_risk: string;
    at_risk_customer_count: string;
  }>(
    `
    SELECT
      COALESCE(SUM(predicted_clv_180d * churn_probability), 0) AS total_at_risk,
      COUNT(*) FILTER (WHERE churn_probability > 0.50) AS at_risk_customer_count
    FROM public.customer_metrics
    WHERE merchant_id = $1 AND churn_probability > 0.50
    `,
    [merchantId]
  );
  const totalAtRisk = parseFloat(rows[0].total_at_risk);
  const atRiskCount = parseInt(rows[0].at_risk_customer_count, 10);
  return {
    total_at_risk: totalAtRisk,
    estimated_recoverable: totalAtRisk * 0.2,
    at_risk_customer_count: atRiskCount,
  };
}

// ============================================================
// Snapshot health scores to history (for trend tracking)
// ============================================================
async function snapshotHealthHistory(pg: Client, merchantId: string) {
  await pg.query(
    `
    INSERT INTO public.customer_health_history (
      merchant_id, customer_id, health_score, health_score_band,
      recency_score, frequency_score, monetary_score, engagement_score, cycle_adherence_score,
      lifecycle_stage, value_tier, computed_on
    )
    SELECT
      merchant_id, customer_id, health_score, health_score_band,
      recency_score, frequency_score, monetary_score, engagement_score, cycle_adherence_score,
      lifecycle_stage, value_tier, CURRENT_DATE
    FROM public.customer_metrics
    WHERE merchant_id = $1
    ON CONFLICT (customer_id, computed_on) DO UPDATE SET
      health_score = EXCLUDED.health_score,
      health_score_band = EXCLUDED.health_score_band,
      recency_score = EXCLUDED.recency_score,
      frequency_score = EXCLUDED.frequency_score,
      monetary_score = EXCLUDED.monetary_score,
      engagement_score = EXCLUDED.engagement_score,
      cycle_adherence_score = EXCLUDED.cycle_adherence_score,
      lifecycle_stage = EXCLUDED.lifecycle_stage,
      value_tier = EXCLUDED.value_tier
    `,
    [merchantId]
  );
}
