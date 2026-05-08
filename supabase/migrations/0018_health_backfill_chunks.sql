-- ============================================================
-- Migration 0018 — Chunked health-backfill progress (v1.5 Phase 3.5+)
--
-- Tracks chunk-level progress so large merchants (100K+ customers) can
-- complete the backfill across multiple Vercel function invocations
-- (each ≤ 5 min) instead of one long-running invocation that may time out.
--
-- Chunked pattern:
--   * 9 chunks of 10 days each = 90 days total
--   * Each chunk runs in its own /api/internal/backfill-health-history POST
--   * On completion, the chunk fires the next chunk fire-and-forget
--   * Progress visible to the merchant via "Day X of 90" in the widget
-- ============================================================

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS health_backfill_chunks_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS health_backfill_chunks_total INTEGER,
  ADD COLUMN IF NOT EXISTS health_backfill_last_chunk_at TIMESTAMPTZ;
