-- ============================================================
-- Migration 0022 — Anomaly seasonality stack (v1.5 Phase 6)
--
-- Layers seasonality-aware columns onto the existing public.anomalies
-- table (created by migration 0005, used by the legacy v1.1 detector).
-- All new columns are NULLABLE so legacy rows keep working — the new
-- detector populates them, the old severity/magnitude/detail JSONB
-- columns stay as-is for backwards compatibility.
--
-- Adds quiet-rollout flags on merchants (anomaly_detection_enabled
-- defaults to FALSE — see Ops Runbook entry 6 to enable per merchant).
--
-- Creates merchant_detected_sales for the 5-signal sale auto-detector.
-- ============================================================

-- ─────────────────────────────────────────────────────────
-- anomalies — seasonality columns (additive, NULLABLE)
-- ─────────────────────────────────────────────────────────
ALTER TABLE public.anomalies
  ADD COLUMN IF NOT EXISTS metric TEXT,                       -- "revenue" | "orders_count" | etc.
  ADD COLUMN IF NOT EXISTS current_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS expected_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS deviation_sigma NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS detected_for_day_of_week INTEGER,  -- 0=Sunday … 6=Saturday
  ADD COLUMN IF NOT EXISTS detection_reason TEXT
    CHECK (detection_reason IN ('normal', 'sale_detected', 'public_holiday')),
  ADD COLUMN IF NOT EXISTS threshold_used NUMERIC(3,2),       -- 3.0 / 4.0 / 5.0
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ignore_until TIMESTAMPTZ,          -- "ignore similar for N days"
  ADD COLUMN IF NOT EXISTS marked_normal_at TIMESTAMPTZ;      -- "this is actually normal" — feedback signal

CREATE INDEX IF NOT EXISTS idx_anomalies_merchant_active
  ON public.anomalies(merchant_id, detected_at DESC)
  WHERE dismissed_at IS NULL AND resolved_at IS NULL;

-- ─────────────────────────────────────────────────────────
-- merchants — quiet-rollout flags
-- ─────────────────────────────────────────────────────────
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS anomaly_detection_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS anomalies_snoozed_until TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────
-- merchant_detected_sales — 5-signal sale auto-detector output
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.merchant_detected_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  detected_start DATE NOT NULL,
  detected_end DATE NOT NULL,
  signals_matched TEXT[] NOT NULL,                  -- e.g. ['discount_usage_2x', 'aov_drop']
  confidence_score NUMERIC(3,2) NOT NULL,           -- 0.00–1.00 at fire time

  merchant_confirmation TEXT NOT NULL DEFAULT 'pending'
    CHECK (merchant_confirmation IN ('pending', 'confirmed', 'corrected', 'rejected')),
  confirmed_start DATE,                             -- populated when merchant_confirmation = 'corrected'
  confirmed_end DATE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_detected_sales_merchant_pending
  ON public.merchant_detected_sales(merchant_id, created_at DESC)
  WHERE merchant_confirmation = 'pending';

ALTER TABLE public.merchant_detected_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation merchant_detected_sales"
  ON public.merchant_detected_sales
  FOR ALL
  USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));
