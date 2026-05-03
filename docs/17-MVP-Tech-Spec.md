# 17 — MVP Technical Build Spec

The buildable blueprint. Everything you need to start coding from a blank repo.

## Repo structure (full)

```
lifecycle-dev/
├── README.md
├── CLAUDE.md
├── .gitignore
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
│
├── docs/                          ← Obsidian vault (already created)
│
├── public/                        ← Static assets
│   └── favicon.ico
│
├── app/                           ← Next.js 14 App Router
│   ├── layout.tsx
│   ├── page.tsx                   ← Marketing homepage
│   │
│   ├── (auth)/                    ← Auth route group
│   │   ├── signin/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── auth-callback/route.ts
│   │
│   ├── (app)/                     ← Authenticated app
│   │   ├── layout.tsx             ← Sidebar + auth check
│   │   ├── dashboard/
│   │   │   ├── page.tsx           ← Main dashboard
│   │   │   └── loading.tsx
│   │   ├── onboarding/
│   │   │   ├── page.tsx           ← 4-step wizard
│   │   │   └── steps/             ← Each step component
│   │   ├── strategy/
│   │   │   ├── page.tsx           ← All programs
│   │   │   └── [programId]/page.tsx
│   │   ├── segments/
│   │   │   ├── page.tsx           ← All segments
│   │   │   └── [segmentId]/page.tsx
│   │   ├── customers/
│   │   │   ├── page.tsx
│   │   │   └── [customerId]/page.tsx
│   │   ├── reports/
│   │   │   └── page.tsx
│   │   ├── integrations/
│   │   │   └── page.tsx
│   │   └── settings/
│   │       ├── account/page.tsx
│   │       ├── billing/page.tsx
│   │       └── team/page.tsx
│   │
│   └── api/                       ← API routes
│       ├── auth/                  ← Supabase auth callbacks
│       ├── connect/
│       │   ├── stripe/route.ts    ← Stripe Connect OAuth callback
│       │   └── shopify/route.ts   ← Shopify OAuth callback
│       ├── upload/
│       │   └── csv/route.ts
│       ├── strategy/
│       │   ├── generate/route.ts
│       │   ├── regenerate/route.ts
│       │   └── [programId]/route.ts
│       ├── export/
│       │   ├── klaviyo/route.ts
│       │   ├── csv/route.ts
│       │   └── pdf/route.ts
│       ├── webhooks/
│       │   ├── stripe/route.ts    ← Their Stripe webhooks (data sync)
│       │   ├── shopify/route.ts
│       │   ├── klaviyo/route.ts   ← Engagement data
│       │   └── lifecycle-billing/route.ts ← Our Stripe billing
│       └── ml/
│           └── score/route.ts     ← Proxy to Python ML service
│
├── components/                    ← React components
│   ├── ui/                        ← shadcn/ui primitives
│   ├── dashboard/
│   ├── onboarding/
│   ├── strategy/
│   ├── segments/
│   └── shared/
│
├── lib/                           ← Business logic
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── types.ts
│   ├── auth/
│   │   ├── session.ts
│   │   └── middleware.ts
│   ├── integrations/
│   │   ├── stripe.ts              ← Their Stripe (read-only)
│   │   ├── shopify.ts
│   │   ├── klaviyo.ts
│   │   ├── crawler.ts
│   │   └── webhooks.ts
│   ├── rules/                     ← The rules engine (the IP)
│   │   ├── rfm.ts
│   │   ├── lifecycle-stages.ts
│   │   ├── dynamic-thresholds.ts
│   │   ├── segments/
│   │   │   ├── lifecycle.ts
│   │   │   ├── value-tier.ts
│   │   │   ├── rfm-segments.ts
│   │   │   ├── behavioral.ts
│   │   │   └── custom.ts
│   │   ├── nbo.ts                 ← NBO rules (uses ML scores)
│   │   ├── eligibility.ts
│   │   └── compliance.ts
│   ├── llm/                       ← AI brain (see [[16-AI-Brain-Spec]])
│   │   ├── client.ts
│   │   ├── cache.ts
│   │   ├── prompts/
│   │   │   ├── brand-extraction.ts
│   │   │   ├── copy-generation.ts
│   │   │   ├── nbp-reasoning.ts
│   │   │   ├── narrative.ts
│   │   │   ├── anomaly.ts
│   │   │   ├── qa.ts
│   │   │   ├── subject-variants.ts
│   │   │   └── transition-audit.ts
│   │   └── schemas/               ← Zod schemas for output validation
│   ├── ml/                        ← Calls Python ML service
│   │   ├── client.ts
│   │   ├── clv.ts
│   │   ├── nbp.ts
│   │   └── churn.ts
│   ├── strategy/
│   │   ├── orchestrator.ts        ← Combines rules + ML + LLM
│   │   ├── programs/
│   │   │   ├── onboarding.ts
│   │   │   ├── engagement.ts
│   │   │   ├── retention.ts
│   │   │   ├── winback.ts
│   │   │   └── advocacy.ts
│   │   └── output-formatter.ts
│   ├── reporting/
│   │   ├── attribution.ts
│   │   ├── program-performance.ts
│   │   ├── stage-health.ts
│   │   └── pdf-generator.ts
│   ├── klaviyo/
│   │   ├── flow-translator.ts
│   │   ├── segment-sync.ts
│   │   └── template-generator.ts
│   ├── billing/
│   │   ├── stripe-subscription.ts
│   │   └── usage-limits.ts
│   └── utils/
│       ├── date.ts
│       ├── currency.ts
│       └── validation.ts
│
├── workers/                       ← Background jobs (Inngest)
│   ├── sync-stripe.ts
│   ├── sync-shopify.ts
│   ├── compute-segments.ts
│   ├── score-ml.ts
│   ├── generate-strategy.ts
│   ├── monthly-narrative.ts
│   └── attribution-tracker.ts
│
├── ml-service/                    ← Python ML microservice
│   ├── pyproject.toml
│   ├── main.py                    ← FastAPI app
│   ├── models/
│   │   ├── clv.py                 ← BG-NBD + Gamma-Gamma
│   │   ├── nbp.py                 ← Collaborative filtering
│   │   └── churn.py               ← BG-NBD / LightGBM
│   ├── training/
│   │   ├── pipeline.py
│   │   └── scheduled.py
│   └── tests/
│
├── tests/                         ← TS tests
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
└── scripts/                       ← Dev / deploy / data scripts
    ├── seed-test-data.ts
    └── migrations/
```

## Database schema (Supabase Postgres)

### Core tables

```sql
-- Users (our SaaS customers)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Auth managed by Supabase Auth
);

-- Their tenants / brands
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  business_type TEXT, -- 'ecommerce' | 'saas' | 'subscription' | 'course' | 'other'
  website_url TEXT,
  currency TEXT DEFAULT 'USD',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Pricing tier
  tier TEXT DEFAULT 'starter', -- 'starter' | 'growth' | 'pro' | 'agency'
  max_customers INTEGER DEFAULT 1000
);

-- Connected integrations
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'stripe' | 'shopify' | 'klaviyo' | etc
  -- Encrypted credentials
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  account_id TEXT, -- their Stripe account / Shopify shop
  status TEXT DEFAULT 'active', -- 'active' | 'expired' | 'revoked'
  scopes JSONB,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brand profiles (extracted from website crawl)
CREATE TABLE brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE UNIQUE,
  data JSONB NOT NULL, -- full profile per [[16-AI-Brain-Spec]]
  confidence TEXT, -- 'low' | 'medium' | 'high'
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  next_refresh_at TIMESTAMPTZ
);

-- Customers (their customers, our data)
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  external_id TEXT, -- their customer ID in Stripe/Shopify
  email_hash TEXT, -- sha256 for deduplication
  email_encrypted TEXT, -- encrypted PII
  first_name TEXT,
  metadata JSONB, -- flexible
  -- Computed RFM
  recency_days INTEGER,
  frequency INTEGER,
  monetary NUMERIC,
  rfm_score TEXT, -- e.g. "5,4,5"
  -- Computed lifecycle
  lifecycle_stage TEXT, -- 'acquisition' | 'onboarding' | etc
  stage_entered_at TIMESTAMPTZ,
  -- Computed value
  clv_tier TEXT, -- 'platinum' | 'gold' | 'silver' | 'bronze'
  -- Behavioral flags
  is_bnpl_user BOOLEAN DEFAULT FALSE,
  payment_method_mix JSONB,
  -- Sync metadata
  first_seen_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  UNIQUE (brand_id, external_id)
);

CREATE INDEX idx_customers_brand_stage ON customers(brand_id, lifecycle_stage);
CREATE INDEX idx_customers_brand_clv ON customers(brand_id, clv_tier);

-- Transactions (orders, subscriptions, payments)
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  external_id TEXT,
  type TEXT, -- 'order' | 'subscription' | 'refund' | 'dispute'
  amount NUMERIC NOT NULL,
  currency TEXT,
  product_ids JSONB, -- array of products
  payment_method TEXT, -- 'card' | 'klarna' | 'affirm' | etc
  bnpl_provider TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  metadata JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (brand_id, external_id)
);

CREATE INDEX idx_transactions_customer ON transactions(customer_id, occurred_at);

-- Products (their catalog)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT,
  category TEXT,
  price NUMERIC,
  metadata JSONB,
  active BOOLEAN DEFAULT TRUE,
  UNIQUE (brand_id, external_id)
);

-- ML scores per customer
CREATE TABLE customer_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE UNIQUE,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  -- CLV
  historical_clv NUMERIC,
  predicted_clv_24mo NUMERIC,
  p_alive NUMERIC, -- 0..1
  expected_purchases_12mo NUMERIC,
  expected_avg_value NUMERIC,
  clv_percentile NUMERIC,
  -- Churn
  p_churn_30d NUMERIC,
  p_churn_60d NUMERIC,
  p_churn_90d NUMERIC,
  churn_signals JSONB,
  -- NBP
  nbp_ranked JSONB, -- [{product_id, score, reasoning}]
  -- Channel
  channel_propensity JSONB,
  -- Send time
  optimal_send_hour INTEGER,
  -- Price sensitivity
  price_sensitivity_score INTEGER, -- 0..100
  -- Metadata
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  model_version TEXT
);

-- Segments
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT, -- 'lifecycle' | 'value_tier' | 'rfm' | 'behavioral' | 'custom'
  name TEXT NOT NULL,
  description TEXT,
  definition JSONB, -- query rules
  is_dynamic BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  computed_at TIMESTAMPTZ
);

-- Segment memberships (denormalized for query speed)
CREATE TABLE segment_memberships (
  segment_id UUID REFERENCES segments(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (segment_id, customer_id)
);

-- Strategies (generated programs per brand)
CREATE TABLE strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  refresh_type TEXT, -- 'monthly' | 'on_demand' | 'initial'
  programs JSONB, -- array of program specs
  health_score INTEGER -- 0-100
);

-- Programs (individual campaigns within a strategy)
CREATE TABLE programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  type TEXT, -- 'onboarding_d21' | 'winback_t3' | etc
  segment_id UUID REFERENCES segments(id),
  status TEXT DEFAULT 'draft', -- 'draft' | 'pushed' | 'completed'
  priority INTEGER,
  estimated_impact_usd NUMERIC,
  message JSONB, -- subject variants, body, CTA
  offer JSONB, -- discount, channel, urgency, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  pushed_at TIMESTAMPTZ
);

-- Program executions (track what we pushed where)
CREATE TABLE program_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE,
  destination TEXT, -- 'klaviyo' | 'customer_io' | 'csv' | etc
  destination_id TEXT, -- their flow ID at the destination
  customer_count INTEGER,
  pushed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attribution events (linking sends → conversions)
CREATE TABLE attribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  program_id UUID REFERENCES programs(id),
  event_type TEXT, -- 'sent' | 'opened' | 'clicked' | 'converted'
  conversion_value NUMERIC,
  occurred_at TIMESTAMPTZ NOT NULL
);

-- LLM cache
CREATE TABLE llm_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  prompt_type TEXT,
  prompt_version TEXT,
  output JSONB NOT NULL,
  cost_usd NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_llm_cache_key ON llm_cache(cache_key);
CREATE INDEX idx_llm_cache_expires ON llm_cache(expires_at) WHERE expires_at IS NOT NULL;

-- Our SaaS billing (we use Stripe)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT NOT NULL,
  status TEXT, -- 'trial' | 'active' | 'past_due' | 'canceled'
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row-level security (RLS)

All tables have RLS enabled. Pattern:

```sql
-- Users can only see their own brands
CREATE POLICY "Users see own brands" ON brands
FOR ALL USING (user_id = auth.uid());

-- Customers, transactions, etc. cascade through brand_id
CREATE POLICY "Users see customers via brand" ON customers
FOR ALL USING (
  brand_id IN (SELECT id FROM brands WHERE user_id = auth.uid())
);
```

## API contracts

### Authentication
Handled by Supabase Auth. Middleware checks session on protected routes.

### Connect Stripe
```
POST /api/connect/stripe
  → Returns Stripe OAuth URL
  
GET /api/connect/stripe/callback?code=...
  → Exchanges code for token, stores in integrations table
  → Triggers initial sync worker
```

### Connect Shopify
```
POST /api/connect/shopify
Body: { shop_domain: string }
  → Returns Shopify OAuth URL
  
GET /api/connect/shopify/callback?code=...&shop=...
  → Exchanges code for token, stores
  → Triggers initial sync
```

### Generate strategy
```
POST /api/strategy/generate
Body: { brand_id }
  → Triggers background job
  → Returns: { job_id }
  
GET /api/strategy/{strategyId}
  → Returns full strategy with programs
```

### Push to Klaviyo
```
POST /api/export/klaviyo
Body: { program_id }
  → Translates program → Klaviyo flow JSON
  → Pushes via Klaviyo API
  → Returns: { destination_id, status }
```

## Python ML service contracts

Separate service (FastAPI on Railway).

```
POST /score/clv
Body: { brand_id, customer_data: [...] }
Returns: { customer_id: { clv_predicted, p_alive, ... } }

POST /score/nbp
Body: { brand_id, customer_id, products: [...] }
Returns: { ranked: [{product_id, score}, ...] }

POST /score/churn
Body: { brand_id, customer_data, business_type }
Returns: { customer_id: { p_churn_30d, signals: [...] } }

POST /train/full
Body: { brand_id }
  → Trains all models for one brand
  → Background, returns job_id
```

## Background workers (Inngest)

```typescript
// workers/sync-stripe.ts
export const syncStripe = inngest.createFunction(
  { id: "sync-stripe" },
  { event: "integrations/stripe.connected" },
  async ({ event, step }) => {
    // 1. Pull last 24 months of customers
    // 2. Pull all transactions
    // 3. Detect BNPL signals
    // 4. Trigger compute-segments
  }
);

// workers/compute-segments.ts
export const computeSegments = inngest.createFunction(
  { id: "compute-segments" },
  { event: "data/synced" },
  async ({ event, step }) => {
    // 1. Calculate RFM scores
    // 2. Assign lifecycle stages
    // 3. Compute dynamic thresholds
    // 4. Update segment memberships
    // 5. Trigger ML scoring
  }
);

// workers/score-ml.ts
// workers/generate-strategy.ts
// workers/monthly-narrative.ts
// workers/attribution-tracker.ts
```

## Environment variables (.env.example)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# Stripe (our SaaS billing)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Stripe Connect (for clients)
STRIPE_CONNECT_CLIENT_ID=

# Shopify
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=

# Klaviyo
KLAVIYO_REVISION_HEADER=2024-10-15

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# ML service
ML_SERVICE_URL=https://lifecycle-ml.up.railway.app
ML_SERVICE_API_KEY=

# Encryption (for storing tokens)
ENCRYPTION_KEY=  # 32-byte key

# Misc
NEXT_PUBLIC_APP_URL=https://lifecycleai.com
NODE_ENV=production
```

## Build order (week by week)

See [[14-Build-Plan]] for the full timeline. Build sequence below maps to weeks.

| Weeks | Building | Blocking? |
|-------|----------|-----------|
| 1 | Repo init, deps, Tailwind/shadcn, Supabase project | All later work |
| 2 | Auth flow (signup/signin/callback) | Dashboard |
| 3 | Empty dashboard shell, sidebar, settings | Onboarding |
| 4 | Stripe Connect OAuth + initial sync | Data flow |
| 5 | Shopify OAuth + sync, CSV upload | Coverage |
| 6 | Brand profile crawler + extraction | Personalization |
| 7-8 | Rules engine: RFM, lifecycle stages, dynamic thresholds | Everything |
| 9 | 5 segment types + custom builder | Programs |
| 10-11 | Python ML service: CLV (BG-NBD) + endpoints | Predictions |
| 12 | NBP collaborative filtering | Cross-sell |
| 13 | Churn (BG-NBD / LightGBM) | Retention |
| 14 | LLM client + prompts + caching | Copy/narrative |
| 15-16 | Strategy orchestrator + 6 stage program types | Output |
| 17 | Klaviyo flow translator + push | Activation |
| 18 | Attribution + per-program reporting | ROI viz |
| 19 | Stage health + monthly narrative | Retention of OUR customers |
| 20 | Polish, friend's-store testing, bug fixes | Launch readiness |

## Definition of done (MVP)

A friend's Shopify store can:
- [ ] Sign up
- [ ] Connect Shopify + Stripe
- [ ] See their data synced (customers, orders)
- [ ] See computed segments and lifecycle stages
- [ ] See ML predictions (CLV, NBP, churn) per customer
- [ ] Generate a strategy with 5+ programs
- [ ] See brand-voice-matched copy in each program
- [ ] Push one program to Klaviyo with one click
- [ ] See attribution data after the program runs
- [ ] Get a monthly digest email

If all that works without crashes, we ship.

## Tooling decisions to lock in

- [ ] Background jobs: **Inngest** (recommend) vs Trigger.dev
- [ ] ML hosting: **Railway** (recommend) vs Modal
- [ ] Crawler: **Cheerio + fetch** for MVP (cheap), Playwright for SPA fallback
- [ ] CSS: **Tailwind + shadcn/ui** (locked)
- [ ] LLM: **Sonnet 4.6 default**, Opus for monthly narratives, Haiku for transition audits
- [ ] Email transactional (for our SaaS): **Resend** (signup confirmations, billing)
- [ ] Error tracking: **Sentry**
- [ ] Analytics: **PostHog** (privacy-respectful)
- [ ] Domain: TBD when name is finalized

## Phase 2 additions (after MVP)

- WhatsApp + mobile push channels
- Customer.io + Mailchimp + ConvertKit exports
- Reviews integration (Yotpo/Stamped)
- Support tickets integration (Intercom/Gorgias)
- A/B testing + control groups
- Goal setting
- Per-client custom ML training
- Auto-send mode (Postmark/Twilio backend)
- Multi-user team accounts
- White-label (Agency tier)
