-- ============================================================
-- Migration 0019 — Health-backfill recovery attempt counter
--
-- Counts how many times the detect-stuck-backfills cron has had to
-- nudge a merchant's chain back to life. Capped at 3 — after that,
-- status flips to 'failed' with the counter recorded in
-- health_backfill_error so it surfaces for manual recovery.
--
-- Counter is cumulative across the entire backfill (NOT reset on
-- successful chunks). Three nudges from one ~5-minute job is enough
-- signal that something is fundamentally wrong.
-- ============================================================

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS health_backfill_recovery_attempts INTEGER NOT NULL DEFAULT 0;
