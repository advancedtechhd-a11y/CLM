# Data Capture Roadmap — Tier 1 / Tier 2 / Tier 3

**Purpose:** Comprehensive spec for capturing data points that LifecycleAI is currently missing. Organized into 3 tiers based on effort and dependencies.

**Build sequence:**
- **Tier 1:** Build now (pre-launch or during App Store review window) — Shopify data only, no external integrations
- **Tier 2:** Build post-launch (months 1-3 with paying merchants) — Still Shopify only, more complex
- **Tier 3:** Build with first integrations (months 3+) — All third-party app integrations consolidated

**Status:** Spec only. Hand to Claude Code one tier at a time. Tier 1 is implementation-ready. Tiers 2-3 are scoped for future builds.

---

## Locked principles (apply to all tiers)

1. **All new tables use the locked RLS pattern:** `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`
2. **All scheduled jobs use Vercel Cron** (NOT Inngest)
3. **Use shadcn theme tokens** (`bg-card`, `border-border`) NOT hex codes
4. **Migration-friendly job structure:** business logic in `lib/` modules, cron routes are thin wrappers
5. **Defense-in-depth on RLS:** server actions verify `merchant_id` even though RLS scopes it
6. **GDPR-safe data isolation:** denormalize necessary fields at capture time, never JOIN on render
7. **Backfill discipline:** new data captures need backfill scripts for existing customers/orders

---

# TIER 1 — Pre-Launch Data Captures (Shopify Only)

**Goal:** Capture data Shopify already sends you via webhooks/sync, but that you're not currently parsing or surfacing.

**Total effort:** ~5-6 days

**When to build:** Pre-launch if time permits, or during the 4-8 week App Store review window.

**Dependencies:** None. All data is in Shopify webhooks/Admin API responses you already receive.

---

## 1.1 Newsletter Signup Intelligence (1-2 days) ⭐ PRIORITY

### What it captures

Customers who consented to marketing but never bought. Surfaces the opportunity to convert subscribers into customers.

### Schema changes

No new columns needed — `customers.accepts_marketing` already exists from Shopify sync.

Add a new aggregation column:

```sql
-- Migration: add_marketing_consent_metadata
ALTER TABLE customers
  ADD COLUMN accepts_marketing_updated_at TIMESTAMPTZ,
  ADD COLUMN marketing_opt_in_level TEXT,        -- 'single_opt_in', 'confirmed_opt_in', 'unknown'
  ADD COLUMN sms_marketing_consent_state TEXT,   -- 'subscribed', 'not_subscribed', 'pending', 'redacted', 'unsubscribed'
  ADD COLUMN sms_marketing_consent_updated_at TIMESTAMPTZ;
```

### Sync handler changes

Update Shopify customer webhook + sync handlers to extract:

```typescript
// In customer upsert
const marketingData = {
  accepts_marketing: shopifyCustomer.email_marketing_consent?.state === 'subscribed',
  accepts_marketing_updated_at: shopifyCustomer.email_marketing_consent?.consent_updated_at,
  marketing_opt_in_level: shopifyCustomer.email_marketing_consent?.opt_in_level,
  sms_marketing_consent_state: shopifyCustomer.sms_marketing_consent?.state,
  sms_marketing_consent_updated_at: shopifyCustomer.sms_marketing_consent?.consent_updated_at,
};
```

### New strategy program template

Add 8th program template alongside existing 7:

```typescript
// lib/strategy/templates/first-purchase-conversion.ts
export const firstPurchaseConversion: StrategyProgramTemplate = {
  id: 'first_purchase_conversion',
  name: 'First-Purchase Conversion',
  description: 'Convert email subscribers who haven\'t bought yet',
  framework: 'acquisition',  // new framework type alongside engagement/recovery/save/winback
  
  audienceQuery: `
    SELECT * FROM customers 
    WHERE merchant_id = $1
      AND accepts_marketing = true
      AND order_count = 0
      AND accepts_marketing_updated_at > NOW() - INTERVAL '90 days'
    ORDER BY accepts_marketing_updated_at DESC
  `,
  
  estimatedConversionRate: 0.02,  // 2% baseline for cold subscribers
  
  llmPromptContext: {
    customerType: 'email_subscriber_no_purchase',
    tone: 'welcome',
    offer: 'first_purchase_discount',
    urgency: 'low',
  },
};
```

### New widget: Newsletter Opportunity

```typescript
// components/dashboard/widgets/NewsletterOpportunity.tsx
// Surfaces:
// - Total subscribers without orders
// - Recent subscribers (last 30 days)
// - Estimated revenue opportunity (subscribers × 2% conversion × AOV)
// - "Generate first-purchase campaign" CTA → triggers existing strategy generator
```

Register widget in `lib/widgets/configs.ts` with category 'customers'.

### Server action

```typescript
// app/actions/widget-data.ts
export async function fetchNewsletterOpportunity() {
  // Returns:
  // - subscriber_count: customers with accepts_marketing=true AND order_count=0
  // - recent_signups: same, last 30 days
  // - estimated_revenue: subscriber_count * 0.02 * merchant_avg_aov
  // - top_signup_sources: from referring_site if available
}
```

### Acceptance criteria

- [ ] Migration applied
- [ ] Sync handler captures all 5 marketing consent fields
- [ ] Backfill script populates existing customers from Shopify Admin API
- [ ] Newsletter Opportunity widget renders with real data
- [ ] First-Purchase Conversion strategy template generates copy when triggered
- [ ] Widget click → existing strategy generator with audience pre-filtered
- [ ] All theme tokens used

---

## 1.2 Refund-Adjusted CLV (1 day)

### What it fixes

Current CLV = sum of order totals. A customer with $5K spent + $2K refunded shows as $5K but is actually worth $3K. This overstates value tier accuracy across every existing metric.

### Schema changes

```sql
-- Migration: add_refund_tracking
ALTER TABLE customers
  ADD COLUMN total_refunded NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN refund_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN refund_rate NUMERIC(5,4) NOT NULL DEFAULT 0,  -- refunds/orders ratio
  ADD COLUMN net_lifetime_value NUMERIC(12,2);             -- total_spent - total_refunded

ALTER TABLE orders
  ADD COLUMN total_refunded NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN refund_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_refunded_at TIMESTAMPTZ;

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  shopify_refund_id TEXT NOT NULL,
  shopify_order_id TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT,
  reason TEXT,                       -- from refund.note or empty
  restock BOOLEAN,
  refund_line_items JSONB,           -- which products were refunded
  processed_at TIMESTAMPTZ NOT NULL,
  raw_payload JSONB,
  
  UNIQUE(merchant_id, shopify_refund_id)
);

CREATE INDEX idx_refunds_merchant_processed ON refunds(merchant_id, processed_at DESC);
CREATE INDEX idx_refunds_customer ON refunds(customer_id);

ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their merchant's refunds"
  ON refunds FOR SELECT
  USING (merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid()));
```

### Webhook handler

Add `refunds/create` to your Shopify webhook subscription list.

```typescript
// app/api/webhooks/shopify/[...topic]/route.ts
case 'refunds/create': {
  const refund = payload;
  
  // 1. Insert refund record
  await pg.query(`
    INSERT INTO refunds (...)
    VALUES (...)
    ON CONFLICT (merchant_id, shopify_refund_id) DO NOTHING
  `, [...]);
  
  // 2. Update order's refund tracking
  await pg.query(`
    UPDATE orders
    SET total_refunded = total_refunded + $1,
        refund_count = refund_count + 1,
        last_refunded_at = $2
    WHERE merchant_id = $3 AND shopify_order_id = $4
  `, [refundAmount, refundedAt, merchantId, refund.order_id]);
  
  // 3. Update customer aggregates
  await pg.query(`
    UPDATE customers
    SET total_refunded = total_refunded + $1,
        refund_count = refund_count + 1,
        refund_rate = (refund_count + 1)::FLOAT / NULLIF(order_count, 0),
        net_lifetime_value = total_spent - (total_refunded + $1)
    WHERE id = (SELECT customer_id FROM orders WHERE shopify_order_id = $2 AND merchant_id = $3)
  `, [refundAmount, refund.order_id, merchantId]);
  
  // 4. Emit event
  await emitEvent(pg, {
    merchantId,
    eventType: 'refund.created',
    entityType: 'refund',
    entityId: refundId,
    payload: {
      customer_name: ..., amount: ..., reason: ...,
    },
  });
  break;
}
```

### CLV recalculation

Update the existing CLV computation in your rules engine and ML service to use `net_lifetime_value` instead of `total_spent`.

```typescript
// lib/rules/customer-metrics.ts
// Replace: customer.total_spent
// With: customer.net_lifetime_value (or fallback to total_spent if null for not-yet-backfilled)
```

ML service (Python) — update CLV input to subtract refund amount.

### Backfill script

```typescript
// scripts/backfill-refunds.ts
// For each existing merchant:
//   GET /admin/api/2026-01/orders/{order_id}/refunds.json for each order
//   INSERT into refunds table
//   Update orders + customers aggregates
// Rate limit: 2 calls/sec
// Idempotent: ON CONFLICT DO NOTHING on refunds, recalc aggregates from sum
```

### New "Serial Returner" segment

Add to dashboard as a segment:
- Customers with `refund_rate > 0.30` AND `order_count >= 3`
- Surface as opportunity card: "X customers have >30% return rate. They're costing you $Y/year. Consider excluding from acquisition campaigns."

### Acceptance criteria

- [ ] Migration applied
- [ ] `refunds/create` webhook subscribed and handler tested
- [ ] Backfill script populates refunds for existing orders
- [ ] CLV calculations updated to use net_lifetime_value
- [ ] Value tier classifications recompute after backfill
- [ ] Serial Returner segment available in customer filters
- [ ] Refund opportunity card surfaces in dashboard

---

## 1.3 Customer Tags + Order Tags + Notes (half day)

### What it captures

Free human-curated segmentation. Merchants tag customers ("VIP", "wholesale", "press_contact") and orders. They write notes. You don't read any of it.

### Schema changes

```sql
-- Migration: add_tags_and_notes
ALTER TABLE customers
  ADD COLUMN tags TEXT[],
  ADD COLUMN merchant_note TEXT;       -- the customer.note field from Shopify

ALTER TABLE orders
  ADD COLUMN tags TEXT[],
  ADD COLUMN merchant_note TEXT,       -- the order.note field
  ADD COLUMN note_attributes JSONB;    -- custom fields from checkout

CREATE INDEX idx_customers_tags ON customers USING GIN(tags);
CREATE INDEX idx_orders_tags ON orders USING GIN(tags);
```

### Sync handler

```typescript
// In customer upsert
const tagsArray = (shopifyCustomer.tags || '').split(',').map(t => t.trim()).filter(Boolean);

const customerData = {
  // ... existing fields
  tags: tagsArray,
  merchant_note: shopifyCustomer.note,
};

// In order upsert
const orderTagsArray = (shopifyOrder.tags || '').split(',').map(t => t.trim()).filter(Boolean);

const orderData = {
  // ... existing fields
  tags: orderTagsArray,
  merchant_note: shopifyOrder.note,
  note_attributes: shopifyOrder.note_attributes || [],
};
```

### Surface in UI

- Customer detail page: show tags as pills, note as quoted text section
- Customer filter: filter by tag (existing customers list page)
- Segment builder: tag-based segments ("All customers tagged 'VIP'")
- Note attributes: show as key-value pairs on order detail (when customer detail page exists)

### Backfill

Use existing customer/order sync — re-sync from Shopify Admin API to populate. No new script needed if existing sync re-runs cleanly.

### Acceptance criteria

- [ ] Migration applied
- [ ] Sync handler captures tags + notes for both customers and orders
- [ ] Tags render as pills on customer detail page
- [ ] Tag-based filter works on customers list
- [ ] Note attributes JSONB stored and queryable

---

## 1.4 Channel Attribution (half day)

### What it captures

Where each customer came from. Instagram-acquired vs Google-acquired vs direct vs email behave differently.

### Schema changes

```sql
-- Migration: add_channel_attribution
ALTER TABLE orders
  ADD COLUMN referring_site TEXT,
  ADD COLUMN landing_site TEXT,
  ADD COLUMN source_name TEXT,
  ADD COLUMN utm_source TEXT,        -- extracted from landing_site or note_attributes
  ADD COLUMN utm_medium TEXT,
  ADD COLUMN utm_campaign TEXT;

ALTER TABLE customers
  ADD COLUMN first_order_source TEXT,        -- attribution of first order
  ADD COLUMN first_order_utm_source TEXT,
  ADD COLUMN first_order_utm_medium TEXT,
  ADD COLUMN first_order_utm_campaign TEXT,
  ADD COLUMN acquisition_channel TEXT;       -- normalized: 'organic', 'paid_social', 'paid_search', 'email', 'direct', 'referral'
```

### Sync handler + URL parser

```typescript
// lib/orders/extract-attribution.ts
export function extractAttribution(order: ShopifyOrder) {
  const referring = order.referring_site;
  const landing = order.landing_site;
  
  // Parse UTM from landing_site URL params
  const utm = parseUTMFromURL(landing);
  
  // Fallback: check note_attributes for UTM keys
  const fromNoteAttrs = order.note_attributes?.reduce((acc, attr) => {
    if (attr.name?.startsWith('utm_')) acc[attr.name] = attr.value;
    return acc;
  }, {});
  
  // Normalize to canonical channel
  const channel = normalizeChannel(utm, referring);
  
  return {
    referring_site: referring,
    landing_site: landing,
    source_name: order.source_name,  // Shopify's classification: 'web', 'pos', 'shopify_draft_order', etc.
    utm_source: utm.source || fromNoteAttrs?.utm_source,
    utm_medium: utm.medium || fromNoteAttrs?.utm_medium,
    utm_campaign: utm.campaign || fromNoteAttrs?.utm_campaign,
    acquisition_channel: channel,
  };
}

function normalizeChannel(utm, referringSite): string {
  if (utm.medium === 'email') return 'email';
  if (utm.medium === 'cpc' || utm.medium === 'paid') {
    if (utm.source === 'google') return 'paid_search';
    if (['facebook', 'instagram', 'tiktok'].includes(utm.source)) return 'paid_social';
    return 'paid_other';
  }
  if (referringSite) {
    if (referringSite.includes('google')) return 'organic_search';
    if (referringSite.includes('facebook') || referringSite.includes('instagram')) return 'organic_social';
    return 'referral';
  }
  return 'direct';
}
```

### First-order attribution

When a customer's first order comes in, copy attribution to customer record. Don't update on subsequent orders — first-touch attribution is the meaningful signal.

```typescript
if (shopifyCustomer.orders_count === 1) {
  await pg.query(`
    UPDATE customers
    SET first_order_source = $1,
        first_order_utm_source = $2,
        first_order_utm_medium = $3,
        first_order_utm_campaign = $4,
        acquisition_channel = $5
    WHERE id = $6
  `, [...]);
}
```

### Acceptance criteria

- [ ] Migration applied
- [ ] Order sync extracts and normalizes attribution
- [ ] First-order attribution copied to customer record
- [ ] Customers list filterable by acquisition_channel
- [ ] Future: acquisition quality dashboard (LTV by channel)

---

## 1.5 Order Risk Score (half day)

### What it captures

Shopify provides fraud risk scoring on every order. High-risk customers behave fundamentally differently.

### Schema changes

```sql
-- Migration: add_order_risk
ALTER TABLE orders
  ADD COLUMN risk_level TEXT,           -- 'low', 'medium', 'high'
  ADD COLUMN risk_recommendations JSONB;

ALTER TABLE customers
  ADD COLUMN high_risk_order_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN risk_flag BOOLEAN NOT NULL DEFAULT false;
```

### Sync handler

```typescript
// In order upsert
const orderData = {
  // ... existing fields
  risk_level: order.risks?.[0]?.recommendation,  // 'investigate', 'cancel', 'accept'
  risk_recommendations: order.risks || [],
};

// Update customer aggregate
if (orderData.risk_level === 'investigate' || orderData.risk_level === 'cancel') {
  await pg.query(`
    UPDATE customers
    SET high_risk_order_count = high_risk_order_count + 1,
        risk_flag = (high_risk_order_count + 1 >= 2)  -- flag after 2+ high-risk orders
    WHERE id = $1
  `, [customerId]);
}
```

### Surface in UI

- Customer detail page: risk flag badge
- Customer filter: exclude/include risky customers
- Strategy generation: don't include risk-flagged customers in retention campaigns (they're potential fraud)

### Acceptance criteria

- [ ] Migration applied
- [ ] Order sync captures risk data
- [ ] Risk flag computed on customer level
- [ ] Risk-flagged customers visually marked in UI
- [ ] Strategy generation excludes risk_flag customers from retention programs

---

## 1.6 Gift Purchase Flagging (half day)

### What it captures

Orders where shipping ≠ billing address are likely gifts. Gift recipients have different LTV patterns — often they're not repeat buyers.

### Schema changes

```sql
-- Migration: add_gift_flagging
ALTER TABLE orders
  ADD COLUMN is_likely_gift BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN gift_indicators JSONB;          -- {address_mismatch: true, gift_message: "...", note_attributes_gift: true}

ALTER TABLE customers
  ADD COLUMN gift_recipient_count INTEGER NOT NULL DEFAULT 0,    -- orders where this customer was the recipient
  ADD COLUMN gift_purchaser_count INTEGER NOT NULL DEFAULT 0,    -- orders where they sent gifts
  ADD COLUMN customer_type TEXT;                                  -- 'self_purchaser', 'gift_buyer', 'mixed', 'gift_recipient_only'
```

### Detection logic

```typescript
// lib/orders/detect-gift.ts
export function detectGift(order: ShopifyOrder): { isLikelyGift: boolean; indicators: object } {
  const indicators: any = {};
  
  // Indicator 1: shipping address differs from billing address (different recipient)
  if (order.shipping_address && order.billing_address) {
    const addressMismatch = 
      order.shipping_address.first_name !== order.billing_address.first_name ||
      order.shipping_address.last_name !== order.billing_address.last_name;
    if (addressMismatch) indicators.address_mismatch = true;
  }
  
  // Indicator 2: gift message in note_attributes
  const giftMessage = order.note_attributes?.find(a => 
    /gift.*message|message.*gift|gift.*note/i.test(a.name || '')
  );
  if (giftMessage) indicators.gift_message = giftMessage.value;
  
  // Indicator 3: explicit gift flag in note_attributes
  const giftFlag = order.note_attributes?.find(a => 
    /^(is_gift|gift|gift_order)$/i.test(a.name || '') && a.value?.toLowerCase() === 'true'
  );
  if (giftFlag) indicators.explicit_gift_flag = true;
  
  // Indicator 4: gift wrapping line item
  const hasGiftWrap = order.line_items?.some(item => 
    /gift.*wrap|gift.*box/i.test(item.title || '')
  );
  if (hasGiftWrap) indicators.gift_wrap_purchased = true;
  
  // Need 1+ indicator to flag
  const isLikelyGift = Object.keys(indicators).length > 0;
  
  return { isLikelyGift, indicators };
}
```

### Customer type classification

After gift detection on an order, update the purchaser's customer record:

```typescript
if (isLikelyGift) {
  await pg.query(`
    UPDATE customers
    SET gift_purchaser_count = gift_purchaser_count + 1,
        customer_type = CASE
          WHEN gift_purchaser_count + 1 >= order_count THEN 'gift_buyer'
          WHEN gift_purchaser_count + 1 > 0 THEN 'mixed'
          ELSE customer_type
        END
    WHERE id = $1
  `, [purchaserId]);
}
```

For gift recipients: if they later place their own order, they become customers normally. If never, they remain `gift_recipient_only`.

### CLV adjustment

Gift purchasers often have inflated order counts because they're shopping for others. Adjust CLV models to weight gift orders separately. (Existing CLV model needs minor update — flag as ML team task.)

### Acceptance criteria

- [ ] Migration applied
- [ ] Gift detection runs on every order sync
- [ ] Customer type classification updates correctly
- [ ] Gift indicator visible on order detail page
- [ ] Customer detail page shows customer_type badge
- [ ] Strategy generation segments differently for gift_buyer vs self_purchaser

---

## 1.7 Order Status Filtering (half day)

### What it fixes

Cancelled orders and pending orders are currently included in metrics. Inflates revenue, distorts churn calculations.

### Schema check

Likely already captured — verify:
- `orders.financial_status` ('paid', 'pending', 'partially_refunded', 'voided', 'authorized')
- `orders.fulfillment_status` ('fulfilled', 'partial', 'unfulfilled', 'restocked')
- `orders.cancelled_at` (timestamp or null)
- `orders.cancel_reason` ('customer', 'fraud', 'inventory', 'declined', 'other')

If not in schema, add:

```sql
ALTER TABLE orders
  ADD COLUMN financial_status TEXT,
  ADD COLUMN fulfillment_status TEXT,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancel_reason TEXT;
```

### Update all metric queries

Audit every existing query that aggregates orders. Add status filters:

```typescript
// lib/metrics/queries.ts — update sumRevenue, countOrders, etc.

export async function sumRevenue(merchantId, date) {
  return pg.query(`
    SELECT SUM(total_price) FROM orders
    WHERE merchant_id = $1
      AND DATE(created_at) = $2
      AND cancelled_at IS NULL                    -- exclude cancelled
      AND financial_status IN ('paid', 'partially_refunded')  -- exclude pending/voided
  `, [merchantId, date]);
}
```

Same pattern for: `countOrders`, `countNewCustomers`, CLV calculation, value tier classification, all dashboard widgets.

### Cancellation reason analysis

Surface as opportunity:
- High `customer` cancel reason rate = retention problem
- High `inventory` cancel reason rate = supply problem
- High `fraud` cancel reason rate = acquisition channel problem

### Acceptance criteria

- [ ] Order status fields verified or added
- [ ] All metric queries audited and filter cancelled/pending orders
- [ ] Cancellation reason aggregations visible somewhere (admin panel or dashboard widget)
- [ ] Verification: pre-fix and post-fix metrics show different values

---

## 1.8 Granular Marketing Consent State (half day)

### What it adds beyond 1.1

1.1 captures basic marketing consent. This adds the granular state machine.

### Schema changes

Already covered in 1.1 — `marketing_opt_in_level` and `sms_marketing_consent_state` fields.

### What to do with the data

**Filtering customers list by consent state:**
- Confirmed opt-in vs single opt-in (different deliverability rates)
- SMS subscribers (different channel access)

**Strategy program template variations:**
- "Confirmed opt-in only" version of campaigns (higher deliverability)
- "SMS-eligible" version (different copy framework)

### Acceptance criteria

- [ ] Migration applied (covered in 1.1)
- [ ] Sync captures all consent fields (covered in 1.1)
- [ ] Customer filter dropdown for consent state
- [ ] Strategy programs respect consent filtering

---

## Tier 1 Total Effort

| Item | Effort |
|---|---|
| 1.1 Newsletter Signup Intelligence | 1-2 days |
| 1.2 Refund-Adjusted CLV | 1 day |
| 1.3 Tags + Notes | half day |
| 1.4 Channel Attribution | half day |
| 1.5 Order Risk Score | half day |
| 1.6 Gift Flagging | half day |
| 1.7 Order Status Filtering | half day |
| 1.8 Granular Consent (covered in 1.1) | 0 |
| **Total** | **5-6 days** |

---

# TIER 2 — Post-Launch Shopify Additions

**Goal:** Capture more sophisticated Shopify data that requires more work.

**Total effort:** ~6-8 days

**When to build:** After launch, with first 5-10 paying merchants providing real data.

**Dependencies:** Tier 1 should be complete first (some Tier 2 builds on Tier 1 schemas).

---

## 2.1 Line Item Properties + Per-Item Discounts (1.5 days)

### What it captures

- Custom personalization data on line items (engraving, gift options)
- Per-product discount data (which items got discounted vs full-price)
- Product affinity by category (which products customer buys)

### Schema additions

```sql
ALTER TABLE order_line_items
  ADD COLUMN properties JSONB,
  ADD COLUMN discount_allocations JSONB,
  ADD COLUMN product_type TEXT,        -- denormalized from products
  ADD COLUMN product_tags TEXT[],
  ADD COLUMN product_vendor TEXT;
```

### Sync handler

Pull product metadata at sync time, denormalize onto line items.

### Use cases unlocked

- Product affinity per customer (linen buyer vs general)
- Personalization signal (premium buyer)
- Per-category discount sensitivity

---

## 2.2 Browse Behavior via Shopify Customer Events (2 days)

### What it captures

For logged-in customers, Shopify exposes product page views, cart additions, search queries via the Customer Events API.

### Approach

```sql
-- Migration: customer_events
CREATE TABLE customer_browse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id),
  event_type TEXT NOT NULL,            -- 'product_viewed', 'collection_viewed', 'search', 'cart_added'
  entity_id TEXT,                      -- product/collection ID
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL
);
```

Subscribe to relevant Shopify Customer Events webhooks.

### Use cases

- "Sarah viewed Linen Wrap Dress 4 times in 7 days, didn't buy" → strong intent
- Cart additions without purchase = pre-cart-abandonment intent

---

## 2.3 Native Back-in-Stock Subscribers (1 day)

### What Shopify added natively in 2024

Native back-in-stock subscriptions endpoint:
- `GET /admin/api/2026-01/customers/{id}/back_in_stock_subscriptions`

### Schema

```sql
CREATE TABLE back_in_stock_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL,
  customer_id UUID,
  product_id TEXT,
  variant_id TEXT,
  product_name TEXT,                  -- denormalized
  subscribed_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  status TEXT                         -- 'pending', 'notified', 'cancelled'
);
```

### Use case

Strongest pre-purchase intent signal possible. Surface as opportunity:
"187 customers want products that are out of stock. Total value: $X."

---

## 2.4 Wishlist via Customer Metafields (1 day)

### Approach

Read customer metafields with namespaces matching common wishlist patterns:
- `wishlist`
- `favorites`
- `saved_items`

```typescript
// Discovery on customer sync
const metafields = await shopify.get(`/customers/${id}/metafields.json`);
const wishlistMetafield = metafields.find(m => 
  ['wishlist', 'favorites', 'saved_items'].includes(m.namespace)
);
if (wishlistMetafield) {
  // Parse and store as JSONB
}
```

Coverage: 20-40% of merchants (theme-native or metafield-based wishlists).

---

## 2.5 Purchase Interval Analysis (1 day)

### What it captures

Per-customer cycle time variance, repeat product overlap, loyalty type differentiation.

### Approach

Compute as a nightly job alongside daily metrics. Add columns to customers:

```sql
ALTER TABLE customers
  ADD COLUMN purchase_interval_avg_days NUMERIC(6,2),
  ADD COLUMN purchase_interval_std_days NUMERIC(6,2),
  ADD COLUMN unique_products_purchased INTEGER,
  ADD COLUMN repeat_product_count INTEGER,
  ADD COLUMN loyalty_type TEXT;        -- 'repeater' (buys same product), 'explorer' (varied), 'mixed'
```

### Use cases

- "Sarah is a repeater on linen products" vs "Marcus explores categories"
- Different campaign types for different loyalty types

---

## 2.6 Multi-Currency Normalization (1 day)

### What it fixes

Merchants selling in multiple currencies — current CLV math treats all amounts as one currency.

### Schema

```sql
ALTER TABLE orders
  ADD COLUMN presentment_currency TEXT,
  ADD COLUMN total_price_normalized_usd NUMERIC(12,2),    -- normalized to merchant's primary currency
  ADD COLUMN exchange_rate_at_order NUMERIC(10,6);
```

Compute at sync time using historical exchange rates.

---

## 2.7 Cancellation Reasons Dashboard (half day)

### What it adds beyond 1.7

1.7 captures cancellation data. This surfaces it as actionable insight.

Widget showing:
- Cancellation rate by reason (customer/fraud/inventory)
- Trend over time
- Per-channel cancellation rates (combined with 1.4 attribution data)

---

## Tier 2 Total Effort

| Item | Effort |
|---|---|
| 2.1 Line item properties + discounts | 1.5 days |
| 2.2 Browse behavior via Customer Events | 2 days |
| 2.3 Native back-in-stock subscribers | 1 day |
| 2.4 Wishlist via metafields | 1 day |
| 2.5 Purchase interval analysis | 1 day |
| 2.6 Multi-currency normalization | 1 day |
| 2.7 Cancellation reasons dashboard | 0.5 day |
| **Total** | **8 days** |

---

# TIER 3 — Third-Party App Integrations (Consolidated)

**Goal:** Integrate with the Shopify ecosystem apps that contain customer behavior data.

**Total effort:** ~25-35 days for full coverage. Build one integration at a time when paying merchants demand each.

**When to build:** When 30%+ of merchants ask for a specific integration. Prioritize by:
1. Which integration unlocks the most missing DNA dimensions
2. Which integration has the broadest merchant adoption
3. Which integration is technically simplest

**Universal integration pattern (applies to all Tier 3 items):**

```sql
-- Migration: integrations table
CREATE TABLE merchant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,              -- 'klaviyo', 'recharge', 'smile', etc.
  status TEXT NOT NULL,                -- 'connected', 'disconnected', 'error'
  credentials_encrypted TEXT,          -- encrypted API keys
  last_synced_at TIMESTAMPTZ,
  config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(merchant_id, provider)
);
```

Each integration follows the same pattern:
1. OAuth or API key entry in Settings
2. Initial sync of historical data
3. Webhook subscription for ongoing sync (where supported)
4. Per-provider data mapped to LifecycleAI canonical schema

---

## 3.1 Email Platform Integrations (Klaviyo first) — 5-7 days

### Why first

Highest ROI integration. Unlocks the most missing data:
- Email engagement (opens, clicks, unsubscribes)
- Browse abandonment (Klaviyo's native browse tracking)
- Back-in-stock (alternative to Shopify native)
- Subscriber list segmentation
- Email-clicked-but-didn't-purchase intent signal

### Coverage by merchant

Klaviyo dominates Shopify email tools. Estimated 60-70% of $500K-$50M Shopify merchants use it.

### Implementation phases

**Phase 1: OAuth + connection** (1 day)
**Phase 2: Subscriber sync** (1 day)
**Phase 3: Engagement events sync** (2 days)
**Phase 4: Browse events sync** (1-2 days)
**Phase 5: Engagement-aware DNA scoring** (1 day)

### What this unlocks

- **Engagement DNA dimension becomes real** (currently proxy-based)
- Newsletter signup intelligence becomes more accurate (you know when they joined Klaviyo, not just Shopify)
- "Clicked but didn't purchase" segment
- Send-time optimization
- Real Klaviyo segment data exposed in LifecycleAI

### Other email platforms to follow Klaviyo

- Mailchimp (~3-4 days, smaller market share for Shopify)
- Omnisend (~3-4 days, growing Shopify share)
- Postscript / Attentive (SMS focus, ~3-4 days)

---

## 3.2 Subscription Platforms (Recharge first) — 4-5 days

### Why valuable

Subscription pause/cancel is the strongest churn signal possible. Subscription customers behave fundamentally differently from one-time buyers.

### Coverage

Recharge dominates Shopify subscriptions. Bold and Skio are alternatives.

### What this unlocks

- Active subscribers vs paused vs cancelled segmentation
- Pause reason tracking (price, frequency, product)
- Subscription-specific churn prediction (different from order-based churn)
- Win-back campaigns specifically for cancelled subscribers
- Skip frequency analysis

### Schema

```sql
CREATE TABLE customer_subscriptions (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  provider TEXT NOT NULL,              -- 'recharge', 'bold', 'skio', 'shopify'
  external_id TEXT NOT NULL,
  status TEXT NOT NULL,                -- 'active', 'paused', 'cancelled'
  product_id TEXT,
  frequency TEXT,                      -- 'weekly', 'monthly', etc.
  next_charge_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  pause_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  total_charges INTEGER,
  total_revenue NUMERIC(12,2)
);
```

### Other subscription apps

- Bold Subscriptions (~3-4 days)
- Skio (~3-4 days)
- Shopify Subscriptions (~2-3 days, native)

---

## 3.3 Loyalty Platforms (Smile.io first) — 3-4 days

### Why valuable

Makes Advocacy DNA dimension real. Currently uses order count as proxy.

### Coverage

Smile.io has the broadest Shopify adoption. Loyalty Lion and Yotpo Loyalty are alternatives.

### What this unlocks

- Real loyalty tier in DNA (Bronze/Silver/Gold/Platinum)
- Points balance and redemption history
- Referrals made (advocacy signal)
- Loyalty non-participants (highest-value customers not yet enrolled)
- Tier progression / regression detection

### Schema

```sql
CREATE TABLE customer_loyalty (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  provider TEXT NOT NULL,
  loyalty_tier TEXT,
  points_balance INTEGER,
  points_earned_lifetime INTEGER,
  points_redeemed_lifetime INTEGER,
  referrals_made INTEGER,
  referrals_converted INTEGER,
  enrolled_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ
);
```

### Other loyalty apps

- Loyalty Lion (~3-4 days)
- Yotpo Loyalty (~3-4 days, often comes with Yotpo Reviews)

---

## 3.4 Review Platforms (Yotpo first) — 3-4 days

### Why valuable

5-star reviewers = highest-advocacy customers (referral candidates).
1-star reviewers = highest churn risk + worth personal outreach.
Verified buyers vs non-buyer reviewers = trust signal.

### Coverage

Yotpo dominates higher-end Shopify. Judge.me dominates lower-end. Stamped is mid-market.

### What this unlocks

- Review-leaver advocacy boost
- Negative-reviewer recovery campaigns
- Photo/video reviewers (deepest engagement signal)
- Review request optimization (when to ask)
- Sentiment analysis on review text

### Schema

```sql
CREATE TABLE customer_reviews (
  id UUID PRIMARY KEY,
  merchant_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  provider TEXT NOT NULL,
  product_id TEXT,
  rating INTEGER,
  review_text TEXT,
  has_photo BOOLEAN,
  has_video BOOLEAN,
  verified_buyer BOOLEAN,
  sentiment TEXT,                      -- 'positive', 'negative', 'mixed' — from LLM analysis
  created_at TIMESTAMPTZ
);
```

### Other review apps

- Judge.me (~3 days)
- Stamped (~3-4 days)
- Okendo (~3-4 days)

---

## 3.5 Support Tickets (Gorgias first) — 3-4 days

### Why valuable

Support touches before churn = early warning signal. Negative ticket sentiment = at-risk customer.

### Coverage

Gorgias dominates Shopify support. Zendesk and Re:amaze are alternatives.

### What this unlocks

- Ticket count per customer (engagement vs frustration signal)
- Negative sentiment detection (LLM on ticket text)
- "Issue resolved" vs "issue unresolved" tracking
- Pre-churn ticket pattern detection

### Other support apps

- Zendesk (~3-4 days)
- Re:amaze (~3-4 days)
- Shopify Inbox (~2-3 days, native)

---

## 3.6 SMS Platforms (Postscript first) — 3-4 days

### Why valuable

SMS engagement is often higher than email. Different consent state, different content patterns.

### Coverage

Postscript and Attentive dominate Shopify SMS.

### What this unlocks

- SMS engagement granularity (replies, clicks, opt-outs)
- SMS-eligible vs email-only segmentation
- Channel preference detection per customer

---

## 3.7 Ad Attribution Platforms (Triple Whale, Northbeam) — 4-5 days

### Why valuable

Pre-purchase ad touch tracking. Cost per acquisition per channel. ROAS by customer segment.

### Coverage

Triple Whale and Northbeam are the dominant attribution tools. Both are expensive ($300-2000/month) so adoption is concentrated in larger merchants.

### What this unlocks

- True acquisition cost per customer
- Channel ROAS by lifecycle stage
- Acquisition Quality Score (paid customers vs organic CLV)

### Why deferred

Most $500K-5M GMV merchants don't use these tools yet. Build when targeting larger merchants in v3.

---

## 3.8 POS / Offline (Shopify POS first) — 2-3 days

### Why valuable

Omnichannel customer view. In-store purchases combined with online.

### Coverage

Only relevant if merchant uses Shopify POS specifically. External POS (Square, Toast) requires separate integration.

---

## 3.9 Returns Apps (Loop, Returnly) — 2-3 days

### What this adds beyond Tier 1.2

Tier 1.2 captures Shopify-native refunds. Returns apps add:
- Return reason granularity (defective vs sizing vs preference)
- Exchange vs refund preference
- Return rate by SKU (product quality signal)

---

## 3.10 Quiz / Survey Platforms (Octane AI first) — 2-3 days

### Why valuable

Zero-party data — customer-stated preferences, sizes, needs. Most undervalued data source in the Shopify ecosystem.

### Coverage

Octane AI dominates Shopify quizzes. Klaviyo Flows can also collect quiz responses.

---

## Tier 3 Build Order (when triggered by demand)

When 30%+ of paying merchants ask for an integration, build in this priority order:

1. **Klaviyo** (highest impact, broadest adoption)
2. **Recharge** (if subscription-heavy merchant base)
3. **Smile.io** (if loyalty-focused merchants)
4. **Yotpo / Judge.me** (reviews coverage)
5. **Gorgias** (support context)
6. **Postscript / Attentive** (SMS coverage)
7. **Loop / Returnly** (refund granularity)
8. **Octane AI** (zero-party data)
9. **Shopify POS** (omnichannel merchants only)
10. **Triple Whale / Northbeam** (large merchants only, attribution)

---

## Tier 3 Total Effort (if you build everything)

| Integration | Effort |
|---|---|
| Klaviyo | 5-7 days |
| Recharge | 4-5 days |
| Smile.io | 3-4 days |
| Yotpo | 3-4 days |
| Gorgias | 3-4 days |
| Postscript | 3-4 days |
| Loop | 2-3 days |
| Octane AI | 2-3 days |
| Shopify POS | 2-3 days |
| Triple Whale | 4-5 days |
| **Per-additional integration in same category** | 2-4 days each |
| **Total for 10 primary integrations** | **31-42 days** |

You will not build all of these. Build the 3-5 your merchants most ask for. The rest stay scoped for future.

---

# Master Implementation Sequence

## Phase 1: Tier 1 only (5-6 days)
**Build now. Pre-launch or during App Store review.**
1.1 Newsletter Signup Intelligence
1.2 Refund-Adjusted CLV
1.3-1.8 (smaller items, batch them)

## Phase 2: Launch + first 5 paying merchants
**Pause data work. Focus on getting paying customers, real feedback.**

## Phase 3: Tier 2 (8 days)
**Build when:**
- You have 5-10 paying merchants
- They've revealed which Tier 2 items matter most
- Build in priority order based on actual merchant requests

## Phase 4: Tier 3 (sequential, demand-driven)
**Build first integration when:**
- 30%+ of merchants explicitly ask for it
- You have data on which one is highest priority

**Don't build any Tier 3 speculatively.** Each integration is a maintenance burden.

---

# What's NOT in any tier (won't build)

Documented as out-of-scope:

- Anonymous browser tracking (custom pixel) — too complex for solo founder pre-PMF
- Cross-merchant identity resolution — requires network effects
- Custom rule builder UI — power user feature, low ROI
- White-label / agency tier — premature
- Public API for third-party developers — premature
- Magento / Adobe Commerce — different platform
- Custom built-in A/B testing framework — Klaviyo handles this
- Built-in ad platform push (Meta, Google) — out of scope for retention tool

---

# Acceptance criteria for each tier

## Tier 1 done when:
- [ ] All 8 items shipped
- [ ] Existing dashboards refresh with newly captured data
- [ ] Newsletter Opportunity widget visible on `/dashboard/grid`
- [ ] Refund-adjusted CLV used everywhere CLV is referenced
- [ ] Customer/order tags surface in customer detail + filters
- [ ] Channel attribution visible in segments
- [ ] Risk-flagged customers excluded from retention strategies
- [ ] Gift purchasers correctly classified
- [ ] Cancelled orders excluded from metrics
- [ ] Migration documentation in PROJECT-STATUS.md

## Tier 2 done when:
- [ ] All 7 items shipped
- [ ] Browse intent surface integrated into dashboard
- [ ] Multi-currency merchants see correct CLV
- [ ] Purchase interval analysis informs strategy templates

## Tier 3 done when (per integration):
- [ ] OAuth/API key flow in Settings
- [ ] Initial historical sync completes
- [ ] Ongoing webhook sync configured
- [ ] Provider data mapped to canonical schema
- [ ] Relevant DNA dimensions updated to real data
- [ ] Disconnect flow handles cleanly

---

# Hand to Claude Code

## For Tier 1 only (now):

Copy from `# TIER 1 — Pre-Launch Data Captures` through end of Tier 1 section. Add this prefix:

> Implement Tier 1 data captures per the spec. Build in order 1.1 → 1.8. Stop and report after each item. Do not proceed without my approval. All locked principles apply (RLS pattern, theme tokens, Vercel Cron, migration-friendly job structure).

## For Tier 2 (later):

Copy Tier 2 section. Same prefix structure.

## For Tier 3 (when demand triggers):

Pick ONE integration, copy that subsection. Each integration is its own build cycle.

---

# Honest note

This spec is comprehensive because you asked for thorough. Don't try to build everything.

**Realistic plan:**
- Tier 1: Yes, build it all. ~6 days. Genuinely useful.
- Tier 2: Build 3-4 items based on merchant requests. Skip the rest.
- Tier 3: Build 3-5 integrations max in your first year. Klaviyo definitely. The rest only when merchants demand them.

The spec captures the universe of possibilities so future-you (or future-Claude-Code) doesn't have to re-discover what's missing. You'll build maybe 40-50% of what's in this document. That's normal. Optionality matters more than completeness.
