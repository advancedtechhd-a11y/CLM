-- ============================================================
-- Migration 0002 — Backfill public.users from auth.users
--
-- The trigger created in 0001 auto-creates public.users rows on NEW signups,
-- but doesn't backfill users that existed before the migration was applied.
-- This migration ensures all existing auth.users have corresponding public.users rows.
-- ============================================================

INSERT INTO public.users (id, email, full_name)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', '')
FROM auth.users
ON CONFLICT (id) DO NOTHING;
