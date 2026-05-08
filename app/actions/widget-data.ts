"use server";

/**
 * Server actions backing the dashboard widgets.
 *
 * Each widget calls one of these via `useWidgetData`. We reuse the existing
 * `lib/supabase/queries.ts` helpers wherever possible so we don't double-write
 * the aggregation logic. New queries are added inline only when an existing
 * one doesn't already produce what we need.
 */

import { createClient } from "@/lib/supabase/server";
import {
  getCurrentMerchant,
  getMerchantMetrics,
  getClvSummary,
  getCartAbandonSummary,
} from "@/lib/supabase/queries";

async function requireMerchantId(): Promise<string> {
  const merchant = await getCurrentMerchant();
  if (!merchant) throw new Error("MERCHANT_NOT_FOUND");
  return merchant.id;
}

// =============================================================================
// KPIs (4)
// =============================================================================

export type KpiData = {
  value: number;
  delta: number | null;        // pct change vs prior 30 days; null if no baseline
  customerCount?: number;      // optional secondary stat
  recoverable?: number;
};

export async function fetchRevenueAtRisk(): Promise<KpiData> {
  const merchantId = await requireMerchantId();
  const m = await getMerchantMetrics(merchantId);
  if (!m) return { value: 0, delta: null };
  return {
    value: m.revenue_at_risk,
    delta: null, // no historical comparison yet — v1.5 adds it
    customerCount: m.at_risk_customer_count,
    recoverable: m.estimated_recoverable_revenue,
  };
}

export async function fetchTotalRevenue(): Promise<KpiData> {
  const merchantId = await requireMerchantId();
  const m = await getMerchantMetrics(merchantId);
  if (!m) return { value: 0, delta: null };
  return { value: m.total_revenue, delta: null };
}

export async function fetchPredictedClv(): Promise<KpiData> {
  const merchantId = await requireMerchantId();
  const clv = await getClvSummary(merchantId);
  if (!clv) return { value: 0, delta: null };
  return {
    value: clv.total_predicted_clv_365d,
    delta: null,
    customerCount: clv.customers_with_clv,
  };
}

export async function fetchRepeatRate(): Promise<KpiData> {
  const merchantId = await requireMerchantId();
  const m = await getMerchantMetrics(merchantId);
  if (!m) return { value: 0, delta: null };
  return { value: m.repeat_purchase_rate, delta: null };
}

// =============================================================================
// Distribution (2)
// =============================================================================

export type DistributionBucket = { key: string; count: number; label: string };

export async function fetchLifecycleDistribution(): Promise<DistributionBucket[]> {
  const merchantId = await requireMerchantId();
  const m = await getMerchantMetrics(merchantId);
  if (!m) return [];
  return Object.entries(m.customers_by_lifecycle_stage)
    .map(([key, count]) => ({
      key,
      count,
      label: key.replace(/_/g, " "),
    }))
    .sort((a, b) => b.count - a.count);
}

export async function fetchValueTierDistribution(): Promise<DistributionBucket[]> {
  const merchantId = await requireMerchantId();
  const m = await getMerchantMetrics(merchantId);
  if (!m) return [];
  return Object.entries(m.customers_by_value_tier)
    .map(([key, count]) => ({
      key,
      count,
      label: key.toUpperCase(),
    }))
    .sort((a, b) => b.count - a.count);
}

// =============================================================================
// Trend chart — daily revenue last 30d
// =============================================================================

export type TrendPoint = { date: string; revenue: number };

export async function fetchRevenueTrend(): Promise<TrendPoint[]> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data } = await supabase
    .from("orders")
    .select("ordered_at, order_total")
    .eq("merchant_id", merchantId)
    .gte("ordered_at", since.toISOString())
    .order("ordered_at", { ascending: true });

  if (!data) return [];

  // Bucket by day in JS (avoids needing a SQL function)
  const byDay = new Map<string, number>();
  for (const o of data as { ordered_at: string; order_total: string | null }[]) {
    const day = o.ordered_at.slice(0, 10); // YYYY-MM-DD
    const amt = parseFloat(o.order_total ?? "0");
    byDay.set(day, (byDay.get(day) ?? 0) + amt);
  }

  // Ensure every day in the window appears, even if 0
  const points: TrendPoint[] = [];
  for (let i = 30; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    points.push({ date: key, revenue: byDay.get(key) ?? 0 });
  }
  return points;
}

// =============================================================================
// At-risk table — top 10 by predicted_clv where churn > 0.5
// =============================================================================

export type AtRiskCustomer = {
  customer_id: string;
  name: string;
  email: string | null;
  predicted_clv: number;
  churn_probability: number;
  lifecycle_stage: string;
};

export async function fetchAtRiskCustomers(): Promise<AtRiskCustomer[]> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const { data } = await supabase
    .from("customer_metrics")
    .select(
      `customer_id, predicted_clv_365d, churn_probability, lifecycle_stage,
       customers!inner(email, first_name, last_name)`
    )
    .eq("merchant_id", merchantId)
    .gt("churn_probability", 0.5)
    .order("predicted_clv_365d", { ascending: false, nullsFirst: false })
    .limit(10);

  if (!data) return [];

  return (data as any[]).map((row) => ({
    customer_id: row.customer_id,
    name:
      [row.customers?.first_name, row.customers?.last_name]
        .filter(Boolean)
        .join(" ") ||
      row.customers?.email ||
      "(unknown)",
    email: row.customers?.email ?? null,
    predicted_clv: parseFloat(row.predicted_clv_365d ?? "0"),
    churn_probability: parseFloat(row.churn_probability ?? "0"),
    lifecycle_stage: row.lifecycle_stage,
  }));
}

// =============================================================================
// Featured DNA customer — top customer by predicted_clv * churn_probability
// =============================================================================

export type FeaturedDnaCustomer = {
  customer_id: string;
  name: string;
  email: string | null;
  lifecycle_stage: string | null;
  health_score: number | null;
  predicted_clv: number;
  churn_probability: number;
  // 6 DNA dimensions — minimal subset for the widget card
  aov_tier: string | null;
  ltv_tier: string | null;
  predicted_clv_tier: string | null;
  brand_loyalty_classification: string | null;
  personal_repurchase_cycle_days: number | null;
  recovery_potential: string | null;
  health_score_band: string | null;
  days_in_current_stage: number | null;
};

export async function fetchFeaturedDnaCustomer(): Promise<FeaturedDnaCustomer | null> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  // First find the top-impact customer (highest predicted_clv * churn_probability)
  const { data: candidates } = await supabase
    .from("customer_metrics")
    .select(
      `customer_id, predicted_clv_365d, churn_probability, lifecycle_stage, health_score,
       customers!inner(email, first_name, last_name)`
    )
    .eq("merchant_id", merchantId)
    .not("predicted_clv_365d", "is", null)
    .not("churn_probability", "is", null)
    .gt("churn_probability", 0.3)
    .order("predicted_clv_365d", { ascending: false, nullsFirst: false })
    .limit(50);

  if (!candidates || candidates.length === 0) return null;

  // Compute impact score in JS (Supabase doesn't let us multiply two columns server-side easily)
  const ranked = (candidates as any[])
    .map((c) => {
      const clv = parseFloat(c.predicted_clv_365d ?? "0");
      const churn = parseFloat(c.churn_probability ?? "0");
      return { row: c, impact: clv * churn };
    })
    .sort((a, b) => b.impact - a.impact);

  const winner = ranked[0]?.row;
  if (!winner) return null;

  // Pull the DNA row
  const { data: dna } = await supabase
    .from("customer_dna")
    .select(
      "aov_tier, ltv_tier, predicted_clv_tier, brand_loyalty_classification, personal_repurchase_cycle_days, recovery_potential, health_score_band, days_in_current_stage"
    )
    .eq("merchant_id", merchantId)
    .eq("customer_id", winner.customer_id)
    .maybeSingle();

  return {
    customer_id: winner.customer_id,
    name:
      [winner.customers?.first_name, winner.customers?.last_name]
        .filter(Boolean)
        .join(" ") ||
      winner.customers?.email ||
      "(unknown)",
    email: winner.customers?.email ?? null,
    lifecycle_stage: winner.lifecycle_stage ?? null,
    health_score: winner.health_score ?? null,
    predicted_clv: parseFloat(winner.predicted_clv_365d ?? "0"),
    churn_probability: parseFloat(winner.churn_probability ?? "0"),
    aov_tier: dna?.aov_tier ?? null,
    ltv_tier: dna?.ltv_tier ?? null,
    predicted_clv_tier: dna?.predicted_clv_tier ?? null,
    brand_loyalty_classification: dna?.brand_loyalty_classification ?? null,
    personal_repurchase_cycle_days: dna?.personal_repurchase_cycle_days ?? null,
    recovery_potential: dna?.recovery_potential ?? null,
    health_score_band: dna?.health_score_band ?? null,
    days_in_current_stage: dna?.days_in_current_stage ?? null,
  };
}

// =============================================================================
// Priority bar — count cart abandonments + count slipping VIPs + at-risk count
// =============================================================================

export type PriorityData = {
  totalActions: number;
  cartAbandons: { count: number; value: number; oldestHours: number | null };
  slippingVips: number;
  atRisk: number;
};

export async function fetchPriorityData(): Promise<PriorityData> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const cart = await getCartAbandonSummary(merchantId);

  const { count: vipSlipping } = await supabase
    .from("customer_metrics")
    .select("customer_id", { count: "exact", head: true })
    .eq("merchant_id", merchantId)
    .eq("value_tier", "vip")
    .eq("lifecycle_stage", "slipping");

  const m = await getMerchantMetrics(merchantId);

  return {
    totalActions:
      (cart.open_count ?? 0) +
      (vipSlipping ?? 0) +
      (m?.at_risk_customer_count ?? 0),
    cartAbandons: {
      count: cart.open_count ?? 0,
      value: cart.total_value ?? 0,
      oldestHours: cart.oldest_hours ?? null,
    },
    slippingVips: vipSlipping ?? 0,
    atRisk: m?.at_risk_customer_count ?? 0,
  };
}

// =============================================================================
// Anomalies Panel — active anomalies + pending sale + snooze state (v1.5 Phase 6)
// =============================================================================

export type AnomaliesPanelActiveAnomaly = {
  id: string;
  metric: string;
  current_value: number | null;
  expected_value: number | null;
  deviation_sigma: number | null;
  severity: string;
  description: string | null;
  detection_reason: string | null;
  detected_at: string;
};

export type AnomaliesPanelPendingSale = {
  id: string;
  detected_start: string;
  detected_end: string;
  signals_matched: string[];
  confidence_score: number;
};

export type AnomaliesPanelData = {
  enabled: boolean;
  snoozed_until: string | null;
  active_anomalies: AnomaliesPanelActiveAnomaly[];
  pending_sale: AnomaliesPanelPendingSale | null;
};

export async function fetchAnomaliesPanel(): Promise<AnomaliesPanelData> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const { data: merchantRow } = await supabase
    .from("merchants")
    .select("anomaly_detection_enabled, anomalies_snoozed_until")
    .eq("id", merchantId)
    .maybeSingle();

  const enabled = merchantRow?.anomaly_detection_enabled ?? false;
  const snoozed_until = merchantRow?.anomalies_snoozed_until ?? null;

  // Active anomalies = new-format (metric IS NOT NULL), not dismissed,
  // not currently in an ignore_until window. Last 7 days only — older
  // anomalies stay in the table for analytics but not the active feed.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);

  const { data: anomalyRows } = await supabase
    .from("anomalies")
    .select(
      "id, metric, current_value, expected_value, deviation_sigma, severity, description, detection_reason, detected_at, dismissed_at, ignore_until"
    )
    .eq("merchant_id", merchantId)
    .not("metric", "is", null)
    .is("dismissed_at", null)
    .gte("detected_at", sevenDaysAgo.toISOString())
    .order("detected_at", { ascending: false })
    .limit(20);

  const nowIso = new Date().toISOString();
  const active_anomalies: AnomaliesPanelActiveAnomaly[] =
    (anomalyRows as any[] | null ?? [])
      .filter((r) => !r.ignore_until || r.ignore_until < nowIso)
      .map((r) => ({
        id: r.id,
        metric: r.metric,
        current_value: r.current_value !== null ? Number(r.current_value) : null,
        expected_value: r.expected_value !== null ? Number(r.expected_value) : null,
        deviation_sigma: r.deviation_sigma !== null ? Number(r.deviation_sigma) : null,
        severity: r.severity,
        description: r.description,
        detection_reason: r.detection_reason,
        detected_at: r.detected_at,
      }));

  // Pending sale (most recent unresolved one)
  const { data: pendingSaleRow } = await supabase
    .from("merchant_detected_sales")
    .select("id, detected_start, detected_end, signals_matched, confidence_score")
    .eq("merchant_id", merchantId)
    .eq("merchant_confirmation", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pending_sale: AnomaliesPanelPendingSale | null = pendingSaleRow
    ? {
        id: pendingSaleRow.id,
        detected_start: pendingSaleRow.detected_start,
        detected_end: pendingSaleRow.detected_end,
        signals_matched: pendingSaleRow.signals_matched ?? [],
        confidence_score: Number(pendingSaleRow.confidence_score),
      }
    : null;

  return { enabled, snoozed_until, active_anomalies, pending_sale };
}

// =============================================================================
// Recent Activity — last 20 events (v1.5 Phase 5)
// =============================================================================

import type { EventRow } from "@/lib/events/types";

export async function fetchRecentActivity(): Promise<EventRow[]> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select(
      "id, merchant_id, event_type, entity_type, entity_id, actor_type, actor_id, dedupe_key, payload, created_at"
    )
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data as EventRow[] | null) ?? [];
}

// =============================================================================
// Cohort Health — last 6 cohort months (v1.5 Phase 4)
// =============================================================================

export type CohortRow = {
  cohort_month: string; // "YYYY-MM-01"
  cohort_size: number;
  retained_30d: number | null;
  retained_60d: number | null;
  retained_90d: number | null;
  total_revenue: number;
  // Convenience: pre-computed retention percentages so the widget doesn't divide
  retention_30d_pct: number | null;
  retention_60d_pct: number | null;
  retention_90d_pct: number | null;
};

export async function fetchCohortHealth(): Promise<CohortRow[]> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const { data } = await supabase
    .from("merchant_cohort_metrics")
    .select(
      "cohort_month, cohort_size, retained_30d, retained_60d, retained_90d, total_revenue"
    )
    .eq("merchant_id", merchantId)
    .order("cohort_month", { ascending: false })
    .limit(6);

  if (!data) return [];

  return (data as Array<{
    cohort_month: string;
    cohort_size: number;
    retained_30d: number | null;
    retained_60d: number | null;
    retained_90d: number | null;
    total_revenue: string | number | null;
  }>).map((r) => {
    const size = r.cohort_size;
    const pct = (n: number | null) =>
      size > 0 && n !== null ? Math.round((n / size) * 1000) / 10 : null;
    return {
      cohort_month: r.cohort_month,
      cohort_size: size,
      retained_30d: r.retained_30d,
      retained_60d: r.retained_60d,
      retained_90d: r.retained_90d,
      total_revenue:
        typeof r.total_revenue === "number"
          ? r.total_revenue
          : parseFloat(r.total_revenue ?? "0"),
      retention_30d_pct: pct(r.retained_30d),
      retention_60d_pct: pct(r.retained_60d),
      retention_90d_pct: pct(r.retained_90d),
    };
  });
}

// =============================================================================
// Health Score Trend — last 30 days from merchant_daily_metrics (v1.5 Phase 3)
// =============================================================================

export type HealthTrendPoint = {
  date: string; // YYYY-MM-DD
  value: number | null; // avg_health_score that day (null = no data, chart skips)
};

export type HealthBackfillStatus = "pending" | "in_progress" | "complete" | "failed";

export type HealthTrendData = {
  points: HealthTrendPoint[];
  current: number | null; // most recent non-null avg
  current_date: string | null;
  thirty_day_avg: number | null;
  delta: number | null; // pct change last-7d avg vs prior-7d avg (within the 30-day window)
  backfill_status: HealthBackfillStatus;
  backfill_started_at: string | null;
  backfill_chunks_completed: number;
  backfill_chunks_total: number | null;
  backfill_last_chunk_at: string | null;
};

export async function fetchHealthScoreTrend(): Promise<HealthTrendData> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  // Pull backfill status — used by the widget to render a "Day X of 90"
  // progress UI during the post-install chunked reconstruction window.
  const { data: merchantRow } = await supabase
    .from("merchants")
    .select(
      "health_backfill_status, health_backfill_started_at, health_backfill_chunks_completed, health_backfill_chunks_total, health_backfill_last_chunk_at"
    )
    .eq("id", merchantId)
    .maybeSingle();
  const backfill_status: HealthBackfillStatus =
    (merchantRow?.health_backfill_status as HealthBackfillStatus | undefined) ?? "pending";
  const backfill_started_at = merchantRow?.health_backfill_started_at ?? null;
  const backfill_chunks_completed =
    merchantRow?.health_backfill_chunks_completed ?? 0;
  const backfill_chunks_total =
    merchantRow?.health_backfill_chunks_total ?? null;
  const backfill_last_chunk_at = merchantRow?.health_backfill_last_chunk_at ?? null;

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 30);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("merchant_daily_metrics")
    .select("metric_date, avg_health_score")
    .eq("merchant_id", merchantId)
    .gte("metric_date", sinceIso)
    .order("metric_date", { ascending: true });

  // Build a continuous 30-day window so the chart x-axis is even, even on
  // days where the cron didn't run. Missing days = value: null.
  const byDate = new Map<string, number>();
  for (const r of (data ?? []) as { metric_date: string; avg_health_score: string | null }[]) {
    if (r.avg_health_score !== null && r.avg_health_score !== undefined) {
      byDate.set(r.metric_date, Number(r.avg_health_score));
    }
  }

  const points: HealthTrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    points.push({ date: key, value: byDate.get(key) ?? null });
  }

  const valuedPoints = points.filter((p): p is { date: string; value: number } => p.value !== null);
  const last = valuedPoints[valuedPoints.length - 1];

  const thirtyDayAvg =
    valuedPoints.length === 0
      ? null
      : valuedPoints.reduce((s, p) => s + p.value, 0) / valuedPoints.length;

  // Delta: avg of last 7 valued days vs avg of the 7 valued days before them
  let delta: number | null = null;
  if (valuedPoints.length >= 14) {
    const recent = valuedPoints.slice(-7);
    const prior = valuedPoints.slice(-14, -7);
    const recentAvg = recent.reduce((s, p) => s + p.value, 0) / recent.length;
    const priorAvg = prior.reduce((s, p) => s + p.value, 0) / prior.length;
    if (priorAvg !== 0) delta = (recentAvg - priorAvg) / priorAvg;
  }

  return {
    points,
    current: last?.value ?? null,
    current_date: last?.date ?? null,
    thirty_day_avg: thirtyDayAvg,
    delta,
    backfill_status,
    backfill_started_at,
    backfill_chunks_completed,
    backfill_chunks_total,
    backfill_last_chunk_at,
  };
}

// =============================================================================
// Geographic spread — top countries by customer count (v1.5 Phase 2)
// =============================================================================

export type GeographicCountry = {
  country_code: string;
  country_name: string;
  customer_count: number;
  percentage: number; // 0-100, of customers WITH a country_code
};

export async function fetchGeographicSpread(): Promise<GeographicCountry[]> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  // Pull rows with country_code (the index covers this filter)
  const { data, error } = await supabase
    .from("customers")
    .select("country_code, country_name")
    .eq("merchant_id", merchantId)
    .not("country_code", "is", null);

  if (error || !data) return [];

  // Aggregate in JS — Supabase RPC for GROUP BY is overkill at this scale
  const total = data.length;
  if (total === 0) return [];

  const buckets = new Map<string, { name: string; count: number }>();
  for (const c of data as { country_code: string; country_name: string | null }[]) {
    const code = c.country_code;
    const existing = buckets.get(code);
    if (existing) {
      existing.count++;
    } else {
      buckets.set(code, { name: c.country_name ?? code, count: 1 });
    }
  }

  return Array.from(buckets.entries())
    .map(([code, b]) => ({
      country_code: code,
      country_name: b.name,
      customer_count: b.count,
      percentage: Math.round((b.count / total) * 1000) / 10, // 1 decimal
    }))
    .sort((a, b) => b.customer_count - a.customer_count)
    .slice(0, 10);
}
