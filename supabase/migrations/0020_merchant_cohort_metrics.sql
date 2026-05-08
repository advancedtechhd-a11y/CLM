-- ============================================================
-- Migration 0020 — merchant_cohort_metrics (v1.5 Phase 4)
--
-- One row per merchant per cohort_month. Powers the CohortHealth widget
-- (6-month color-coded retention table).
--
-- A cohort = customers whose first_order_at falls within a calendar month
-- (UTC). Retention is "did the cohort customer place ANY further order
-- ≥ N days after their first?" — measured at 30 / 60 / 90 days.
--
-- Retention columns are NULLABLE so cohorts that haven't yet matured the
-- N-day window store NULL (widget renders "—") instead of misleading 0%.
--
-- Populated nightly by /api/cron/compute-cohort-metrics at 2am UTC, plus
-- once at end of onboarding so the widget renders on day 1.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.merchant_cohort_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  cohort_month DATE NOT NULL,                  -- first day of the month, UTC

  cohort_size INTEGER NOT NULL,                -- customers whose first_order_at ∈ [month, month+1mo)
  retained_30d INTEGER,                         -- NULL if cohort hasn't matured 30 days yet
  retained_60d INTEGER,
  retained_90d INTEGER,
  total_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- all-time revenue from this cohort

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (merchant_id, cohort_month)
);

CREATE INDEX IF NOT EXISTS idx_cohort_metrics_merchant
  ON public.merchant_cohort_metrics(merchant_id, cohort_month DESC);

ALTER TABLE public.merchant_cohort_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation merchant_cohort_metrics"
  ON public.merchant_cohort_metrics
  FOR ALL
  USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));
