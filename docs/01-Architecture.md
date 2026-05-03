# 01 — Architecture

## The 3-layer model

```
┌─────────────────────────────────────────┐
│ LAYER 3: LLM (creative + explanation)    │
│  ─ Brand voice extraction                │
│  ─ Copy generation per segment           │
│  ─ Reasoning explanations               │
│  ─ Monthly narrative reports            │
│  ─ Open-ended Q&A                       │
│  Cost: ~$0.50–1 per client per month     │
└──────────────────┬──────────────────────┘
                   ↑
                   uses outputs from
                   ↑
┌─────────────────────────────────────────┐
│ LAYER 2: ML MODELS (probabilistic preds) │
│  ─ CLV: BG-NBD + Gamma-Gamma             │
│  ─ NBP: Collaborative filtering          │
│  ─ Churn: BG-NBD (e-com) / LightGBM (SaaS)│
│  Cost: ~$0.50–2 per client per month     │
└──────────────────┬──────────────────────┘
                   ↑
                   uses raw features from
                   ↑
┌─────────────────────────────────────────┐
│ LAYER 1: RULES ENGINE (strategic core)   │
│  ─ Segmentation (5 types)                │
│  ─ Stage transitions (dynamic thresholds)│
│  ─ Program eligibility                   │
│  ─ NBO logic (uses ML scores)            │
│  ─ Compliance / suppression              │
│  Cost: $0 (pure code)                    │
└──────────────────┬──────────────────────┘
                   ↑
                   data from
                   ↑
┌─────────────────────────────────────────┐
│ DATA LAYER                               │
│  Stripe + Shopify + CSV + Klaviyo (read) │
│  + Brand Profile (from website crawl)    │
└─────────────────────────────────────────┘
```

## Why rules-first, AI-overlay

This is the architecture banks use (Pega, SAS, FICO, Adobe Decision Cloud). It wins on:

| Dimension | Rules core | LLM-only |
|-----------|-----------|----------|
| Cost | ~$0 | $0.05–0.50/customer/call |
| Speed | ms | seconds |
| Determinism | ✅ same input = same output | ❌ varies |
| Explainability | ✅ full audit trail | ❌ black box |
| Reliability | ✅ no hallucinations | ❌ occasional |
| Vendor lock-in | None | Anthropic/OpenAI |

LLM is the *messenger*, not the strategist. Strategy is rules + ML scores.

## Where AI is genuinely doing intelligent work

The product is legitimately AI-powered — LLM does:
- Brand voice extraction from website crawls (no rules can do this)
- Copy generation in brand voice (creative writing)
- Reasoning over unstructured data (reviews, complaints)
- NBP "why this product" explanations
- Monthly narrative reports
- Open-ended Q&A

These are real AI tasks. Rules handle deterministic logic; AI handles creative/explanatory work.

## ML model decisions for MVP

| Model | In MVP? | Method | Why |
|-------|---------|--------|-----|
| **CLV** | ✅ Yes | BG-NBD + Gamma-Gamma (`lifetimes` lib) | Big accuracy gap vs rules, well-established library |
| **NBP** | ✅ Yes | Collaborative filtering (`implicit` lib) | Big accuracy gap vs market basket alone |
| **Churn** | ✅ Yes | BG-NBD (e-com) / LightGBM (SaaS) | Core product value prop, banking standard |
| **NBO** | ❌ No (rules + ML inputs) | Rules-based using CLV/NBP/Churn outputs | Cold-start problem; needs response data we don't have |
| **Price sensitivity** | ❌ No | Rules: discount-response history | Marginal accuracy gain |
| **Channel propensity** | ❌ No | Rules: most-engaged channel | Marginal gain |
| **Send-time** | ❌ No | Rules: behavioral mode | Marginal gain |

See [[04-CLV-Model]], [[05-NBP-Model]], [[06-Churn-Model]], [[07-NBO-Logic]].

## Concrete request flow

```
User opens dashboard
  ↓
1. Rules engine pulls latest synced data
2. Rules compute segments, stage memberships, eligibility
3. ML models score: churn prob, CLV predicted, NBP ranked
4. Rules engine combines → produces program specs
5. LLM generates copy per segment (cached)
6. Dashboard renders 5-7 priority programs
  ↓
User clicks "Push to Klaviyo"
  ↓
7. Rules generate Klaviyo flow JSON
8. API push to client's Klaviyo
9. Track for attribution (link send → conversion)
  ↓
Monthly background job
  ↓
10. Re-sync data, re-score ML, re-run rules, regenerate copy
11. Email digest to client
```

## Tech stack

| Layer | Tools |
|-------|-------|
| Frontend | Next.js 14 (App Router), Tailwind, shadcn/ui |
| Backend API | Next.js API routes |
| Background jobs | Inngest or Trigger.dev |
| Database | Supabase Postgres |
| Auth | Supabase Auth |
| ML services | Python microservice (FastAPI) on Railway with `lifetimes`, `implicit`, `lightgbm` |
| LLM | Anthropic API (Sonnet 4.6 default, Opus for monthly strategy) |
| Email/SMS (Phase 2) | Postmark, Twilio |
| Hosting | Vercel (frontend + API) + Railway (Python ML + jobs) |
| Storage | Supabase Storage (for CSV uploads, exports) |

## Data architecture

See [[11-Integrations]] for integration details. Key tables:

- `users` — auth + billing
- `accounts` — connected Stripe/Shopify/Klaviyo accounts per user
- `brand_profiles` — extracted brand data (voice, category, target customer)
- `customers` — synced customer records
- `orders` / `transactions` — synced purchase history
- `segments` — computed segment memberships (denormalized for speed)
- `customer_scores` — ML predictions (CLV, NBP, churn) per customer
- `strategies` — generated lifecycle programs
- `program_executions` — tracking for attribution
- `subscriptions` — our SaaS billing (Stripe)
