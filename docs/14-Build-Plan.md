# 14 — Build Plan

## Total timeline: 18–20 weeks of evening/weekend work

Owner is full-time employed. Realistic capacity: ~10–15 hours/week.

## Phase breakdown

| Phase | Weeks | Hours est. | What |
|-------|-------|------------|------|
| 1. Foundation | 1–3 | 30–40 | Project setup, auth, basic dashboard |
| 2. Integrations | 3–6 | 50–70 | Stripe + Shopify OAuth, brand crawl, CSV |
| 3. Rules engine | 6–10 | 60–80 | Segmentation, stage logic, dynamic thresholds, scoring |
| 4. ML models | 10–13 | 50–70 | CLV (BG-NBD), NBP (collab filter), Churn |
| 5. LLM integration | 13–15 | 30–40 | Brand voice, copy generation, narrative reports |
| 6. Strategy generator | 15–17 | 40–50 | Combines rules + ML + LLM into program output |
| 7. Klaviyo export | 17–18 | 20–30 | One-click flow creation via API |
| 8. Reporting | 18–20 | 30–40 | Per-program performance, stage health, attribution |
| 9. Polish + testing | 20+ | ongoing | UI refinement, bug fixes, friend's-store testing |

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

## Phase 7 — Klaviyo export (weeks 17–18)

**Goal:** One-click "Push to Klaviyo" creates segment + flow + templates.

Tasks:
- [ ] Klaviyo API client
- [ ] Strategy → Klaviyo flow JSON translator
- [ ] Segment sync (live, dynamic)
- [ ] Template generator (HTML email)
- [ ] Test / dry-run mode
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

## Phase 9 — Polish + friend's-store testing (week 20+)

- [ ] Test on friend's Shopify store
- [ ] Iterate based on real-world data quirks
- [ ] UI polish, mobile responsive
- [ ] Onboarding flow refinement
- [ ] Documentation (in-app help)
- [ ] Bug fixes
- [ ] Performance tuning

## Critical path

The critical path (must work end-to-end before any other polish):

```
Stripe OAuth → Data sync → Rules engine → ML models → 
Strategy generator → Klaviyo push → Attribution
```

Anything blocking this chain is highest priority. Everything else is parallel work.

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
