-- ============================================================
-- Migration 0003 — Metrics schema (Rules Engine layer)
--
-- Tables to store computed metrics:
--   * merchant_metrics — one row per merchant (aggregates)
--   * customer_metrics — one row per customer (RFM, stage, scores)
--   * customer_health_history — daily snapshot of health scores per customer
-- ============================================================

-- Per-merchant aggregates, refreshed daily
CREATE TABLE IF NOT EXISTS public.merchant_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE UNIQUE,

  -- Repurchase cycle (median-based — see [[02-Lifecycle-Framework]])
  median_repurchase_days INTEGER,
  p75_repurchase_days INTEGER,
  p90_repurchase_days INTEGER,
  repurchase_sample_size INTEGER,
  median_repurchase_days_by_category JSONB,

  -- Customer base aggregates
  total_customers INTEGER DEFAULT 0,
  active_customers_30d INTEGER DEFAULT 0,
  total_orders INTEGER DEFAULT 0,
  total_revenue NUMERIC DEFAULT 0,
  avg_order_value NUMERIC DEFAULT 0,
  avg_orders_per_customer NUMERIC DEFAULT 0,
  median_orders_per_customer INTEGER DEFAULT 0,
  p90_orders_per_customer INTEGER DEFAULT 0,
  repeat_purchase_rate NUMERIC DEFAULT 0, -- % with 2+ orders
  churn_rate_30d NUMERIC,
  churn_rate_90d NUMERIC,

  -- Lifecycle stage distribution
  customers_by_lifecycle_stage JSONB,
  customers_by_value_tier JSONB,

  -- Differentiating metrics (per [[18-Differentiating-Metrics]])
  -- Revenue at Risk
  revenue_at_risk NUMERIC,
  estimated_recoverable_revenue NUMERIC,
  at_risk_customer_count INTEGER,

  -- First-to-Second Tracker
  first_to_second_conversion_rate NUMERIC,
  median_days_to_second_purchase INTEGER,
  first_to_second_revenue_lift NUMERIC,

  -- Concentration Risk
  top_10_pct_revenue_share NUMERIC,
  concentration_risk_level TEXT, -- low | medium | high
  top_5_customer_annual_value NUMERIC,

  -- Discount Dependency
  merchant_discount_dependency_pct NUMERIC,

  -- Spend percentile thresholds (for tier assignment)
  spend_p50 NUMERIC,
  spend_p80 NUMERIC,
  spend_p95 NUMERIC,

  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-customer computed metrics, refreshed daily
CREATE TABLE IF NOT EXISTS public.customer_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,

  -- RFM
  recency_days INTEGER,           -- days since last purchase
  frequency INTEGER,              -- total orders count
  monetary NUMERIC,               -- total spent
  rfm_score TEXT,                 -- e.g. "543" (recency-frequency-monetary as 1-5 each)
  rfm_segment TEXT,               -- 11-segment standard model

  -- Lifecycle stage (per [[02-Lifecycle-Framework]])
  lifecycle_stage TEXT,           -- lead | new | active | slipping | at_risk | churned | dormant
  days_in_current_stage INTEGER,
  previous_lifecycle_stage TEXT,
  stage_changed_at TIMESTAMPTZ,

  -- Value tier (per [[02-Lifecycle-Framework]])
  value_tier TEXT,                -- standard | premium | vip

  -- Behavior badges (multi-select, JSON array)
  badges JSONB DEFAULT '[]'::jsonb, -- ["champion", "referrer", "reviewer", "ugc_creator", "won_back"]
  won_back_at TIMESTAMPTZ,

  -- Predictions (rules-based for MVP, ML in Phase 4)
  churn_probability NUMERIC,      -- 0.0 to 1.0
  predicted_clv_90d NUMERIC,
  predicted_clv_180d NUMERIC,
  predicted_clv_365d NUMERIC,
  predicted_next_order_date DATE,
  expected_repurchase_cycle_days INTEGER, -- personalized cycle (per-customer if 3+ orders, else merchant blended)
  is_overdue BOOLEAN,
  overdue_ratio NUMERIC,          -- recency_days / expected_cycle

  -- Health Score (per [[18-Differentiating-Metrics]] §14.1)
  health_score INTEGER,           -- 0-100
  health_score_band TEXT,         -- thriving | healthy | slipping | at_risk | critical
  recency_score INTEGER,
  frequency_score INTEGER,
  monetary_score INTEGER,
  engagement_score INTEGER,
  cycle_adherence_score INTEGER,

  -- Behavioral signals
  avg_order_value NUMERIC,
  avg_order_frequency_days INTEGER,
  category_concentration NUMERIC, -- 0-1, how concentrated their purchases are
  discount_dependency_pct NUMERIC,
  discount_dependency_category TEXT, -- highly_dependent | moderately_dependent | occasional_user | full_price_buyer
  is_bnpl_user BOOLEAN DEFAULT FALSE,
  payment_method_mix JSONB,

  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (merchant_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_metrics_lifecycle ON public.customer_metrics(merchant_id, lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_metrics_churn ON public.customer_metrics(merchant_id, churn_probability DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_health ON public.customer_metrics(merchant_id, health_score DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_tier ON public.customer_metrics(merchant_id, value_tier);

-- Daily snapshot of health scores per customer (for trend tracking)
CREATE TABLE IF NOT EXISTS public.customer_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  health_score INTEGER NOT NULL,
  health_score_band TEXT,
  recency_score INTEGER,
  frequency_score INTEGER,
  monetary_score INTEGER,
  engagement_score INTEGER,
  cycle_adherence_score INTEGER,
  lifecycle_stage TEXT,
  value_tier TEXT,
  computed_on DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (customer_id, computed_on)
);

CREATE INDEX IF NOT EXISTS idx_health_history_customer ON public.customer_health_history(customer_id, computed_on DESC);

-- RLS — same tenant isolation pattern
ALTER TABLE public.merchant_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation merchant_metrics" ON public.merchant_metrics
  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));

ALTER TABLE public.customer_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation customer_metrics" ON public.customer_metrics
  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));

ALTER TABLE public.customer_health_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation customer_health_history" ON public.customer_health_history
  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));
