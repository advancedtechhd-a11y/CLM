-- ============================================================
-- Migration 0017 — Health Backfill Status (v1.5 Phase 3.5)
--
-- Tracks the historical customer_health_history reconstruction job that
-- runs after install. Lets the HealthScoreTrend widget show
-- "Calculating your customer health history..." instead of an empty state
-- while the backfill is in flight (typically 1-5 minutes).
--
-- States:
--   pending      → not yet started (default for existing rows + new installs)
--   in_progress  → backfill job currently running
--   complete     → backfill finished, widget renders normally
--   failed       → job hit an error, can be retried via the manual script
-- ============================================================

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS health_backfill_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (health_backfill_status IN ('pending', 'in_progress', 'complete', 'failed')),
  ADD COLUMN IF NOT EXISTS health_backfill_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_backfill_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_backfill_error TEXT;
