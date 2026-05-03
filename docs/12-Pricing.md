# 12 — Pricing

## Tier structure (draft — validate via friend's store + early users)

| Tier | Price | Customers | Refresh | Brands | Channels | Integrations |
|------|-------|-----------|---------|--------|----------|--------------|
| **Starter** | $39/mo | 1,000 max | Monthly | 1 | Email + SMS | Stripe + CSV |
| **Growth** | $99/mo | 10,000 max | Weekly | 1 | + Web push, Klaviyo export | + Shopify |
| **Pro** | $249/mo | 50,000 max | On-demand + monthly | 3 | All + WhatsApp + paid retargeting | + All major email tools |
| **Agency** | $499/mo | Unlimited | On-demand | 10 | + White-label + API | + Custom |

## Cost economics per tier

| Tier | Price | LLM | ML | Hosting | Total Cost | Margin |
|------|-------|-----|-----|---------|------------|--------|
| Starter | $39 | $0.50 | $0.30 | $0.30 | $1.10 | 97% |
| Growth | $99 | $1.50 | $0.80 | $0.40 | $2.70 | 97% |
| Pro | $249 | $4 | $2 | $0.50 | $6.50 | 97% |
| Agency | $499 | $8 | $5 | $1 | $14 | 97% |

ML cost stays low because:
- Global models trained monthly (not per-customer per-day)
- Inference is cents per customer
- `lifetimes` and `implicit` libraries are CPU-light

## Margin protection

Even if costs run 2–3× over estimate (worst case):
- Starter at $3/mo cost = 92% margin
- Growth at $8/mo cost = 92% margin
- Pro at $20/mo cost = 92% margin

Plenty of buffer.

## What unlocks at each tier

### Starter ($39/mo)
- Connect Stripe + CSV upload
- Up to 1,000 customers
- Lifecycle stage segmentation (6 stages)
- CLV + Churn + NBP scoring
- Email + SMS message blueprints
- CSV export of segments
- Monthly strategy refresh
- Basic reporting (per-program performance)

### Growth ($99/mo)
- Everything in Starter
- + Shopify integration
- + Up to 10,000 customers
- + Web push channel
- + Klaviyo one-click export
- + Brand profile from website crawl
- + Custom segments (5 user-defined)
- + Weekly strategy refresh
- + Stage-health dashboard
- + Monthly AI narrative report

### Pro ($249/mo)
- Everything in Growth
- + Up to 3 brands (multi-store)
- + Up to 50,000 customers per brand
- + Customer.io / Mailchimp / ConvertKit / ActiveCampaign exports
- + WhatsApp + mobile push channels
- + Paid retargeting export (Facebook/Google ad audiences)
- + On-demand strategy regeneration (unlimited)
- + Unlimited custom segments
- + A/B testing + control groups
- + Goal setting (e.g., "increase 2nd-purchase rate 20%")
- + Anomaly alerts
- + Priority support (email, 24hr SLA)

### Agency ($499/mo)
- Everything in Pro
- + Up to 10 brands
- + Unlimited customers
- + White-label option (rebrand for clients)
- + API access (integrate into agency stack)
- + Multi-user team accounts (5 seats)
- + Custom integrations (case-by-case)
- + Dedicated Slack channel for support

## Annual pricing (later — Phase 2)

When billing maturity allows:
- Annual = 12 months × monthly price × 0.83 (2 months free)
- Drives cash flow, locks in customers

## Free tier consideration

**Decision: NO free tier in MVP.**

Reasons:
- Free users absorb support cost without revenue
- We're solo-founder time-constrained
- Trial period (14 days) is enough
- Free tier in this category attracts hobbyists, not buyers

Maybe Phase 2: free tier limited to 100 customers as a top-of-funnel.

## Trial structure

- 14-day free trial, no credit card required to start
- Trial includes Growth tier features (let them feel the value)
- Auto-prompts for credit card on Day 10
- After trial: must add payment to continue

## Pricing-validation plan

Before launch:
1. Test on friend's Shopify store (free, get feedback)
2. Soft launch to 5–10 early customers at $99/mo flat (validate willingness to pay)
3. Once 50 paying customers, A/B test pricing variants
4. Adjust based on conversion data

## Comparison anchoring

We position vs:

| Comparison | Their price | Our positioning |
|-----------|-------------|------------------|
| Hiring CLM consultant | $5,000–15,000 engagement | "Strategy automation for $99/mo" |
| Klaviyo (sender alone) | $20–500/mo (their price) | "We work with Klaviyo, not against — adds strategy layer" |
| Marketing agency retainer | $2,000–10,000/mo | "Get banking-grade strategy without an agency" |

Anchoring to consultant cost makes $99/mo look cheap. Don't anchor to Klaviyo (we're not a Klaviyo competitor).

## Phase 2 pricing additions

- **Send-yourself add-on**: +$50/mo (Postmark + Twilio backend, white-label sending)
- **Custom ML training**: +$200/mo (per-client churn / NBP / CLV models)
- **Dedicated success manager**: +$500/mo (Pro/Agency upgrade, async)

## How customers are billed

- Stripe Subscriptions
- Monthly recurring
- Card on file
- Failed payment dunning (3 retries, then pause)
- Self-serve cancellation
- Annual prepay discount in Phase 2
