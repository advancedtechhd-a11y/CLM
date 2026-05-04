-- ============================================================
-- Migration 0001 — Core schema
-- Lifecycle SaaS — Shopify-first MVP
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS (our SaaS customers — Shopify merchants signing up)
-- Auth managed by Supabase Auth. This table extends auth.users.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MERCHANTS (the Shopify stores we connect to)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Platform identification
  platform TEXT NOT NULL DEFAULT 'shopify',   -- shopify | woocommerce | bigcommerce | salla | zid | csv
  shop_domain TEXT NOT NULL,                  -- e.g. lifecycle-dev-test.myshopify.com

  -- Encrypted access tokens (stored using pgcrypto)
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  scopes JSONB,

  -- Store metadata
  store_name TEXT,
  store_currency TEXT DEFAULT 'USD',
  store_timezone TEXT,
  business_type TEXT DEFAULT 'ecommerce',     -- ecommerce | saas | subscription | course | other
  category TEXT,                              -- skincare | apparel | supplements | etc.
  monthly_gmv_usd NUMERIC,

  -- Subscription tier (our SaaS billing)
  tier TEXT DEFAULT 'starter',                -- starter | growth | pro | agency | enterprise
  status TEXT DEFAULT 'active',               -- active | suspended | uninstalled
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Sync state
  initial_sync_completed_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,

  -- Timestamps
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  uninstalled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (platform, shop_domain)
);
CREATE INDEX idx_merchants_user ON public.merchants(user_id);
CREATE INDEX idx_merchants_status ON public.merchants(status);

-- ============================================================
-- BRAND PROFILES (extracted from website crawl)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE UNIQUE,
  data JSONB NOT NULL,                        -- full profile (voice, category, target customer, etc.)
  confidence TEXT,                            -- low | medium | high
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  next_refresh_at TIMESTAMPTZ
);

-- ============================================================
-- CUSTOMERS (THEIR customers — the merchants' customers)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,

  -- External identification
  external_id TEXT NOT NULL,                  -- Shopify customer ID
  email TEXT,
  email_hash TEXT,                            -- sha256 for deduplication
  phone TEXT,
  first_name TEXT,
  last_name TEXT,

  -- Aggregate financial metrics (synced)
  total_spent NUMERIC DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  first_order_at TIMESTAMPTZ,
  last_order_at TIMESTAMPTZ,

  -- Marketing consent
  email_marketing_consent BOOLEAN DEFAULT FALSE,
  sms_marketing_consent BOOLEAN DEFAULT FALSE,
  email_unsubscribed BOOLEAN DEFAULT FALSE,

  -- Tags (from Shopify)
  tags TEXT[],

  -- Raw platform data
  raw_data JSONB,

  -- Sync metadata
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (merchant_id, external_id)
);
CREATE INDEX idx_customers_merchant ON public.customers(merchant_id);
CREATE INDEX idx_customers_email_hash ON public.customers(merchant_id, email_hash);
CREATE INDEX idx_customers_last_order ON public.customers(merchant_id, last_order_at);

-- ============================================================
-- ORDERS (transactions)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,

  -- External identification
  external_id TEXT NOT NULL,                  -- Shopify order ID
  order_number TEXT,

  -- Financial
  order_total NUMERIC NOT NULL,
  subtotal NUMERIC,
  discount_total NUMERIC DEFAULT 0,
  tax_total NUMERIC DEFAULT 0,
  shipping_total NUMERIC DEFAULT 0,
  refund_total NUMERIC DEFAULT 0,
  currency TEXT,

  -- Status
  financial_status TEXT,                      -- paid | pending | refunded | partially_refunded
  fulfillment_status TEXT,                    -- fulfilled | partial | unfulfilled

  -- Payment method (for BNPL detection)
  payment_method TEXT,                        -- card | klarna | affirm | tabby | tamara | paypal | etc
  bnpl_provider TEXT,                         -- klarna | affirm | tabby | tamara | etc (when applicable)

  -- Timing
  ordered_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,

  -- Raw platform data
  raw_data JSONB,

  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (merchant_id, external_id)
);
CREATE INDEX idx_orders_merchant ON public.orders(merchant_id);
CREATE INDEX idx_orders_customer ON public.orders(customer_id, ordered_at);
CREATE INDEX idx_orders_ordered_at ON public.orders(merchant_id, ordered_at);

-- ============================================================
-- ORDER LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Product reference
  external_product_id TEXT,
  external_variant_id TEXT,
  product_title TEXT,
  variant_title TEXT,
  sku TEXT,

  -- Financial
  quantity INTEGER,
  price NUMERIC,
  total_discount NUMERIC DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_line_items_order ON public.order_line_items(order_id);
CREATE INDEX idx_line_items_product ON public.order_line_items(merchant_id, external_product_id);

-- ============================================================
-- PRODUCTS (catalog)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  title TEXT,
  product_type TEXT,
  vendor TEXT,
  tags TEXT[],
  price NUMERIC,
  status TEXT,                                -- active | draft | archived
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (merchant_id, external_id)
);
CREATE INDEX idx_products_merchant ON public.products(merchant_id);

-- ============================================================
-- WEBHOOKS LOG (for debugging + replay)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  event_type TEXT NOT NULL,                   -- orders/create | customers/update | etc
  external_id TEXT,                           -- the Shopify object ID this event references
  payload JSONB,
  hmac_verified BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  error TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_webhooks_merchant ON public.webhook_events(merchant_id, received_at DESC);
CREATE INDEX idx_webhooks_unprocessed ON public.webhook_events(received_at) WHERE processed_at IS NULL;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Users see only their own user row
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own row" ON public.users
  FOR ALL USING (id = auth.uid());

-- Users see only their own merchants
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own merchants" ON public.merchants
  FOR ALL USING (user_id = auth.uid());

-- Customers, orders, line items, products, brand profiles cascade through merchants
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation brand_profiles" ON public.brand_profiles
  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation customers" ON public.customers
  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation orders" ON public.orders
  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));

ALTER TABLE public.order_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation line_items" ON public.order_line_items
  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation products" ON public.products
  FOR ALL USING (merchant_id IN (SELECT id FROM public.merchants WHERE user_id = auth.uid()));

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
-- Webhooks should NOT be readable by users — only service role
CREATE POLICY "Service role only — webhooks" ON public.webhook_events
  FOR ALL USING (false);  -- no user access; only service role bypasses

-- ============================================================
-- AUTO-CREATE public.users ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- updated_at AUTO-UPDATE TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_merchants_updated_at BEFORE UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
