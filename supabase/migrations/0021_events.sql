-- ============================================================
-- Migration 0021 — events table (v1.5 Phase 5)
--
-- Append-only audit log of customer + system events. Powers the
-- RecentActivity widget. 90-day retention enforced by the cleanup cron
-- (/api/cron/cleanup-events at 3am UTC).
--
-- dedupe_key prevents duplicate inserts from Shopify webhook retries:
-- emit code populates as `${event_type}:${entity_id}` (e.g.
-- "order.created:gid://shopify/Order/123"). Different retries → same key
-- → ON CONFLICT DO NOTHING. Different events on the same entity (eg
-- order.created vs order.first) → distinct keys, both flow through.
-- NULL dedupe_key allowed (multiple NULLs OK by Postgres default) for
-- future system events with no natural unique identifier.
--
-- Payload is denormalized at emit time (customer_name, order_total, etc.)
-- so the widget can render without JOIN. Critical for GDPR — when a
-- customer is deleted, their historical activity entries still render
-- from the cached payload.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,             -- "order.created" | "order.first" | "cart.abandoned" | ...
  entity_type TEXT,                      -- "order" | "cart" | "customer"
  entity_id TEXT,                        -- external ref (Shopify ID); not a UUID FK
  actor_type TEXT NOT NULL DEFAULT 'system',  -- "system" | "merchant" | "customer"
  actor_id UUID,                         -- merchant user id when applicable
  dedupe_key TEXT UNIQUE,                -- nullable; only set when a natural key exists
  payload JSONB NOT NULL DEFAULT '{}',   -- denormalized — render reads from this only
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_merchant_recent
  ON public.events(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_entity
  ON public.events(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_type
  ON public.events(merchant_id, event_type, created_at DESC);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation events"
  ON public.events
  FOR ALL
  USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));
