-- ============================================================
-- Migration 0016 — merchant_daily_metrics (v1.5 Phase 3)
--
-- One row per merchant per day. Powers:
--   * HealthScoreTrend widget (last 30 days)
--   * Revenue / orders / new-customer time series
--   * Phase 6 anomaly seasonality stack (8-week day-of-week baseline)
--
-- Sale-detection signals (pct_orders_with_discount / aov / top_discount_code_*)
-- live here too — Phase 6's sale detector reads them, no separate table.
--
-- Populated nightly by /api/cron/compute-daily-metrics at 1am UTC.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.merchant_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,

  -- Health
  avg_health_score NUMERIC(5,2),
  median_health_score NUMERIC(5,2),

  -- Lifecycle counts (snapshot of customer_health_history for this date)
  customers_active INTEGER,
  customers_new INTEGER,
  customers_slipping INTEGER,
  customers_at_risk INTEGER,
  customers_churned INTEGER,

  -- Revenue / orders bucketed by ordered_at::date (UTC)
  revenue NUMERIC(12,2),
  orders_count INTEGER,
  new_customers INTEGER,
  aov NUMERIC(12,2),

  -- Rolling KPIs — current values from merchant_metrics / customer_metrics
  predicted_clv NUMERIC(14,2),
  revenue_at_risk NUMERIC(12,2),
  repeat_rate NUMERIC(5,4),

  -- Sale-detection signals (read by Phase 6 sale-detector)
  pct_orders_with_discount NUMERIC(5,4),
  top_discount_code_usage_pct NUMERIC(5,4),
  top_discount_code_name TEXT,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_metrics_merchant_date
  ON public.merchant_daily_metrics(merchant_id, metric_date DESC);

ALTER TABLE public.merchant_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation merchant_daily_metrics"
  ON public.merchant_daily_metrics
  FOR ALL
  USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));
