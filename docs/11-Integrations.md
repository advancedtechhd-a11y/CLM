# 11 — Integrations

## Phase 1 (MVP) — Shopify-first

Distribution strategy: **Shopify App Store + Shopify Billing API from day 1.** This is the major change from earlier drafts that proposed Stripe-first.

| Integration | Type | Priority | Build time |
|-------------|------|----------|------------|
| **Shopify** | OAuth (App Store install) | **PRIMARY — required** | 1-2 weeks |
| **Shopify Billing API** | Subscription billing | **PRIMARY — required** | 3-5 days |
| **Website crawl** | Read (public) for brand profile | Required | 3-5 days |
| **CSV upload** | Fallback for non-Shopify | Required | 2-3 days |

That's it for MVP. Everything else is Phase 2.

## Why Shopify-first (not Stripe-first)

Earlier drafts proposed Stripe-first because Stripe has broader market coverage (~80% of online businesses use Stripe). Reversed that decision because:

| Factor | Stripe-first | Shopify-first |
|--------|--------------|---------------|
| Initial market | Wider (e-com + SaaS + courses) | Narrower (Shopify only) |
| **Distribution** | None — paid ads only | **Shopify App Store** = organic discovery |
| Buyer urgency | Low (general "I should improve retention") | High (already on Shopify, looking for apps) |
| Integration depth | OK (transactions only) | Better (orders, products, abandoned carts, customer tags) |
| Sales friction | Higher (manual signup) | **Lower (one-click install via App Store)** |
| Billing | Build Stripe subscription ourselves | **Shopify Billing API** — frictionless |
| Trial conversion | Custom to build | **Shopify Billing handles automatically** |

**Focus + free distribution beats wider market without distribution.** Shopify App Store organic discovery is a real moat for Shopify-targeted products.

CSV upload remains as a fallback for non-Shopify merchants who want to try before integrating.

## Phase 2 — extended integrations (months 4-9)

| Integration | When | Why |
|-------------|------|-----|
| Klaviyo (full read + write) | v1.5 | Read engagement data, push flows |
| Customer.io | v1.5 | Alternative to Klaviyo |
| Mailchimp | v1.5 | Long-tail SMB merchants |
| ConvertKit | v1.5 | Course creators |
| Postscript | v1.5 | SMS-focused merchants |
| Yotpo / Stamped (reviews) | v2 | Advocacy detection signals |
| Intercom / Gorgias (support tickets) | v2 | Complaint signals for At Risk detection |

## Phase 3 — advanced integrations (months 9-18)

| Integration | When | Notes |
|-------------|------|-------|
| Recharge / Bold subscriptions | v2 | Subscription/replenishment layer |
| WooCommerce | v2.5 | Multi-platform expansion begins |
| BigCommerce | v2.5 | Mid-market merchants |
| ActiveCampaign | v2.5 | Mid-market alternative to Klaviyo |
| Magento | v3 | Enterprise customers |
| HubSpot | v3 | B2B-leaning merchants |
| Meta Business / Google Ads | v3 | Acquisition layer (Triple Whale territory) |

---

## Shopify integration (MVP — primary data source)

### OAuth flow

Standard Shopify OAuth via App Store install:
1. Merchant clicks "Install" on App Store listing
2. Redirect to Shopify auth page with required scopes
3. Shopify redirects back with auth code
4. Exchange auth code for access token
5. Store encrypted access token in `merchants.shopify_access_token`
6. Begin initial data sync (background job)
7. Set up Shopify Billing API subscription

### Required scopes

```
read_customers, read_orders, read_products, read_marketing_events,
read_discounts, read_price_rules, read_themes, read_checkouts
```

### Initial data sync (Shopify GraphQL Bulk Operations)

For efficient backfill of historical data:

```graphql
mutation {
  bulkOperationRunQuery(
    query: """
    {
      orders {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { id email }
            lineItems {
              edges {
                node {
                  product { id title productType }
                  variant { id sku }
                  quantity
                  originalUnitPriceSet { shopMoney { amount } }
                }
              }
            }
          }
        }
      }
    }
    """
  ) { ... }
}
```

Sync strategy:
1. Create bulk operation for last 24 months of orders (or all available)
2. Poll bulk operation status
3. Download JSONL result file
4. Parse and insert into `orders`, `order_line_items`, `customers`, `products` tables
5. Trigger initial metrics computation
6. Notify merchant via UI when complete

For typical small/mid stores: 5-30 minutes.
For Plus stores with millions of orders: 1-4 hours.

### Real-time webhooks

Subscribe to Shopify webhooks for incremental updates:

```
orders/create, orders/updated, orders/cancelled, orders/fulfilled
customers/create, customers/update
products/create, products/update, products/delete
checkouts/create, checkouts/update  (for cart abandonment v1.5+)
app/uninstalled  (for cleanup)
```

Mandatory privacy webhooks (required for App Store approval):
```
customers/redact, shop/redact, customers/data_request
```

Webhook handler pattern:
1. Verify HMAC signature from Shopify
2. Push raw event to background queue (Inngest)
3. Worker processes event, updates database, triggers metric recomputation

### Rate limiting

Shopify API rate limits:
- Standard plan: 40 calls/sec REST, 1000 cost units GraphQL
- Plus plan: 80 calls/sec REST, 2000 cost units GraphQL

Implement:
- Exponential backoff on 429 responses
- Request queuing per merchant
- Use bulk operations for large data pulls (no rate limits, just throughput)

---

## Shopify Billing API (MVP — frictionless subscriptions)

### Why use Shopify Billing (not Stripe direct)

For App Store distribution, **Shopify Billing API is mandatory.** Benefits:
- Charges appear on merchant's existing Shopify bill (unified billing — frictionless)
- Trial period managed via Shopify Billing automatically
- Plan upgrades/downgrades via API
- Shopify handles failed payments, dunning, refunds
- App Store policy compliance (App Store rejects custom billing for Shopify-installed apps)

### Pricing tiers via Shopify Billing

```javascript
const subscription = await shopify.recurringApplicationCharge.create({
  name: "LifecycleAI - Starter",
  price: 99,
  return_url: "https://lifecycleai.com/billing/callback",
  trial_days: 14,
  test: false  // true for development
});
```

Plans match [[12-Pricing]]:
- Starter: $99/mo, 14-day trial
- Growth: $249/mo
- Pro: $599/mo
- Agency: $999/mo

### Shopify revenue share

- 0% under $1M annual (small developer terms — applies to us until that point)
- 15% above $1M annual (only on revenue from Shopify-installed merchants)

### Plan management

- Upgrades/downgrades via UI → call Shopify Billing API to create new subscription
- Old subscription auto-cancelled
- Mid-cycle: prorated automatically by Shopify

---

## Website crawl (MVP — brand profile)

### Detection

After Shopify install, auto-extract website:
- Shopify `shop.domain` field returns the public domain (100% reliable)
- For CSV-only merchants: ask in onboarding wizard

### Crawl scope

5–10 key pages:
- Homepage (hero, value prop, voice)
- About page (brand story, customer persona)
- Top product pages (catalog, naming, descriptions)
- Reviews page (customer voice — Phase 2 deeper)

### Tech

- HTTP fetcher (Node `fetch` or `cheerio` for parsing)
- For JS-heavy SPAs (headless Shopify): Playwright
- Respect `robots.txt`
- Rate limit: 1 req/sec per domain
- Custom User-Agent: `LifecycleAI Bot — lifecycleai.com/bot`

### Brand profile output

Stored per merchant, referenced by LLM for copy generation. See [[16-AI-Brain-Spec]] for the full extraction prompt and output schema.

---

## CSV upload (MVP — fallback)

For merchants who:
- Don't use Shopify (custom-built sites, WooCommerce, etc.)
- Want to try the product before installing the Shopify App
- Test data integration

### Required columns (minimum)

- `customer_email` (or hashed ID)
- `first_purchase_date`
- `total_revenue`

### Optional but valuable

- `last_purchase_date`
- `purchase_count`
- `last_purchase_value`
- `acquisition_source`
- `geography`

System parses, infers structure, runs analysis. **Limited functionality vs. live Shopify integration** but sufficient for trial use. Without webhooks, data goes stale — UI shows "last synced" timestamp.

CSV-uploaded merchants pay via Stripe (not Shopify Billing).

---

## Data sync pattern

```
Initial onboarding:
  ├─ Shopify Bulk Operations: pull last 24 months of orders
  ├─ Store raw + computed
  └─ Trigger initial analysis (rules + ML + LLM)

Ongoing sync (real-time via webhooks):
  ├─ Process new orders/customers/products as they happen
  ├─ Update segment memberships
  ├─ Detect events (cart abandon, refund, etc.)
  └─ Fire alerts if anomalies

Daily refresh (background):
  └─ Recompute metrics, scores, strategies, narratives
```

## Security / privacy

- All API tokens encrypted at rest (Supabase Vault or pgcrypto)
- OAuth tokens refreshed automatically
- Never log raw customer PII in application logs
- GDPR / CCPA: support data deletion requests within 30 days
- Read-only by default — minimizes blast radius if breached
- Honor Shopify mandatory privacy webhooks (`customers/redact`, `shop/redact`, `customers/data_request`)
- We don't share/sell any customer data

See [[15-Decisions-Log]] for IP/employer-separation considerations.

## App Store submission

Shopify App Store review takes 4-8 weeks. Start submission process at Week 14 of build plan to align with Week 18-20 launch.

Required for submission:
- Privacy policy (covers ML training on anonymized features — see [[19-ML-Privacy]] when added)
- Terms of Service
- App listing copy + screenshots + demo video
- HMAC verification on all webhooks
- Mandatory privacy webhooks implemented
- GDPR-compliant data handling
- Support email + response SLA documented
