# 12 — Pricing

## Tier structure

| Tier | Price | Customers | Refresh | Brands | Channels | Integrations |
|------|-------|-----------|---------|--------|----------|--------------|
| **Starter** | $99/mo | 2,500 max | Daily | 1 | Email + SMS | Shopify + CSV |
| **Growth** | $249/mo | 25,000 max | Daily + on-demand | 1 | + Web push, Klaviyo export | + Klaviyo full integration |
| **Pro** | $599/mo | 100,000 max | Daily + on-demand | 3 | All + WhatsApp + paid retargeting | + Customer.io, Mailchimp, ConvertKit, Postscript |
| **Agency** | $999/mo | Unlimited | Daily + on-demand | 10 | + White-label + API | + Custom |
| **Enterprise** | Custom | Unlimited | Real-time + custom | Unlimited | All + custom | All + Isolated Mode (ML privacy) |

## Why these prices

Earlier draft used $39 / $99 / $249 / $499. Updated to $99 / $249 / $599 / $999 because:

| Reason | Detail |
|--------|--------|
| **Buyer profile** | Target is $500K-$50M GMV Shopify merchants. They pay Klaviyo $50-500/mo already. $39 signals "low-value tool" |
| **Solo founder support burden** | At $99 floor, 200 customers = $19.8k MRR. At $39 floor, need 500+ customers for same MRR — 2.5× more support load |
| **LTV math** | $99 × 24mo retention = $2,376 LTV. Justifies LLM/ML COGS comfortably. $39 LTV doesn't |
| **Competitive context** | Klaviyo's predictive features ship with their $200+ tier. Lifetimely at $79+. Triple Whale $129+ |
| **Anchoring** | We're "AI customer strategist," not "another email tool." Price reflects positioning |
| **Premium feature load** | Customer Health Score, Revenue at Risk, ML predictions, AI copy — these features deserve premium pricing |

## Cost economics per tier

| Tier | Price | LLM | ML training | ML inference | Hosting | Total Cost | Gross Margin |
|------|-------|-----|-------------|--------------|---------|------------|--------------|
| Starter | $99 | $0.80 | $0.50 | $0.20 | $0.40 | $1.90 | 98% |
| Growth | $249 | $2.50 | $1.20 | $0.40 | $0.50 | $4.60 | 98% |
| Pro | $599 | $6 | $3 | $1 | $0.80 | $10.80 | 98% |
| Agency | $999 | $12 | $6 | $2 | $1.20 | $21.20 | 98% |

ML cost stays low because:
- Global models trained monthly (not per-customer per-day)
- Inference is cents per customer
- `lifetimes` and `implicit` libraries are CPU-light

## Margin protection

Even if costs run 3× over estimate (worst case):
- Starter at $6/mo cost = 94% margin
- Growth at $14/mo cost = 94% margin
- Pro at $32/mo cost = 95% margin

Plenty of buffer.

## What unlocks at each tier

### Starter ($99/mo)
- Connect Shopify (OAuth + Shopify Billing)
- CSV upload fallback for non-Shopify businesses
- Up to 2,500 customers
- 7-stage lifecycle segmentation + 3 value tiers
- Customer Health Score + history (per [[18-Differentiating-Metrics]])
- Revenue at Risk dashboard
- First-to-Second Purchase Tracker
- Concentration Risk metric
- Discount Dependency scoring
- CLV + Churn + NBP ML predictions
- Email + SMS message blueprints
- CSV export of segments
- Daily metrics refresh
- Today View (daily action plan)

### Growth ($249/mo)
- Everything in Starter, plus:
- Up to 25,000 customers
- Klaviyo full integration (read engagement data + one-click flow push)
- Web push channel
- Brand profile from website crawl
- Custom segment builder (10 user-defined)
- On-demand strategy regeneration
- Stage-health dashboard
- Monthly AI narrative report
- Customer Concierge Timeline (full event log)
- Holdout testing for causal attribution (v1.5+)

### Pro ($599/mo)
- Everything in Growth, plus:
- Up to 3 brands (multi-store)
- Up to 100,000 customers per brand
- Customer.io / Mailchimp / ConvertKit / Postscript integrations
- WhatsApp + mobile push channels
- Paid retargeting export (Facebook/Google ad audiences)
- Saturation/Fatigue detection (cross-channel)
- Time-of-Day send optimization
- Unlimited custom segments
- A/B testing + control groups
- Goal setting (e.g., "increase 1→2 conversion 20%")
- Anomaly alerts
- Priority support (email, 24hr SLA)

### Agency ($999/mo)
- Everything in Pro, plus:
- Up to 10 brands
- Unlimited customers
- White-label option (rebrand for clients)
- API access (integrate into agency stack)
- Multi-user team accounts (10 seats)
- Portfolio view across all brands
- Custom integrations (case-by-case)
- Dedicated Slack channel for support

### Enterprise (Custom)
- Everything in Agency, plus:
- **Isolated Mode** — your data never enters global ML training (per [[19-ML-Privacy]] when added)
- EU data residency option
- DPA + SOC 2 documentation
- Custom SLA
- Dedicated success manager
- Real-time prediction API
- Per-vertical custom ML models

## Annual pricing (Phase 2)

When billing maturity allows:
- Annual = 12 months × monthly price × 0.83 (2 months free)
- Drives cash flow, locks in customers
- Most B2B SaaS see 30-50% of revenue from annual plans

## Free tier consideration

**Decision: NO free tier in MVP.**

Reasons:
- Free users absorb support cost without revenue
- We're solo-founder time-constrained
- 14-day trial is enough
- Free tier in this category attracts hobbyists, not buyers

Maybe v2: free tier limited to 100 customers as a top-of-funnel.

## Trial structure

- 14-day free trial via Shopify App Store Billing API
- Trial includes Growth tier features (let them feel the value)
- Auto-converts to selected paid plan on Day 15 unless cancelled
- Shopify Billing handles the conversion seamlessly (frictionless)

## Comparison anchoring

Position vs alternatives:

| Comparison | Their price | Our positioning |
|------------|-------------|------------------|
| Hiring CLM consultant | $5,000–15,000 engagement | "Continuous AI strategist for $99/mo" |
| Klaviyo predictive features | Built into $200+ tier | "Klaviyo strategy that goes deeper than their analytics" |
| Lifetimely | $79–399/mo | "Predictions + recommendations, not just analytics" |
| Triple Whale | $129–599/mo | "Customer intelligence, not just dashboarding" |
| Marketing agency retainer | $2,000–10,000/mo | "Get banking-grade strategy without an agency" |

Anchor to consultant cost makes $99/mo look cheap. Anchor to Triple Whale validates the price tier.

## Pricing-validation plan

Before launch:
1. Test on friend's Shopify store (free, get feedback)
2. Soft launch to 5–10 early customers at $99/mo flat (validate willingness to pay)
3. Once 50 paying customers, A/B test pricing variants
4. Adjust based on conversion data

## How customers are billed

**Shopify App Store + Shopify Billing API** — for all Shopify-installed merchants:
- Subscription created via Shopify Billing API on install
- Shopify takes 0% of revenue under $1M/year (small developer terms), 15% above $1M
- Charges appear on merchant's Shopify bill (unified billing — frictionless)
- Trial period managed via Shopify Billing
- Plan upgrades/downgrades via API

**Stripe Subscriptions** — for non-Shopify merchants (CSV upload only):
- Standard Stripe billing
- Self-serve cancellation
- Failed payment dunning (3 retries, then pause)

## Phase 2 pricing additions

- **Annual prepay discount** (~17% off / 2 months free)
- **Custom ML training add-on** (+$200/mo for per-client models)
- **Dedicated success manager** (+$500/mo for Pro/Agency)
- **Isolated Mode** (Enterprise only — opt-out of global ML training)
