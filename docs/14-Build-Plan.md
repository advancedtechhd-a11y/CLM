# 14 — Build Plan

## Total timeline: 19–21 weeks of evening/weekend work

(Updated 2026-05-05 — added 5 differentiating metrics from [[18-Differentiating-Metrics]]; switched from Stripe-first to Shopify-first distribution. See [[15-Decisions-Log]].)

Owner is full-time employed. Realistic capacity: ~10–15 hours/week.

## Phase breakdown

| Phase | Weeks | Hours est. | What |
|-------|-------|------------|------|
| 1. Foundation | 1–3 | 30–40 | Project setup, auth, basic dashboard |
| 2. Shopify integration | 3–6 | 60–80 | **Shopify OAuth + Shopify Billing API**, brand crawl, CSV fallback |
| 3. Rules engine | 6–11 | 70–90 | Segmentation, 7-stage logic, **Customer Health Score**, **Concentration Risk**, **Discount Dependency**, dynamic thresholds, scoring |
| 4. ML models | 11–14 | 50–70 | CLV (BG-NBD), NBP (collab filter), Churn |
| 5. LLM integration | 14–16 | 30–40 | Brand voice, copy generation, narrative reports |
| 6. Strategy generator | 16–18 | 40–50 | Combines rules + ML + LLM into program output |
| 7. Klaviyo export (deferred to v1.5) | — | — | Now in v1.5 phase, not MVP |
| 8. Reporting | 18–20 | 40–50 | Per-program performance, stage health, attribution, **Revenue at Risk dashboard hero**, **First-to-Second Tracker** |
| 9. App Store submission | 14 (parallel) | 20 | Begin Shopify App Store review (4-8 week window) |
| 10. Polish + testing | 20–21 | ongoing | UI refinement, bug fixes, friend's-store testing |

## Phase 1 — Foundation (weeks 1–3)

**Goal:** Empty app shell, can sign up, can see a dashboard (even if it's blank).

Tasks:
- [ ] Initialize Next.js 14 project with App Router
- [ ] Set up Supabase (DB, Auth, Storage)
- [ ] Auth flow (sign up, log in, password reset, email verification)
- [ ] Database schema (initial)
- [ ] Basic dashboard layout (Tailwind + shadcn/ui)
- [ ] Settings page
- [ ] Stripe billing integration (for our SaaS subscriptions)
- [ ] Subdomain / domain setup
- [ ] Vercel deployment

Files:
- `app/(auth)/signin/page.tsx`
- `app/(auth)/signup/page.tsx`
- `app/dashboard/page.tsx`
- `app/settings/page.tsx`
- `lib/supabase.ts`
- `lib/auth.ts`

## Phase 2 — Integrations (weeks 3–6)

**Goal:** Merchant can connect Stripe + Shopify, see their data synced.

Tasks:
- [ ] Stripe OAuth (Stripe Connect) — full flow
- [ ] Shopify OAuth (custom app install)
- [ ] CSV upload + parser
- [ ] Background job framework (Inngest or Trigger.dev)
- [ ] Initial data sync workers
- [ ] Incremental sync workers (every 1–6 hours)
- [ ] Website crawler (Cheerio or Playwright)
- [ ] Brand profile extraction (LLM-based from crawl)
- [ ] Onboarding wizard UI (4 steps)

Files:
- `app/api/connect/stripe/route.ts`
- `app/api/connect/shopify/route.ts`
- `app/api/upload/csv/route.ts`
- `lib/integrations/stripe.ts`
- `lib/integrations/shopify.ts`
- `lib/integrations/crawler.ts`
- `workers/sync-stripe.ts`
- `workers/sync-shopify.ts`

## Phase 3 — Rules engine (weeks 6–10)

**Goal:** Segments, lifecycle stages, scoring all working from synced data.

Tasks:
- [ ] RFM scoring (recency, frequency, monetary)
- [ ] Lifecycle stage assignment (6 stages)
- [ ] Dynamic threshold calculation per client
- [ ] 5 segment types (lifecycle, value tier, RFM, behavioral, custom)
- [ ] Custom segment builder UI
- [ ] Segment health monitoring
- [ ] BNPL detection
- [ ] CLV tier assignment (basic — will be replaced by ML in Phase 4)
- [ ] NBO rules (Phase 1 — basic)

Files:
- `lib/rules/rfm.ts`
- `lib/rules/lifecycle-stages.ts`
- `lib/rules/dynamic-thresholds.ts`
- `lib/rules/segments.ts`
- `lib/rules/nbo.ts`
- `app/dashboard/segments/page.tsx`

## Phase 4 — ML models (weeks 10–13)

**Goal:** CLV, NBP, Churn predictions running per customer.

Tasks:
- [ ] Python ML service skeleton (FastAPI)
- [ ] Deploy to Railway as separate service
- [ ] CLV: BG-NBD + Gamma-Gamma using `lifetimes`
- [ ] NBP: Collaborative filtering using `implicit`
- [ ] Churn: BG-NBD (e-com) / LightGBM (SaaS)
- [ ] Training pipelines (run monthly per client)
- [ ] Inference API (called by Next.js API routes)
- [ ] Model storage (Supabase Storage)
- [ ] Monitoring (model accuracy drift detection)

Files (Python):
- `ml-service/main.py`
- `ml-service/models/clv.py`
- `ml-service/models/nbp.py`
- `ml-service/models/churn.py`
- `ml-service/training/scheduled.py`

## Phase 5 — LLM integration (weeks 13–15)

**Goal:** AI generates brand-voice copy, narratives, explanations.

Tasks:
- [ ] Anthropic API client + retry logic
- [ ] Cost tracking + caching layer (avoid duplicate calls)
- [ ] System prompts for each task:
  - [ ] Brand profile extraction
  - [ ] Per-segment copy generation
  - [ ] NBP "why" reasoning
  - [ ] Monthly narrative reports
  - [ ] Q&A
- [ ] Prompt template management
- [ ] Output schema validation

Files:
- `lib/llm/client.ts`
- `lib/llm/prompts/brand-extraction.ts`
- `lib/llm/prompts/copy-generation.ts`
- `lib/llm/prompts/narrative.ts`
- `lib/llm/cache.ts`

## Phase 6 — Strategy generator (weeks 15–17)

**Goal:** Click "Generate strategy" → see 5–7 priority programs with copy + offers.

Tasks:
- [ ] Strategy orchestration (rules + ML + LLM combined)
- [ ] Program eligibility logic
- [ ] CLV-tiered offer logic (NBO)
- [ ] Strategy dashboard UI
- [ ] Program detail view
- [ ] Customer-level drill-down
- [ ] Edit/regenerate program
- [ ] Strategy versioning

Files:
- `lib/strategy/orchestrator.ts`
- `lib/strategy/programs.ts`
- `app/dashboard/strategy/page.tsx`
- `app/dashboard/strategy/[programId]/page.tsx`

## Phase 7 — DEFERRED to v1.5

**Originally:** "Klaviyo export — One-click push to Klaviyo creates segment + flow + templates."

**Decision (2026-05-05):** Deferred to v1.5 (see [[15-Decisions-Log]]). MVP ships with **CSV export of segments only** — merchants can manually create flows in their own Klaviyo / Customer.io / Mailchimp.

**Why deferred:**
- One-click flow push is a meaningful feature but adds 2-3 weeks of build time
- Klaviyo's flow API is complex; getting it right requires iteration
- MVP can deliver value via CSV export alone (merchants paste into their existing tool)
- Better to ship MVP at 19-21 weeks and validate willingness-to-pay than delay for this feature

**MVP replacement:** Phase 7 becomes simple CSV export (~3 days work):
- [ ] Generate segment CSV (customer_id, email, recommended_offer, message_body)
- [ ] PDF strategy report download
- [ ] Copy-to-clipboard for individual programs

Full Klaviyo + multi-tool integrations covered in v1.5 below.

Tasks (MVP, simplified):
- [ ] Segment → CSV export
- [ ] Strategy → PDF report (use existing libs)
- [ ] Copy email body / subject lines to clipboard
- [ ] Webhook for engagement data (read back open/click/conversion)

Files:
- `lib/integrations/klaviyo.ts`
- `lib/klaviyo/flow-translator.ts`
- `lib/klaviyo/template-generator.ts`
- `app/api/export/klaviyo/route.ts`

## Phase 8 — Reporting (weeks 18–20)

**Goal:** Per-program performance + stage health + monthly digests.

Tasks:
- [ ] Attribution engine (time-window match)
- [ ] Per-program performance dashboard
- [ ] Stage health dashboard
- [ ] Customer-level program history
- [ ] Monthly narrative report generation
- [ ] Email digest delivery
- [ ] Export to PDF

Files:
- `lib/reporting/attribution.ts`
- `lib/reporting/program-performance.ts`
- `lib/reporting/stage-health.ts`
- `app/dashboard/reports/page.tsx`

## Phase 9 — Polish + friend's-store testing (weeks 20-21)

- [ ] Test on friend's Shopify store
- [ ] Iterate based on real-world data quirks
- [ ] UI polish, mobile responsive
- [ ] Onboarding flow refinement
- [ ] Documentation (in-app help)
- [ ] Bug fixes
- [ ] Performance tuning

## Critical path (MVP)

The critical path (must work end-to-end before any other polish):

```
Shopify OAuth → Data sync → Rules engine → ML models → 
Strategy generator → CSV export → Attribution
```

Anything blocking this chain is highest priority. Everything else is parallel work.

---

# 🔄 v1.5 Build Plan (months 4-7 post-MVP)

After MVP ships and we have ~10-50 paying merchants, the v1.5 priorities are deferred MVP features and integration depth.

## v1.5 Priority Queue (locked 2026-05-05)

### 🔴 P0 — Klaviyo full integration (the deferred Phase 7)

**Why P0:** This is the "killer feature" merchants will ask for most. CSV export gets them started; Klaviyo automation locks them in.

Tasks:
- [ ] Klaviyo OAuth flow (read engagement + write flows)
- [ ] Klaviyo API client with retry + rate limiting
- [ ] Strategy → Klaviyo flow JSON translator
- [ ] Segment sync (live, dynamic — pushes membership changes)
- [ ] Template generator (HTML email matching brand voice)
- [ ] Test / dry-run mode (preview before activating)
- [ ] Read-back webhook (engagement data flows back into our scoring)

**Build estimate:** 3-4 weeks. **First priority for v1.5 work.**

### 🔴 P0 — Multi-tool execution exports (Customer.io, Mailchimp, ConvertKit, Postscript)

**Why P0:** Not every merchant uses Klaviyo. Adding Customer.io / Mailchimp / ConvertKit / Postscript covers ~95% of e-com merchants' execution stack.

Tasks per tool (~1 week each):
- [ ] Customer.io API integration (read + write)
- [ ] Mailchimp API integration
- [ ] ConvertKit API integration (course creators)
- [ ] Postscript API integration (SMS-first merchants)

**Build estimate:** ~4 weeks total. Run in parallel with Klaviyo where possible.

### 🟡 P1 — Holdout testing for causal attribution

**Why P1:** Strengthens our attribution from correlation to causation. Sophisticated buyers (Plus brands, agencies) ask for this.

Tasks:
- [ ] Random holdout assignment per campaign (configurable %)
- [ ] Treatment vs control conversion tracking
- [ ] Statistical significance testing (chi-squared, t-test)
- [ ] Incremental lift calculation
- [ ] UI: "Causal lift" alongside "attributed revenue"

**Build estimate:** 2-3 weeks.

### 🟡 P1 — Customer Concierge Timeline

**Why P1:** Full event log per customer (orders, stage changes, recommendations, campaigns received, conversions, health score history). The "single customer view" Klaviyo lacks.

Tasks:
- [ ] `customer_events` table for chronological event log
- [ ] Event types: order_placed, stage_changed, recommendation_generated, campaign_received, conversion_attributed, health_score_changed
- [ ] Vertical timeline UI on customer detail page
- [ ] Filter by event type
- [ ] Export timeline as PDF (concierge report)

**Build estimate:** 2 weeks.

### 🟡 P1 — Saturation/Fatigue Detection

**Why P1:** Cross-channel marketing touch tracking. Klaviyo's smart sending operates per-tool — we operate cross-tool. Real differentiator once Klaviyo + Postscript are integrated.

**Build estimate:** 1-2 weeks.

### 🟢 P2 — Time-of-Day / Day-of-Week optimization

Per-customer best send time learned from Klaviyo engagement data.

**Build estimate:** 1-2 weeks.

### 🟢 P2 — XGBoost churn model upgrade (replacing BG-NBD)

**Why P2:** BG-NBD works well for purchase-frequency-based churn. XGBoost can incorporate richer features (engagement, support tickets, BNPL signals) once we have integrations for those.

**Build estimate:** 2-3 weeks (model development + validation + deployment).

### 🟢 P2 — Predicted vs Actual public widget

Surface prediction accuracy publicly to merchants. Builds trust through transparency.

**Build estimate:** 1 week.

## v1.5 Total scope: ~14-18 weeks of work (months 4-7 post-MVP launch)

Run in parallel with customer acquisition + support work. Realistic to ship over 4 months given solo founder constraints.

---

# 🚀 v2 Build Plan (months 7-12 post-MVP)

Strategic expansion phase — multi-platform + premium features.

## v2 priorities

### Multi-platform expansion (per [[19-Multi-Platform-Roadmap]])
- [ ] BigCommerce adapter + App Marketplace listing (2-3 weeks)
- [ ] WooCommerce adapter + plugin (3-4 weeks)
- [ ] Shared `PlatformAdapter` infrastructure refinement

### Strategic regional expansion (months 9-12)
- [ ] Salla adapter + MENA App Marketplace listing (3-4 weeks)
- [ ] Zid adapter (3-4 weeks)
- [ ] Multi-currency handling (SAR, AED, etc.)
- [ ] RTL UI support
- [ ] Arabic-language LLM copy generation
- [ ] Local payment method handling (Mada, KNET, Tabby/Tamara already detected)

### Subscription/Replenishment Layer
- [ ] Recharge integration
- [ ] Bold subscriptions integration  
- [ ] Detect replenishment patterns (consumables — skincare, supplements, coffee)
- [ ] Recommend subscription opt-ins

### Reviews + Support integration
- [ ] Yotpo / Stamped (review signals → advocacy detection)
- [ ] Intercom / Gorgias (support tickets → at-risk signals)

### Advanced metrics
- [ ] Acquisition Quality Score (UTM source × CLV/churn)
- [ ] Margin-Aware Recommendations (requires product cost data)

---

# 📅 v2.5+ (months 12-18+)

Premium tier expansion + agency features. See [[19-Multi-Platform-Roadmap]] for platform expansion timing. Highlights:

- Magento / Adobe Commerce (enterprise tier)
- Saleor / Medusa (headless future)
- White-label option for agencies
- ML Privacy / Isolated Mode (Enterprise tier opt-out)
- Per-vertical custom ML models
- Quarterly Industry Benchmark Report (marketing strategy, requires 30+ merchants)

## Definition of MVP "done"

A friend connects their Shopify store, the system:
- Syncs their data without errors
- Computes correct segments and lifecycle stages
- Predicts CLV/NBP/Churn for each customer
- Generates 5+ priority programs with brand-voice copy
- Pushes one program successfully to Klaviyo as a working flow
- Tracks attribution after the flow runs
- Reports results in dashboard

If all of that works, MVP is shippable. Polish/launch can follow.

## Risks + mitigations

| Risk | Mitigation |
|------|------------|
| Shopify App Store rejection | Path A (custom app) bypass |
| ML accuracy below promise | Use rules-based fallback, label confidence |
| Klaviyo API rate limits | Queue + exponential backoff |
| LLM cost overrun | Cache aggressively, monitor per-client |
| Solo dev burnout | Friend's store as forcing function (real users = real motivation) |
| 4–5 month delay | Weekly checkpoint milestones, cut scope ruthlessly |

## Tooling decisions to make

These need decisions during build:

- [ ] Background jobs: Inngest vs Trigger.dev vs Supabase Edge Functions
- [ ] ML hosting: Railway vs Fly.io vs Modal
- [ ] Web crawler: Cheerio (cheap) vs Playwright (handles JS-heavy sites)
- [ ] LLM: Sonnet 4.6 default, Opus for monthly strategy?
- [ ] CSS framework: Tailwind + shadcn/ui (decided)
