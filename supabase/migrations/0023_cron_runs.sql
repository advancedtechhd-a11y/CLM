-- ============================================================
-- Migration 0023 — cron_runs state table (v1.5 chunked-cron refactor)
--
-- One row per cron invocation. Powers:
--   * Chunked self-firing: each chunk reads the run row, processes
--     N merchants, increments chunks_completed, fires next chunk.
--   * detect-stuck-cron-runs: scans for status='in_progress' rows
--     whose last_chunk_at is >1 hour stale, re-fires next chunk.
--   * Recovery counter: per-run, NOT cumulative. recovery_attempts
--     resets to 0 on every successful chunk completion. Caps at 3
--     before the run is marked 'failed'.
--
-- Distinct from merchants.health_backfill_* fields (which track per-
-- merchant historical-health backfill state, separate concern).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_path TEXT NOT NULL,             -- e.g. '/api/cron/compute-daily-metrics'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_chunk_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'complete', 'failed')),

  chunks_completed INTEGER NOT NULL DEFAULT 0,
  total_merchants INTEGER NOT NULL,

  -- Per-incident counter. Reset to 0 on each successful chunk.
  -- Cap at 3 before status flips to 'failed'.
  recovery_attempts INTEGER NOT NULL DEFAULT 0,

  error TEXT,
  metadata JSONB,                      -- e.g. { "metric_date": "2026-05-07" }

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot index: detect-stuck-cron-runs scans this exact filter
CREATE INDEX IF NOT EXISTS idx_cron_runs_active_stale
  ON public.cron_runs(cron_path, last_chunk_at)
  WHERE status = 'in_progress';

-- Recent runs lookup (for ops dashboard / debugging)
CREATE INDEX IF NOT EXISTS idx_cron_runs_path_recent
  ON public.cron_runs(cron_path, started_at DESC);

-- No RLS — cron_runs is system-level state, not tenant-scoped.
-- Server-side cron handlers connect via pg.Client (service_role) which
-- bypasses RLS anyway. The table is never queried from merchant context.
