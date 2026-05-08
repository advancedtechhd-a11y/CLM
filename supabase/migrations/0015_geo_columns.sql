-- ============================================================
-- Migration 0015 — Geo columns on merchants + customers (v1.5 Phase 1)
--
-- Adds country_code/country_name to merchants. Currency + timezone are
-- already covered by existing `store_currency` / `store_timezone` columns
-- (migration 0001) — we DO NOT duplicate them.
--
-- Adds country_code/country_name/region/city to customers, plus an index
-- on (merchant_id, country_code) used by the GeographicSpread widget.
--
-- Both new column sets are nullable — populated lazily from Shopify on
-- install (merchants) and during customer sync / webhook (customers).
-- A one-time backfill covers existing rows: scripts/backfill_merchant_geo.ts
-- and scripts/backfill_customer_geo.ts.
--
-- RLS inherits from existing tenant-isolation policies — no change.
-- ============================================================

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS country_code TEXT,        -- "US", "AE", "GB"  (ISO 3166-1 alpha-2)
  ADD COLUMN IF NOT EXISTS country_name TEXT;        -- "United States"

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS country_code TEXT,        -- "AE"
  ADD COLUMN IF NOT EXISTS country_name TEXT,        -- "United Arab Emirates"
  ADD COLUMN IF NOT EXISTS region TEXT,              -- "Dubai", "California"  (Shopify "province")
  ADD COLUMN IF NOT EXISTS city TEXT;                -- "Dubai", "San Francisco"

CREATE INDEX IF NOT EXISTS idx_customers_country_code
  ON public.customers(merchant_id, country_code)
  WHERE country_code IS NOT NULL;
