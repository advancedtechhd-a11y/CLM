# Pre-Launch Scale Hardening Spec

**Purpose:** Address every remaining scale risk before onboarding paying merchants. Each item identified during conversation review of the codebase + production readiness audit.

**Total effort:** ~7-9 days for all critical items. Can ship in stages.

**When to build:** After Days 17-18 (Shopify Billing API), before Day 19 (production deploy). Each item listed with priority + effort.

**Locked principles (apply throughout):**

1. RLS pattern: `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`
2. Vercel Cron only (no Inngest)
3. shadcn theme tokens, no hex codes
4. Migration-friendly structure: business logic in `lib/`, routes are thin wrappers
5. Observable signals in your own logs, NOT vendor dashboard behavior (unless verified)
6. Per-incident counter resets on success (not cumulative)
7. Idempotent operations everywhere (ON CONFLICT, atomic claims, dedupe keys)

---

## Item Priority Summary

| # | Item | Priority | Effort | Risk if skipped |
|---|---|---|---|---|
| 1 | Async webhook processing | 🔴 CRITICAL | 2-3 days | Black Friday merchant breaks your app |
| 2 | Supabase pooler verification | 🔴 CRITICAL | half day | DB connection limits hit at 20 merchants |
| 3 | Critical query indexing audit | 🟠 HIGH | 1 day | Dashboard slows past 50 merchants |
| 4 | Strategy regeneration concurrent limit | 🟠 HIGH | half day | LLM rate limits at 10+ concurrent merchants |
| 5 | LLM cost monitoring per merchant | 🟡 MEDIUM | half day | Margin erosion goes undetected |
| 6 | Daily health check job | 🟡 MEDIUM | half day | Silent failures go unnoticed |
| 7 | Sentry setup | 🟡 MEDIUM | 1 hour | Production errors invisible |
| 8 | Database backup verification | 🟠 HIGH | 1 hour | Data loss risk during early scale |
| 9 | Webhook signature replay protection | 🟡 MEDIUM | half day | Replay attacks on auth tokens |
| 10 | Rate limiting on public endpoints | 🟡 MEDIUM | half day | DOS vector on auth/signup |
| 11 | Pre-built scaling tools setup | 🟢 LOW | 1 hour | None now, faster scale later |
| 12 | Documented escape hatch runbooks | 🟡 MEDIUM | half day | Emergency response delayed |

**Critical path (must ship before launch):** Items 1, 2, 3, 4, 8 = ~5 days
**Should ship before launch:** Items 5, 6, 7, 9, 10 = ~3 days
**Nice to have:** Items 11, 12 = ~1.5 hours total

---

# CRITICAL ITEMS (must ship before paying merchants)

## Item 1: Async Webhook Processing (2-3 days) 🔴

### The Risk

Today, your Shopify webhook handler does heavy work inline. Under load, this fails:

- Shopify retries webhooks if your endpoint doesn't return 200 within **5 seconds**
- One merchant with a Black Friday flash sale (1000+ orders/hour) overwhelms your sync
- Shopify auto-disables your app endpoint after too many failed retries
- Merchant wakes up to a broken app, support ticket, churn risk

This is your single biggest hidden scale risk.

### Current State (verify in code)

Search your webhook handler for what it does inline:
- HMAC verification (~10ms) — fast, fine
- Customer/order upsert (~50ms) — fast, fine
- DNA recompute (~500ms-2s) — TOO SLOW
- Strategy program updates (~1s+) — TOO SLOW
- ML scoring trigger (~5-30s) — DEFINITELY TOO SLOW

Anything beyond simple insert needs to move to background processing.

### Implementation

**Schema change:**

```sql
-- Migration 0024: webhook processing queue
CREATE TABLE webhook_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,                       -- 'orders/create', 'customers/update', etc.
  shop_domain TEXT NOT NULL,
  shopify_webhook_id TEXT,                   -- from X-Shopify-Webhook-Id header
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending, processing, completed, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Dedup: same webhook arriving twice from Shopify retry won't queue twice
  UNIQUE(shop_domain, topic, shopify_webhook_id)
);

CREATE INDEX idx_webhook_queue_pending 
  ON webhook_processing_queue(status, received_at) 
  WHERE status = 'pending';

CREATE INDEX idx_webhook_queue_processing
  ON webhook_processing_queue(status, started_at)
  WHERE status = 'processing';

-- Use existing webhook_events audit table for completed records,
-- or extend this table to be both queue + audit
```

**Webhook handler refactor:**

```typescript
// app/api/webhooks/shopify/[...topic]/route.ts
export async function POST(req: NextRequest) {
  const body = await req.text();
  const topic = headers.get('x-shopify-topic');
  const shopDomain = headers.get('x-shopify-shop-domain');
  const webhookId = headers.get('x-shopify-webhook-id');
  const hmac = headers.get('x-shopify-hmac-sha256');
  
  // 1. HMAC verify (fast, ~10ms)
  if (!verifyShopifyHmac(body, hmac)) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // 2. Insert into queue (fast, ~50ms)
  // ON CONFLICT handles Shopify webhook retries — same webhook_id won't queue twice
  await pg.query(`
    INSERT INTO webhook_processing_queue (topic, shop_domain, shopify_webhook_id, payload)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (shop_domain, topic, shopify_webhook_id) DO NOTHING
  `, [topic, shopDomain, webhookId, JSON.parse(body)]);
  
  // 3. Return 200 IMMEDIATELY (total <100ms)
  return new Response('OK', { status: 200 });
}
```

**Background processor (chunked cron):**

```typescript
// app/api/cron/process-webhook-queue/route.ts
// Schedule: every 1 minute (high-frequency for low-latency processing)
// Uses runChunkedCron pattern from Phase 8

export async function GET(req: NextRequest) {
  return runChunkedCron(req, {
    cronPath: '/api/cron/process-webhook-queue',
    batchSize: 10,
    customQuery: `
      WITH claimed AS (
        SELECT id FROM webhook_processing_queue
        WHERE status = 'pending'
        ORDER BY received_at ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      ),
      claimed_update AS (
        UPDATE webhook_processing_queue
        SET status = 'processing', started_at = NOW(), attempts = attempts + 1
        WHERE id IN (SELECT id FROM claimed)
        RETURNING *
      )
      SELECT * FROM claimed_update
    `,
    processOne: async (pg, item) => {
      try {
        await processWebhookByTopic(pg, item);
        await pg.query(`
          UPDATE webhook_processing_queue
          SET status = 'completed', completed_at = NOW()
          WHERE id = $1
        `, [item.id]);
      } catch (err) {
        if (item.attempts >= 3) {
          await pg.query(`
            UPDATE webhook_processing_queue
            SET status = 'failed', last_error = $2
            WHERE id = $1
          `, [item.id, String(err)]);
        } else {
          // Reset to pending for retry
          await pg.query(`
            UPDATE webhook_processing_queue
            SET status = 'pending'
            WHERE id = $1
          `, [item.id]);
        }
        throw err;
      }
    },
  });
}
```

**Cleanup:** Add to existing `cleanup-events` cron:

```sql
-- Delete completed webhook queue entries older than 7 days
DELETE FROM webhook_processing_queue 
WHERE status = 'completed' 
  AND completed_at < NOW() - INTERVAL '7 days';

-- Keep failed entries 30 days for diagnosis
DELETE FROM webhook_processing_queue
WHERE status = 'failed'
  AND received_at < NOW() - INTERVAL '30 days';
```

### Vercel Cron Frequency

`process-webhook-queue` should run every 1 minute. Vercel Cron Pro supports this. Adds 1 to cron count (9 of 100 → 10 of 100 active + 1 legacy).

### Migration Strategy

Don't rip out existing inline processing immediately. Two-phase rollout:

**Phase A:** Build queue + processor. Wire webhooks to write to BOTH inline path AND queue (queue is no-op, just logs). Verify queue receives every webhook.

**Phase B:** Switch processor on, remove inline processing in next deploy. Now webhook handler only writes to queue.

**Phase C:** After 7 days of stable operation, drop the inline code entirely.

This avoids a "everything breaks at once" deployment.

### Acceptance Criteria

- [ ] Migration 0024 applied
- [ ] Webhook handler returns 200 in <100ms p95
- [ ] Queue table receives every webhook (verify against Shopify dashboard delivery counts)
- [ ] Processor cron runs successfully every minute
- [ ] Failed webhooks are marked status='failed' after 3 attempts with error logged
- [ ] Cleanup retention works
- [ ] Load test: simulate 100 webhooks in 10 seconds, verify all processed within 5 minutes
- [ ] Ops Runbook entry: "Webhook queue stuck/backed up recovery"

---

## Item 2: Supabase Pooler Verification (half day) 🔴

### The Risk

Supabase has two connection URLs:

- **Direct connection** (e.g., `db.PROJECT.supabase.co`): hard limit of 60 concurrent connections on Pro plan
- **Pooler** (e.g., `aws-0-REGION.pooler.supabase.com:6543`): handles thousands of concurrent connections via PgBouncer

If your code uses the direct connection URL, you'll hit the 60-connection limit at very low merchant counts. Every Vercel serverless function invocation can open a new connection. Multiple cron jobs + webhook handlers + dashboard requests + ML calls all compete.

### Implementation

**Step 1: Audit your env vars**

Check `process.env.DATABASE_URL` (or whatever you use):

- Direct format: `postgresql://...@db.PROJECT.supabase.co:5432/postgres`
- Pooler format: `postgresql://...@aws-0-REGION.pooler.supabase.com:6543/postgres`

The port (`5432` vs `6543`) is the giveaway.

**Step 2: Verify usage pattern**

Two pooler modes in Supavisor:

- **Transaction mode** (port 6543): For serverless. Each request gets a connection, returns to pool after transaction. NO prepared statements, NO session-level features.
- **Session mode** (port 5432 via pooler): For long-running connections. Supports prepared statements.

Vercel serverless functions need **transaction mode**. Verify your code doesn't use:
- `pg_prepare`
- `LISTEN/NOTIFY`
- Temporary tables (per-session)
- Advisory locks (use distributed locking instead)

**Step 3: Add observability**

```typescript
// lib/db/pool-monitor.ts
export async function getPoolHealth(pg: Client) {
  const result = await pg.query(`
    SELECT 
      count(*) as total_connections,
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle,
      count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  return result.rows[0];
}
```

Add to daily health check (Item 6).

### Common Bug to Check

Connections not being released. In your code, every `new Client()` should have a matching `await pg.end()` in a `finally` block:

```typescript
// BAD — connection leaks on error
const pg = new Client({ ... });
await pg.connect();
const result = await pg.query(...);  // if this throws, connection never released
await pg.end();

// GOOD — finally block guarantees release
const pg = new Client({ ... });
await pg.connect();
try {
  const result = await pg.query(...);
  return result;
} finally {
  await pg.end();
}
```

Audit every cron route + every server action for this pattern.

### Acceptance Criteria

- [ ] DATABASE_URL uses pooler (port 6543) in production env
- [ ] All cron routes verified to release connections in `finally` block
- [ ] All server actions verified to release connections
- [ ] No usage of session-mode features (prepared statements, LISTEN/NOTIFY, etc.)
- [ ] Pool health metric added to daily health check
- [ ] Ops Runbook entry: "Connection pool exhaustion recovery"

---

## Item 3: Critical Query Indexing Audit (1 day) 🟠

### The Risk

Without proper indexes, dashboard queries do sequential scans on `customers` (potentially 100K+ rows per merchant). At 50+ merchants, dashboard load time goes from <1s to 5-10s. Merchants notice. Some leave.

### Implementation

**Step 1: Run EXPLAIN ANALYZE on every common query**

```sql
-- Check the customers list page query
EXPLAIN ANALYZE SELECT * FROM customers 
WHERE merchant_id = '...' 
  AND lifecycle_stage = 'active'
ORDER BY predicted_clv DESC 
LIMIT 50;

-- Look for "Seq Scan" — that's the problem
-- Look for "Index Scan" with cost <100 — that's good
```

Run for every dashboard widget, customer detail page, segment filters, strategy audience queries.

**Step 2: Add the missing indexes**

```sql
-- Migration 0025: critical indexes audit

-- Customer queries (most common)
CREATE INDEX IF NOT EXISTS idx_customers_merchant_lifecycle 
  ON customers(merchant_id, lifecycle_stage);

CREATE INDEX IF NOT EXISTS idx_customers_merchant_value_tier 
  ON customers(merchant_id, value_tier);

CREATE INDEX IF NOT EXISTS idx_customers_merchant_churn 
  ON customers(merchant_id, churn_probability DESC) 
  WHERE churn_probability > 0.5;

CREATE INDEX IF NOT EXISTS idx_customers_merchant_clv 
  ON customers(merchant_id, predicted_clv DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_customers_marketing 
  ON customers(merchant_id, accepts_marketing, order_count) 
  WHERE accepts_marketing = TRUE;

-- Order queries
CREATE INDEX IF NOT EXISTS idx_orders_merchant_created 
  ON orders(merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_customer_created 
  ON orders(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_active 
  ON orders(merchant_id, created_at DESC)
  WHERE cancelled_at IS NULL AND financial_status IN ('paid', 'partially_refunded');

-- Strategy program queries
CREATE INDEX IF NOT EXISTS idx_strategy_programs_merchant 
  ON strategy_programs(merchant_id, status, created_at DESC);

-- Webhook events (for the new queue from Item 1)
-- Already covered in Item 1 migration

-- Health history
CREATE INDEX IF NOT EXISTS idx_health_history_customer 
  ON customer_health_history(customer_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_health_history_merchant_date 
  ON customer_health_history(merchant_id, snapshot_date DESC);

-- Cohort queries (might be redundant with Phase 4 indexes)
-- Verify before adding

-- Note attributes search (rare query, but if used)
CREATE INDEX IF NOT EXISTS idx_orders_note_attrs 
  ON orders USING GIN(note_attributes);

-- Tag arrays
-- Already covered in Tier 1.3
```

**Step 3: Add a query performance log**

For any query > 500ms, log it:

```typescript
// lib/db/query-with-monitoring.ts
export async function queryWithMonitoring(pg: Client, sql: string, params: any[]) {
  const start = Date.now();
  const result = await pg.query(sql, params);
  const duration = Date.now() - start;
  
  if (duration > 500) {
    console.warn(`[slow-query] ${duration}ms — ${sql.slice(0, 100)}...`);
  }
  
  return result;
}
```

Optional: Use this wrapper for high-traffic queries. Don't replace every query — adds overhead.

### Acceptance Criteria

- [ ] EXPLAIN ANALYZE run on top 10 most common queries, all show Index Scan
- [ ] Migration 0025 applied with all critical indexes
- [ ] Query performance logging added to dashboard widget queries
- [ ] No query taking >500ms on baseline test merchant
- [ ] Ops Runbook entry: "Slow query investigation procedure"

---

## Item 4: Strategy Regeneration Concurrent Limit (half day) 🟠

### The Risk

Strategy regeneration calls Claude 7 times (one per program template). Each call takes 5-15 seconds.

If 10 merchants click "Regenerate" simultaneously:
- 70 LLM calls in parallel
- Anthropic rate limits hit (your tier-1 limit is ~50 RPM)
- All 10 merchants see failures or extreme slowness
- Some calls fail entirely, leaving partial state

### Implementation

**Pattern: App-level semaphore + per-merchant lock**

```typescript
// lib/concurrency/limits.ts

class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];
  
  constructor(maxConcurrent: number) {
    this.permits = maxConcurrent;
  }
  
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise(resolve => this.waiting.push(resolve));
  }
  
  release(): void {
    if (this.waiting.length > 0) {
      this.waiting.shift()!();
    } else {
      this.permits++;
    }
  }
}

// Global limit: max 5 concurrent strategy generations across all merchants
export const strategyGenerationSemaphore = new Semaphore(5);
```

**Per-merchant DB-level lock (using Supabase advisory lock pattern):**

```typescript
// lib/concurrency/distributed-lock.ts

export async function tryAcquireLock(
  pg: Client, 
  resource: string, 
  ttlSeconds: number = 300
): Promise<boolean> {
  const result = await pg.query(`
    INSERT INTO concurrency_locks (resource, locked_at, expires_at)
    VALUES ($1, NOW(), NOW() + ($2 || ' seconds')::INTERVAL)
    ON CONFLICT (resource) DO UPDATE
    SET locked_at = EXCLUDED.locked_at,
        expires_at = EXCLUDED.expires_at
    WHERE concurrency_locks.expires_at < NOW()
    RETURNING (xmax = 0) as is_new_or_reclaimed
  `, [resource, ttlSeconds]);
  
  return result.rowCount > 0 && result.rows[0].is_new_or_reclaimed;
}

export async function releaseLock(pg: Client, resource: string): Promise<void> {
  await pg.query(`DELETE FROM concurrency_locks WHERE resource = $1`, [resource]);
}
```

**Schema:**

```sql
-- Migration 0026: concurrency locks
CREATE TABLE concurrency_locks (
  resource TEXT PRIMARY KEY,
  locked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_locks_expires ON concurrency_locks(expires_at);
```

**Usage in strategy regeneration:**

```typescript
export async function regenerateStrategy(merchantId: string) {
  const lockResource = `strategy-regen:${merchantId}`;
  
  if (!await tryAcquireLock(pg, lockResource, 300)) {
    throw new Error('Strategy generation already in progress for this merchant');
  }
  
  try {
    await strategyGenerationSemaphore.acquire();
    try {
      // Existing strategy generation logic
      await generateStrategiesForMerchant(merchantId);
    } finally {
      strategyGenerationSemaphore.release();
    }
  } finally {
    await releaseLock(pg, lockResource);
  }
}
```

**UI feedback:**

If lock is held, show: "Strategy generation already running. This typically takes 1-2 minutes." with a polling refresh.

### Acceptance Criteria

- [ ] Migration 0026 applied
- [ ] Semaphore limits concurrent generation to 5
- [ ] Per-merchant lock prevents duplicate clicks
- [ ] Lock TTL handles crashed-mid-generation case (5 min expiry)
- [ ] UI shows "in progress" state when lock held
- [ ] Test: simulate 20 simultaneous regenerations from different merchants, verify queueing works

---

## Item 8: Database Backup Verification (1 hour) 🟠

### The Risk

Supabase Pro includes daily backups (7-day retention) and Point-in-Time Recovery (PITR). But:
- Are PITR features enabled?
- Have you ever tested restore?
- Do you know the recovery time objective (RTO)?

You're about to onboard merchants who trust you with their customer data. A data loss incident in week 1 destroys the business.

### Implementation

**Step 1: Verify backup configuration**

In Supabase dashboard:
- Database → Backups: confirm daily backups enabled
- Database → PITR: confirm Point-in-Time Recovery enabled (Pro feature)
- Note retention period

**Step 2: Document recovery procedures**

Create `docs/disaster-recovery.md`:

```markdown
# Disaster Recovery Runbook

## Scenarios

### Single merchant data corruption
1. Identify the corruption window (when did it start)
2. Use Supabase PITR to restore to a moment before
3. Export the merchant's tables from restore
4. Re-import to production

RTO: 30 minutes

### Full database loss
1. Restore latest daily backup
2. Re-run any migrations applied since backup
3. Notify merchants of data loss window

RTO: 2-4 hours
RPO: Last daily backup (up to 24 hours)

## Test Schedule

- [ ] Monthly: verify daily backup completed (check Supabase dashboard)
- [ ] Quarterly: test PITR restore to staging
- [ ] Pre-launch: full restore drill
```

**Step 3: Add backup health check to daily health check job (Item 6)**

```typescript
// Verify latest backup exists and is recent
const backupAge = await getLatestBackupAge();
if (backupAge > 25 * 60 * 60 * 1000) { // 25 hours
  console.error('[health-check] Backup is stale');
}
```

### Acceptance Criteria

- [ ] PITR verified enabled in Supabase dashboard
- [ ] Daily backup verified running
- [ ] disaster-recovery.md created
- [ ] Pre-launch restore drill completed
- [ ] Health check verifies backup recency

---

# SHOULD-SHIP ITEMS (before paying merchants)

## Item 5: LLM Cost Monitoring Per Merchant (half day) 🟡

### The Risk

Your project status says you log USD per LLM call. But aggregating per-merchant per-day per-model isn't done.

At scale:
- 100 merchants × $1/month average = $100/month
- One runaway merchant burning $50/month eats your margin
- You won't notice until quarterly review

### Implementation

**Schema:**

```sql
-- Migration 0027: LLM usage daily aggregation
CREATE TABLE merchant_llm_usage_daily (
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  model TEXT NOT NULL,                       -- 'claude-opus-4-7', 'claude-sonnet-4-6', etc.
  call_count INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  
  PRIMARY KEY (merchant_id, date, model)
);

CREATE INDEX idx_llm_usage_merchant_date 
  ON merchant_llm_usage_daily(merchant_id, date DESC);
```

**Aggregation:**

Daily cron job aggregates from your existing `llm_calls` table (or whatever you use) into the daily rollup.

**Alerting thresholds:**

- Per-merchant per-day > $5: log warning
- Per-merchant per-day > $20: alert
- Total platform per-day > 10% of MRR: alert

**Dashboard widget (admin only):**

"Top 10 LLM-cost merchants this month" with breakdown by model.

### Acceptance Criteria

- [ ] Migration applied
- [ ] Daily aggregation cron runs (10 of 100 cron slots, but maybe combine with cleanup-events)
- [ ] Admin dashboard widget showing per-merchant LLM cost
- [ ] Alerts fire at thresholds

---

## Item 6: Daily Health Check Job (half day) 🟡

### The Risk

Cron jobs fail silently. Webhook queue gets backed up. Stuck backfills accumulate. You don't notice until merchants complain.

### Implementation

**Cron at 8am UTC daily:**

```typescript
// app/api/cron/daily-health-check/route.ts

export async function GET(req: NextRequest) {
  const checks = {
    // Cron jobs ran successfully
    daily_metrics_ran: await checkLastSuccessfulRun('compute-daily-metrics', 26),
    cohort_metrics_ran: await checkLastSuccessfulRun('compute-cohort-metrics', 26),
    
    // Queue health
    webhook_queue_depth: await getWebhookQueueDepth(),
    webhook_queue_failed: await getWebhookFailedCount(),
    
    // Stuck backfills
    stuck_backfills: await countStuckBackfills(),
    
    // Stuck cron runs
    stuck_cron_runs: await countStuckCronRuns(),
    
    // DB pool health
    db_connections: await getPoolHealth(pg),
    
    // Backup recency
    backup_age_hours: await getBackupAgeHours(),
    
    // ML service health
    ml_service_responsive: await pingMLService(),
    
    // LLM cost trajectory
    llm_cost_today: await getLLMCostToday(),
    llm_cost_alert_merchants: await getMerchantsExceedingDailyThreshold(),
    
    // Stale data merchants
    merchants_stale_sync: await countMerchantsWithoutRecentSync(),
  };
  
  // Identify failures
  const failures = identifyFailures(checks);
  
  if (failures.length > 0) {
    await sendHealthCheckAlert(failures);
  }
  
  return NextResponse.json({ checks, failures, status: failures.length === 0 ? 'healthy' : 'unhealthy' });
}
```

**Alert via:**

Email to your support address. Or Slack webhook if configured. Or just `console.error` to Vercel logs (cheapest, you check daily anyway).

**Add to cron count:** 11 of 100.

### Acceptance Criteria

- [ ] Cron runs daily at 8am UTC
- [ ] All 11 health checks return data
- [ ] Failures trigger alerts
- [ ] Ops Runbook entry: "Daily health check failures triage"

---

## Item 7: Sentry Setup (1 hour) 🟡

### The Risk

Production errors are invisible. console.error goes to Vercel logs but you don't grep them daily. A single critical error in webhook processing could go unnoticed for days.

### Implementation

**Step 1: Sign up for Sentry free tier**

5,000 errors/month free. Plenty for your scale.

**Step 2: Install**

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

The wizard configures everything.

**Step 3: Wire into critical paths**

The wizard auto-instruments most things. Add explicit captures in:

- Webhook processor errors
- LLM call failures
- ML service connection failures
- Cron job catch blocks
- Strategy generation failures

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  await someOperation();
} catch (err) {
  Sentry.captureException(err, {
    tags: { 
      operation: 'webhook_processing', 
      merchant_id: merchantId 
    },
    extra: { topic, payload: payloadSize },
  });
  throw err;
}
```

**Step 4: Configure alerting**

In Sentry dashboard:
- Email alert for new error types
- Email alert for error rate >10/hour
- Daily digest of all errors

### Acceptance Criteria

- [ ] Sentry installed and configured
- [ ] Test error captured (manually throw + verify it appears in Sentry)
- [ ] Alert rules configured
- [ ] Critical paths have explicit `captureException` calls
- [ ] Production deploy includes Sentry initialization

---

## Item 9: Webhook Signature Replay Protection (half day) 🟡

### The Risk

Shopify webhooks include HMAC signature for authenticity. But signatures are valid forever — an attacker who captures one webhook can replay it.

Realistic attack vector: someone gets access to your webhook endpoint logs (e.g., Vercel logs leak), captures a `customers/update` webhook, replays it with modified payload, your HMAC verification passes (they have the original signature) but they've changed the data.

### Implementation

**Step 1: Add timestamp validation**

Shopify includes `X-Shopify-Triggered-At` timestamp. Reject webhooks older than 5 minutes:

```typescript
const triggeredAt = headers.get('x-shopify-triggered-at');
const ageMs = Date.now() - new Date(triggeredAt).getTime();
if (ageMs > 5 * 60 * 1000) {
  return new Response('Webhook too old', { status: 401 });
}
```

**Step 2: Add nonce tracking**

Use the `X-Shopify-Webhook-Id` header (already used for dedupe in Item 1). If it's been seen before, reject:

```sql
-- Already in webhook_processing_queue from Item 1
-- The UNIQUE(shop_domain, topic, shopify_webhook_id) constraint provides this
```

The unique constraint from Item 1 already provides replay protection. Just need to verify it's enforced before HMAC validation passes.

**Step 3: Document the threat model**

Add to disaster recovery runbook:
- Suspected webhook replay attack: how to identify, how to respond.

### Acceptance Criteria

- [ ] Timestamp validation in webhook handler
- [ ] Webhook ID dedup constraint enforced (Item 1 covers this)
- [ ] Threat model documented in disaster-recovery.md

---

## Item 10: Rate Limiting on Public Endpoints (half day) 🟡

### The Risk

Auth/signup endpoints are publicly accessible. Without rate limiting:
- Brute force on login attempts
- Mass signup spam (fake merchants)
- Password reset abuse
- Account enumeration via signup error messages

### Implementation

**Use Upstash Redis (already in your "pre-built scaling tools" list):**

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const authRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),  // 5 attempts per minute per IP
  prefix: 'rl:auth',
});

export const signupRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),  // 3 signups per hour per IP
  prefix: 'rl:signup',
});

export const passwordResetRateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  prefix: 'rl:reset',
});
```

**Apply in route handlers:**

```typescript
// app/api/auth/signin/route.ts
export async function POST(req: NextRequest) {
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'anonymous';
  const { success } = await authRateLimiter.limit(ip);
  
  if (!success) {
    return new Response('Too many attempts', { status: 429 });
  }
  
  // existing auth logic
}
```

### Acceptance Criteria

- [ ] Upstash Redis connected
- [ ] Rate limiters on /signin, /signup, /forgot-password
- [ ] 429 responses include Retry-After header
- [ ] Rate limits don't block legitimate users (test with realistic flow)
- [ ] Dashboard endpoints exempted (authenticated users have different abuse vectors)

---

# NICE TO HAVE

## Item 11: Pre-Built Scaling Tools Setup (1 hour) 🟢

### What it is

Sign up for tools you don't need yet but will need eventually. Get them wired in so the migration when you need them is 1 day instead of 3.

### Tools to set up

**1. Upstash Redis (free tier)**
- Already needed for Item 10 rate limiting
- Connection string in env vars
- Don't actively use beyond rate limiting until needed

**2. Inngest (free tier — 50K events/month)**
- For when cron-based queue isn't enough
- Just sign up, install SDK, don't migrate yet
- When you hit 200+ merchants, migrate cron-based queue to Inngest in 2-3 days instead of 1 week

**3. Railway autoscaling**
- Verify ML service has horizontal scaling enabled
- Set min=1, max=3 instances
- Doesn't cost more (only scales when needed)

### Acceptance Criteria

- [ ] Upstash account created, Redis URL in env vars
- [ ] Inngest account created, SDK installed (not used yet)
- [ ] Railway autoscaling configured for ML service

---

## Item 12: Documented Escape Hatch Runbooks (half day) 🟡

### What it is

Six emergency runbooks for likely failure modes. Already have some entries from v1.5 work. Round out the set.

### Runbooks to write

Add to `docs/PROJECT-STATUS.md` Ops Runbook section:

**1. Webhook overflow plan**
- Symptom: webhook_processing_queue depth > 10K pending
- Action: pause non-critical webhook processing, scale workers, identify offending merchant

**2. ML service overload**
- Symptom: ML service response time p95 > 30 seconds OR error rate > 5%
- Action: disable real-time ML scoring, fall back to nightly batch, scale Railway

**3. Database connection saturation**
- Symptom: Supabase connections > 80% of pool
- Action: verify pooler usage, check for connection leaks, reduce concurrent crons temporarily

**4. LLM cost explosion**
- Symptom: daily LLM spend > $50 OR per-merchant > $10/day
- Action: identify offending merchant, enable caching, switch tier from Sonnet to Haiku

**5. Dashboard slow under load**
- Symptom: p95 dashboard load > 5 seconds
- Action: check slow query log, add missing indexes, cache aggregate queries

**6. Shopify rate limits hit**
- Symptom: 429 responses from Shopify Admin API
- Action: verify rate limit respect, add request queue per shop, throttle backfills

Each runbook: 5-10 lines max. Symptom + action steps.

### Acceptance Criteria

- [ ] All 6 runbooks added to PROJECT-STATUS.md Ops Runbook section
- [ ] Each has clear symptom + action steps
- [ ] Cross-referenced with related health checks

---

# Implementation Sequence

## Pre-launch Critical Path (3-5 days)

**Day 1-2: Async webhook processing (Item 1)**
- Migration + queue table
- Webhook handler refactor
- Background processor cron
- Phased rollout (dual-write → switch → cleanup)

**Day 3 morning: Pooler verification + connection audit (Item 2)**
- Verify DATABASE_URL
- Audit connection release patterns
- Add pool health monitoring

**Day 3 afternoon: Indexing audit (Item 3)**
- EXPLAIN ANALYZE common queries
- Add missing indexes
- Verify dashboard load times

**Day 4 morning: Strategy concurrency limit (Item 4)**
- Migration for concurrency_locks
- Semaphore + per-merchant lock
- UI feedback for in-progress state

**Day 4 afternoon: Backup verification (Item 8)**
- Confirm PITR enabled
- Test restore to staging
- Document procedures

## Pre-launch Should-Ship (2-3 days)

**Day 5 morning: LLM cost monitoring (Item 5)**
- Aggregation table + cron
- Admin dashboard widget
- Alert thresholds

**Day 5 afternoon: Daily health check (Item 6)**
- Health check cron
- Alert mechanism
- Ops Runbook entries

**Day 6 morning: Sentry (Item 7)**
- Sign up + install
- Wire into critical paths
- Configure alerts

**Day 6 afternoon: Webhook replay protection (Item 9) + Rate limiting (Item 10)**
- Timestamp validation
- Upstash rate limiters
- Apply to public endpoints

## Final polish (1 hour)

**Item 11: Pre-built scaling tools** — sign up, no integration yet
**Item 12: Documented runbooks** — round out Ops Runbook

---

# Total Effort

| Tier | Items | Effort |
|---|---|---|
| Critical path | 1, 2, 3, 4, 8 | 4-5 days |
| Should ship | 5, 6, 7, 9, 10 | 2-3 days |
| Nice to have | 11, 12 | 1.5 hours |
| **Total** | **12 items** | **6.5-8 days** |

---

# Cron Count After All Items

Currently 8 active + 1 legacy. After this spec:
- +1: process-webhook-queue (every 1 min)
- +1: daily-health-check (8am UTC)
- +1 (optional): aggregate-llm-usage (or merge into existing)

**Final count: 10-11 active + 1 legacy. Comfortable headroom (89+ slots remaining).**

---

# What This Achieves

After all 12 items:

✅ **100 paying merchants steady-state** without intervention
✅ **Single merchant Black Friday surge** handled cleanly via async webhooks
✅ **Concurrent strategy generations** don't hit LLM rate limits
✅ **Database connection pressure** handled by pooler + leak audit
✅ **Slow dashboard queries** caught before merchants notice
✅ **Cost explosions** caught before they eat margin
✅ **ML service issues** caught by daily health check
✅ **Production errors** visible in Sentry
✅ **Webhook replay attacks** prevented
✅ **Public endpoint abuse** rate-limited
✅ **Disaster recovery** documented and tested
✅ **Emergency runbooks** ready for every likely failure

You also have:
- Clear runbooks for every scaling problem before you hit it
- Pre-wired tools (Redis, queue, autoscaling) ready to activate
- Daily health check telling you what's wrong each morning
- Cost visibility per-merchant per-day

---

# What This Does NOT Cover (Out of Scope)

- **Shopify GDPR webhooks** (`shop/redact`, `customers/redact`, `customers/data_request`) — required by Shopify App Store. Build separately if not done.
- **XSS sanitization** — review user-generated content rendering. Build separately.
- **Transactional email templates** — separate work for production readiness.
- **Multi-region failover** — premature optimization until you have $100K+ MRR.
- **Read replicas** — premature until you have 1000+ merchants.
- **Actual SOC 2 / security audit** — premature until enterprise customers ask.

These are real concerns for later, not for solo founder pre-PMF.

---

# Hand to Claude Code

## For critical path (Items 1, 2, 3, 4, 8):

> Implement pre-launch scale hardening critical path per the spec below. Build in order: Item 1 (async webhooks) first since it's the largest and highest-risk. Each item: stop and report after completion with screenshot/log of acceptance test passing. Do not proceed to next item without my approval.
>
> All locked principles apply (RLS pattern, theme tokens, Vercel Cron, migration-friendly structure). All multi-merchant work uses chunked-cron pattern from Phase 8.

## For should-ship (Items 5-7, 9, 10):

Same prefix, items 5-10 in any order.

## For nice-to-have:

Just hand it. Items 11-12 are documentation + signups.

---

# When to Build

**Recommended sequence:**

1. **Now / before Days 17-18:** Build critical path (Items 1, 2, 3, 4, 8) — 4-5 days
2. **Days 17-18:** Shopify Billing API (locked MVP path)
3. **Day 19 part 1:** Production deploy
4. **Day 19 part 2:** Should-ship hardening (Items 5-7, 9, 10) — 2-3 days
5. **Day 20:** App Store assets
6. **Day 21:** Friend's-store live test + submit
7. **During App Store review (4-8 weeks):** Items 11-12 + Tier 1 data captures

This puts critical scale hardening BEFORE your first paying merchant, while letting non-critical hardening overlap with App Store review.

---

# Honest Note

You don't have to build all 12 items. The critical path (5 items, 4-5 days) is the minimum to safely onboard 100 merchants. Should-ship items make you sleep better. Nice-to-have can wait.

If time is tight, ship just the critical path and defer the rest. But know: every item not shipped is a known risk that will eventually bite you. Items 1 (async webhooks) and 8 (backups) are the two I would never skip.

If something here conflicts with what's already been built or shipped, surface it before changing existing code. Don't assume the spec is complete.
