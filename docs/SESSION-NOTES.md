# Session Notes — pick up here next time

## 📅 Session: 2026-05-07 evening — Widget Dashboard v2 finalization + v1.5 spec lockdown

### What got done
- ✅ **Widget Dashboard v2 polish complete (built earlier today)** — drag-resize via corner handle, drag-from-grid-to-library remove, sticky footer pattern (`flex-1 min-h-0` body + `flex-shrink-0` footer), header ↗ link override, dynamic subtitle override, content-fit audit on all 11 widgets. Schema migrated from named tiers (`size: 'small'|'medium'|'large'`) to raw `w`/`h` with `migrateLegacyWidget()` running once on load.
- ✅ **v1.5 spec finalized and saved as canonical** — `docs/v1.5-widget-dashboard.md` (1,503 lines). Replaces the original `WIDGET_DASHBOARD_V1.5_SPEC.md` draft in Downloads. All 6 corrections + 5 anomaly fixes baked in:
  1. **Vercel Cron API routes** throughout (NOT Inngest) — matches existing `/app/api/cron/*` pattern
  2. **v2 widget config schema** for all 5 new widgets (`defaultW/H` + `minW/maxW/minH/maxH` + `iconColor`)
  3. **Sticky footer + `useSetWidgetHeaderLink` + `useSetWidgetSubtitle` patterns** applied
  4. **Phase 0 added** — `lib/stats.ts`, `lib/dates.ts`, `lib/utils/flags.ts`, `lib/metrics/queries.ts`, `lib/cohorts/queries.ts` build before any widget work
  5. **Phase 1 added** — `merchants.country_code/country_name/currency/timezone` (drives holiday calendar) + `customers.country_code/country_name/region/city`
  6. **Anomaly seasonality stack** — day-of-week baseline (8 weeks, min 4 same-day samples), threshold layering (snoozed → sale 5σ → holiday 4σ → normal 3σ), auto sale detection (5 signals, 2+ to fire, `confidence_score` stored), country-aware holiday calendar (`date-holidays` + `moment-hijri` for 14 Islamic-calendar countries: AE/SA/KW/QA/BH/OM/EG/JO/MA/ID/MY/PK/BD/TR), quiet rollout via `merchants.anomaly_detection_enabled` boolean default `false`, cold-start guard <14 days, snooze UI in widget header → sets `merchants.anomalies_snoozed_until`, `merchant_detected_sales` table with `confidence_score NUMERIC(3,2)` + `merchant_confirmation` flow
- ✅ **Vercel Cron quota verified** — Pro plan: 100 cron jobs/project, no daily invocation limit. Currently 3 used. After v1.5: 6 used. **Headroom: 94.**
- ✅ **PROJECT-STATUS.md updated** — added full v1.5 status block with trigger conditions, revised 11-12 day effort, locked decisions, 7-phase breakdown, migration count
- ✅ **Build green** — `npm run typecheck` clean, `npm run build` succeeds (all 70+ routes compile, `/dashboard/grid` at 254 kB First Load JS)

### Files added/modified today
- NEW: `docs/v1.5-widget-dashboard.md` — canonical v1.5 spec (1,503 lines)
- MOD: `docs/PROJECT-STATUS.md` — added v1.5 finalized section, updated last-updated stamp, pointer from "deferred to v1.5" list to canonical spec

### What's NOT started (intentional — waiting for green light)
- **v1.5 implementation** — spec is locked but nothing built. Trigger conditions: 5+ paying merchants OR 3+ explicit deferred-widget requests OR anomaly detection becomes a sales objection. Days 17-21 come first.
- **v1 dashboard perf optimization** — three options offered (A: React `cache()` + SQL aggregation 30-45 min, B: server-side prefetch 1-2 hrs, C: SWR + B half day). User has not yet picked. Acceptable as-is for launch (2-3s initial load on `/dashboard/grid`).

### Next session — start here (2026-05-08)
Path to revenue continues — Days 17-21 of locked MVP scope:

1. **Day 17-18: Shopify Billing API** (~2 days)
   - GraphQL `appSubscriptionCreate` mutation
   - Subscription confirmation flow + return URL handling
   - Webhook handlers for `app_subscriptions/update` (active / cancelled / frozen / declined)
   - Wire into Settings → Billing page (currently "link to Shopify admin charges" placeholder)
   - 3 tier definitions: Starter / Pro / Scale (already in admin/billing dashboard)
   - 14-day trial via `trialDays` parameter
2. **Day 19: Production deploy** (~1 day)
   - Vercel + Railway domain setup
   - Add `CRON_SECRET`, `RESEND_API_KEY`, all Shopify env vars to Vercel prod
   - Verify all crons run in prod context
3. **Day 20: App Store listing assets** (~1 day prep)
   - Screenshots (4-6 required by Shopify)
   - App listing copy + privacy policy URL
4. **Day 21: Friend's-store live test + submit**

After submit → 4-8 weeks of Shopify review while iterating.

### Open carry-overs (non-blocking)
- `RESEND_API_KEY` still needed from resend.com before Day 12 (email delivery) goes live in prod
- `CRON_SECRET` needs to be added to Vercel env vars (already in `.env.local`)
- v1 dashboard perf decision (Option A/B/C) — defer until after launch unless real merchants flag it
- Health Score distribution widget on Overview (30-min quick win) — still pending from earlier session, low priority

---

## 📅 Session: 2026-05-05 morning — v1.1 quick wins (webhooks, auto-crawl, anomaly cron)

### What got done
- ✅ **Anomaly cron** — `/api/cron/detect-anomalies` GET endpoint, secured by `CRON_SECRET` Bearer header. Loops over active merchants, runs anomaly detector + LLM explainer, returns JSON summary. Schedule wired in `vercel.json`: Mondays 9 AM UTC. Verified locally: 1 merchant scanned, 0 anomalies, 183ms.
- ✅ **Auto-crawl on install** — OAuth callback now redirects to `/onboarding/setup?just_connected=1` (was `/dashboard?connected=...`). The setup runner picks up the `just_connected=1` query param via `useSearchParams` and **auto-fires the pipeline on mount** — no button click needed. The wizard's "Start setup" button still works as a fallback / manual retrigger.
- ✅ **Shopify webhooks** — register on install + receive + verify + process:
  - **Registration**: `lib/shopify/webhooks.ts` registers 6 topics with Shopify on OAuth callback (orders/create, orders/updated, orders/cancelled, customers/create, customers/update, app/uninstalled). Idempotent — swallows "already registered" errors.
  - **Receiver**: catch-all route at `app/api/webhooks/shopify/[...topic]/route.ts`. Verifies HMAC via existing `verifyWebhookHmac`. Persists raw event to `webhook_events` (with `hmac_verified=true`, `external_id`, `payload`). Processes by topic — upserts customer/order, or marks merchant uninstalled.
  - **Resilience**: returns 200 even if processing fails (event still persisted; can be replayed later). Updates `webhook_events.error` for failures.
  - **Verified end-to-end**: posted a synthetic `customers/create` event with valid HMAC → customer row created in DB → audit trail row shows `hmac_verified=true`, `processed_at` set, `error=null`. Missing HMAC → 400. Forged HMAC → 401.
- ✅ **`CRON_SECRET`** generated (64-char hex) and added to `.env.local`. Must also be added to Vercel env vars before deploy.

### Files added/modified
- NEW: `app/api/cron/detect-anomalies/route.ts`
- NEW: `app/api/webhooks/shopify/[...topic]/route.ts`
- NEW: `lib/shopify/webhooks.ts`
- NEW: `vercel.json`
- MOD: `app/api/connect/shopify/callback/route.ts` — registers webhooks on install (fire-and-forget); redirects to `/onboarding/setup?just_connected=1`
- MOD: `components/SetupRunner.tsx` — auto-starts pipeline on mount when `just_connected=1` or `auto=1` query param present

### What's NOT done yet (future v1.1+)
- **Email notification** when anomaly cron fires a critical anomaly. Currently merchants must visit dashboard to see them. Add via Resend / Postmark integration.
- **Webhook retry queue** for permanently-failed processing. Right now we log error but no automatic retry. For MVP this is fine — Shopify retries delivery automatically.
- **Email delivery of monthly reports** (deferred — separate feature, needs email infra).

### Next session — start here
Now that v1.1 polish is done, the path to revenue:
1. **Shopify Billing API** + Privacy/ToS + production deploy (~3 days)
2. **App Store listing** + screenshots (~1 day prep)
3. **Submit** → 4-8 weeks of Shopify review while you iterate
4. **Health Score distribution widget on Overview** (30-min quick win) — still pending from yesterday

---

## 📅 Session: 2026-05-04 evening (final) — Offer-framework correction + roadmap discussion

### What got done
- ✅ **CLV visibility on Overview** — added a "Predicted Customer Lifetime Value" section with 4 stat cards (Total / Median / Top-10% / Avg churn). Previously CLV was only visible drilling into customer detail.
- ✅ **Recommendations page** (`/dashboard/recommendations`) — new sidebar entry. Shows NBP table (filterable by rank #1-#5) + "most-recommended products" summary. Bottom section now has 4 separate offer-framework matrices (NBO+NBP / Habit-forming / Save-Retention / Win-back).
- ✅ **🔴 Critical CLM domain correction (Kazim's banking expertise)** — refactored offer labeling per lifecycle stage:
  - **NBO and NBP are engagement-stage tools only** (active customers in buying mode)
  - Win-back / save / retention programs use a **different framework** (recovery psychology, not optimization)
  - Added `OfferCategory` type in `lib/strategy/programs.ts` with 6 categories: `nbo`, `nbp_led`, `first_to_second`, `save`, `atrisk_save`, `winback`
  - Each program template now declares its category. Helper `getOfferCategoryForKey()` derives it at read time (no migration needed).
  - Updated UI everywhere: strategy list cards, strategy detail callouts, Recommendations page matrices.
  - **Orchestrator change**: NBP product attachment is now scoped to engagement / first-to-second programs only. Win-back/save programs no longer get a product attached even if their offer type was set that way — preventing "pushing a product into a recovery email" UX mistakes.
- ✅ Documentation: this principle is now locked into the type system. Future programs MUST declare their `offerCategory`, so the UI can't accidentally mislabel a win-back offer as "NBO".

### Bugs found + fixed
- Print CSS: `page-break-inside: avoid` was forcing the entire report card to page 2, leaving page 1 blank. Replaced with natural flow + `page-break-after: avoid` on headings only.
- Markdown renderer didn't handle numbered lists or italics. Added support for both.
- Webpack/`.next` cache corrupted after rapid file additions. Fix: `rm -rf .next && npm run dev`.

### Discussion captured (for later)

**Post-MVP roadmap brainstorm** (full discussion in conversation log; key strategic points):
- **v1.1**: webhooks, auto-crawl, auto-sync, anomaly cron, email delivery of monthly reports
- **v1.5**: Klaviyo/Mailchimp/Customer.io direct push, Saturation/Fatigue Detection, Replenishment Layer, Customer Concierge Timeline, Predicted-vs-Actual public widget, Holdout testing for causal attribution, remaining LLM prompts (NBP reasoning, Q&A, subject variants, stage transition audit)
- **v2**: BigCommerce + WooCommerce, Acquisition Quality Score, Margin-Aware Recommendations, ML Privacy / Isolated Mode (enterprise), Conversational onboarding, Today View, Quarterly Industry Benchmark Report
- **v2.5 — MENA play (Kazim's strategic edge)**: Salla, Zid, Arabic LLM copy, MENA benchmarks, Mada/STC Pay/Tabby integration. **This is the moat that makes the company acquirable** — Western CLM tools don't speak Arabic or integrate Saudi/UAE platforms.
- **v3+**: Magento, Custom rule builder UI, A/B testing framework, Loyalty integrations, Ad platform push, White-label/agency tier, Public API, Enterprise tier (SSO, audit logs, data residency)
- **Acquisition story**: v1.5 + early v2 = Series A ready. v2.5 MENA = strategic exit candidate at $50-150M to Klaviyo / Shopify / agency conglomerate.

### Open question for next session
Kazim asked "where is the scoring thing" — we have **6 different scoring concepts** in the product:
1. **Customer Health Score (0-100)** — composite, 5 sub-scores. Visible on customer table + customer detail. **Not yet on Overview dashboard.**
2. Predicted CLV (90/180/365)
3. Churn probability
4. NBP score (ALS)
5. Voice-match confidence
6. Lifecycle stage + Value tier

**Suggested addition for next session**: Add a "Health Score distribution" widget to Overview dashboard so you can see overall account health at a glance. Buckets: critical (<40), at-risk (40-55), neutral (55-70), healthy (70+).

### Next session — pick from
1. **Add Health Score distribution to Overview** (small win, ~30 min)
2. **Shopify Billing API + Privacy/ToS + Production Deploy** (the "go live" path, ~3 days)
3. **App Store submission prep** (1 day prep, 4-8 wk Shopify review)
4. **v1.1 quick wins**: webhooks, auto-crawl, auto-sync, anomaly cron (each ~half day)

Recommend (2) since it unblocks revenue; (1) can be a 30-min warmup at the start of next session.

---

## 📅 Session: 2026-05-04 (continuation) — Onboarding + customer detail + UX polish

### What got done
- ✅ **Customer detail page** (`/dashboard/customers/[id]`) — header with stage/tier badges, top stats (health/CLV/churn), 5 health sub-scores with bars, CLV across 3 horizons (90/180/365), top-5 NBP recommendations with scores, order history table, health-score trend snapshot list. Customer rows in the list table now link to detail.
- ✅ **Onboarding wizard** (`/onboarding`, `/onboarding/connect`, `/onboarding/setup`) — 4-step flow (Welcome → Connect store → First setup → Done) with step indicator. Setup step runs the **full pipeline server action** (sync → score → brand voice → strategy) with live status indicators per step (spinner / ✓ / ✗ / skip) and per-step duration display. Falls through gracefully on partial failure.
- ✅ **Dashboard redirect logic** — no merchant → `/onboarding` ; merchant but no metrics → `/onboarding/setup` ; otherwise → render dashboard.
- ✅ **Loading state polish** — `RegenerateStrategyButton` shows a real spinner + "Generating… (~45s)" text while pending instead of just "Generating…".
- ✅ **Error pages** — `app/not-found.tsx` (404 with link back to dashboard) + `app/error.tsx` (error boundary with "Try again" / "Back" + error digest for support).

### New components (`components/`)
- `StepIndicator.tsx` — wizard progress bar (1-4 steps with check/current/pending states)
- `SetupRunner.tsx` — client component that calls the setup server action and renders per-step status

### New server action
- `app/onboarding/setup/actions.ts > runFirstTimeSetup()` — orchestrates sync + rules + brand voice + strategy in sequence, returns per-step `{status, detail, durationMs}` for UI rendering. Doesn't bail on partial failure — each step runs in its own try/catch.

### Bugs fixed
- `syncMerchantData` parameter order: it expects `(merchantId, pg)` not `(pg, merchantId)` — caught by typecheck.
- `runRulesEngine` returns `customerResult.customersComputed` (not `totalCustomers`) — caught by typecheck.

### Verified
- All routes return 200 (signed-out users redirect to `/signin`, signed-in users with no merchant redirect to `/onboarding`).
- Typecheck clean except pre-existing `lib/shopify/sync.ts` `any`-warnings.

### Next session — start here (still 2 paths)
1. **Shopify Billing API + Privacy/ToS + Production Deploy** (the "can charge money + go live" path, ~3 days):
   - Shopify Billing API integration on the connect flow (charge $99/mo on install)
   - Privacy Policy + ToS pages (templates exist, customize)
   - Vercel deployment for Next.js, Railway deployment for Python ML service
   - Domain + DNS
2. **App Store submission prep** (~1 day prep, 4-8 wk Shopify review):
   - Listing copy, screenshots, demo video
   - Support email + docs page
   - Submit (must come AFTER #1 since Shopify needs the live URL)

Recommend doing #1 first since #2 needs the live URL anyway. After submission, Shopify review takes 4-8 weeks during which you can do v1.1 features (webhooks, auto-crawl, anomaly cron, email delivery of monthly reports).

---

## 📅 Session: 2026-05-04 → 05-05 (continuation) — Phases 6 + 7 + 8 done

### What got done in this session
- ✅ **Phase 6 — Strategy generator** (`lib/strategy/{programs,orchestrator}.ts` + `lib/llm/prompts/segment-copy.ts`):
  - 7 program templates: VIP Win-back, Standard Win-back, At-Risk Save, Slipping Rescue, First-to-Second Push, VIP Retention Touch, Active Cross-Sell
  - Orchestrator runs eligibility queries → estimates impact (audience × response × CLV) → calls Claude Sonnet for per-segment copy → persists to `strategy_programs` table
  - **Verified on dev store**: 7 programs generated, 28 customers total audience, **$39,055 estimated impact**, $0.046 LLM cost, 45s
  - Migration `0006_strategy_programs.sql`
- ✅ **Phase 8 — Dashboard UI** (Next.js Server Components + Tailwind):
  - **Sidebar nav** + 6 pages: Overview, Customers, Strategy (list + detail), Reports (list + detail), Brand profile, Connect store
  - **Overview page**: Revenue at Risk hero, lifecycle/tier distribution bars, top-line stats (customers, revenue, AOV, repeat rate)
  - **Customers page**: filterable table (by stage / tier), sorted by predicted CLV, with badges
  - **Strategy page**: program list sorted by priority, with audience size + estimated impact + status
  - **Strategy detail**: subject variants (with copy buttons), preview text, body, CTA, audience table, CSV export link
  - **"Regenerate strategy" button**: server action wraps the orchestrator and revalidates the page on completion
  - **Reports**: monthly narrative list + markdown viewer (uses minimal in-house renderer — no external dep)
  - **Brand profile viewer**: voice, target customer, key claims, top categories, voice samples
  - Reusable components: `Sidebar`, `StatCard`, `DistributionBars`, `Badge` (Stage/Tier/Status), `CopyButton`, `RegenerateStrategyButton`
- ✅ **Phase 7 — CSV exports**:
  - `GET /api/export/strategy/[id]/csv` → audience + program copy as CSV (one row per customer with the email subject/body included)
  - `GET /api/export/customers/csv?stage=&tier=` → all customers (or filtered) with stage/tier/health/CLV/churn fields
- ✅ **Bug fix**: orchestrator was producing negative impact for new-customer segments where BG/NBD predicted negative CLV. Now floors at `max(avgClv, 0.3 × avg actual spend)` to give a sensible baseline.

### Stack so far
- 6 SQL migrations applied (`0001`–`0006`)
- LLM cost per merchant: ~$0.05 (brand voice) + ~$0.07 (monthly narrative) + ~$0.05 (strategy regen) = **~$0.17 per regeneration cycle**
- Dev server runs cleanly on port 3002 (3000/3001 taken). All 6 dashboard routes return 200 / redirect properly.

### ⚠️ Things to know for next session
- **Type warnings in `lib/shopify/sync.ts`** (lines 77, 80, 128, 152, 155) — pre-existing, not new. Implicit `any` types. Worth cleaning up but not blocking.
- **Brand profile is required** for strategy regen. If brand_profiles row is missing, the orchestrator throws a clear error. For dev store, we used `allbirds.com` as the public site (dev stores are password-gated).
- **Anomaly detector still awaiting second snapshot** — only fires after a 2nd `customer_health_history` row exists with different values.

### Next session — start here
**Either**:
1. **Polish & deploy preparation** (Week 14 of build plan):
   - Onboarding wizard (4-step welcome → connect Shopify → first sync → first strategy)
   - Loading states + skeleton screens (currently no spinners on dashboard)
   - Empty states refinement (e.g. "no programs yet, here's what's coming")
   - Mobile responsive review
   - Customer detail page (`/dashboard/customers/[id]`) — currently stub-able
2. **Phase 9 — App Store submission prep**:
   - Listing copy + screenshots
   - Pricing page (Shopify Billing API integration — Shopify takes 0% on first $1M, then 15%)
   - Privacy policy + ToS
   - Support email + docs page
3. **Deferred Phase 2 polish**: webhooks, brand auto-crawl on install, auto-sync on install. Half-day each.

Recommend (1) first — gets the experience tight before App Store reviewers see it.

---

## 📅 Session: 2026-05-04 → 05-05 (continuation) — Phase 5 LLM layer done

### What got done in this session
- ✅ **LLM client** (`lib/llm/client.ts`) — Anthropic SDK wrapper with model selection (Sonnet 4.6 / Opus 4.7 / Haiku 4.5), JSON-mode helper, cost tracking. Note: Opus 4.7 doesn't accept the `temperature` param — client handles this.
- ✅ **Brand voice extraction** (`lib/brand/{crawler,extract}.ts` + `lib/llm/prompts/brand-voice.ts`) — Prompt 1 from spec. Crawls homepage/about/policies/collections, sends to Claude Sonnet, persists structured profile to `brand_profiles`. **Verified on Allbirds**: extracted "purposeful, understated, optimistic" voice with 5 verbatim sample sentences, accurate B Corp / sustainability claims, "high" confidence, $0.045 cost, 21s.
- ✅ **Monthly narrative report** (`lib/reports/narrative.ts` + `lib/llm/prompts/narrative-report.ts`) — Prompt 4 from spec. Pulls metrics + top CLV customers, sends to Claude Opus, persists markdown to `merchant_reports`. **Verified on dev store**: produced specific, actionable April report citing real customer names ($42k CLV for Tianna Predovic) and concrete May actions, $0.069 cost, 14s.
- ✅ **Anomaly detector** (`lib/anomalies/detect.ts` + `lib/llm/prompts/anomaly.ts`) — Prompt 5 from spec. Compares latest health-history snapshot with previous; flags health-drop, churn-spike; LLM generates 2-3 hypotheses per anomaly. Awaiting second snapshot to fire (only one exists currently).
- ✅ **Migration 0005** — `merchant_reports` + `anomalies` + `llm_cache` tables, with RLS.
- ✅ **CLI scripts**: `extract-brand-voice.ts`, `generate-monthly-report.ts`, `detect-anomalies.ts`, `test-brand-voice.ts` (uses public domain since dev store is password-gated).
- ✅ **`@anthropic-ai/sdk` v0.93.0** added to package.json.
- ✅ **Bug fix**: `merchant_metrics.repeat_purchase_rate` is stored as a decimal (0.656); narrative loader was sending raw to LLM. Fixed by × 100 before passing to prompt.

### ⚠️ Notes for next session
- **API key in chat history**: Kazim pasted his Anthropic key in the conversation; rotate at console.anthropic.com when convenient.
- **Dev store has no public storefront** — Shopify dev stores 302 to a password page. For real brand-voice testing use a public Shopify URL via `scripts/test-brand-voice.ts`.

### Cost estimates per merchant per month (Phase 5)
- Brand voice: 1× extract = ~$0.05 (quarterly = $0.20/year)
- Monthly narrative: 1× = ~$0.07 (annually = $0.84/year)
- Anomaly explanations: ~5/month × $0.005 = ~$0.025/month
- **Total LLM cost per merchant: ~$1.50–2/year** — comfortably under the $25/mo ML budget cap.

### Next session — start here
Two paths, your call:
1. **Phase 5.5 — remaining LLM prompts**: per-segment copy generation (Prompt 2), NBP reasoning (Prompt 3), Q&A (Prompt 6), subject variants (Prompt 7), stage-transition audit (Prompt 8). These need campaign infrastructure first; better to wait until Phase 6.
2. **Phase 6 — Dashboard UX** (per [[14-Build-Plan]] Weeks 13-14): merchant-facing pages that surface what we've built — Health Score widget, Revenue at Risk hero, lifecycle distribution chart, customer detail drilldown, monthly report viewer, brand profile editor.
3. **Deferred Phase 2 polish**: webhooks, brand profile auto-crawl on install, auto-sync on install. Quick wins (~half-day each).

Recommend Phase 6 next — gives Kazim a visible product to demo, and we can iterate Phase 5.5 alongside the campaign features when they exist.

---

## 📅 Session: 2026-05-04 → 05-05 (continuation) — Phase 3 + Phase 4 done

### What got done
- ✅ **Phase 3 — Rules engine (TS):** merchant metrics (medians, percentiles, repurchase cycle, repeat rate, concentration, discount dependency), per-customer metrics (RFM, lifecycle stage, value tier, health score), Revenue at Risk, health-score history snapshot. Files: `lib/rules/{stats,merchant-metrics,customer-metrics,compute}.ts`.
- ✅ **Phase 4 — Python ML stack:** FastAPI service at `ml-service/` with Python 3.12.10 venv. Models:
  - **CLV:** BG/NBD + Gamma-Gamma via `lifetimes` library (`app/models/clv.py`)
  - **NBP:** Alternating Least Squares via `implicit` library (`app/models/nbp.py`)
  - **Churn:** BG/NBD-based for e-com (uses CLV's P(alive)) (`app/models/churn.py`)
  - Endpoints: `POST /score/{clv|nbp|churn|all}/{merchant_id}`
- ✅ **TS↔ML wire-up:** `lib/ml/client.ts` calls Python service via `ML_SERVICE_URL`. `lib/rules/compute.ts` runs ML scoring **between** customer-metrics and Revenue at Risk so RaR uses ML-predicted CLV × churn.
- ✅ **Verified end-to-end on dev store** (`lifecycle-dev-test.myshopify.com`, 32 customers, 92 orders, $220k revenue):
  - 28 customers got CLV scored (median 365d CLV $6,424, P90 $15,911, avg P(alive) 88%)
  - 135 NBP recommendations generated across 28 customers / 17 products
  - 6 high-risk + 25 low-risk customers per BG/NBD churn
  - Revenue at Risk = $3,414 across 2 at-risk customers
  - Full pipeline runs in ~21 seconds

### ⚠️ Important constraint
**Python 3.14 will NOT work** — `lifetimes` / `implicit` / `lightgbm` don't have wheels for it. Stick with **Python 3.12.10** (installed via winget). Venv lives at `ml-service/.venv/`.

### Next session — start here
**Phase 5 — LLM layer** (per [[16-AI-Brain-Spec]]). Priority order for MVP:
1. **Brand voice extraction** (Prompt 1) — foundation for all other prompts. Crawler + Claude Sonnet → `brand_profiles` table.
2. **Monthly narrative report** (Prompt 4) — biggest perceived value for merchant. Reads merchant_metrics + customer_metrics → produces digest. Needs new `merchant_reports` table.
3. **Anomaly explanation** (Prompt 5) — uses rules-engine signals.
4. **Stage-transition audit** (Prompt 8) — explainability. Needs transition log table.

Defer to Phase 5.5 (post-campaign infra): per-segment copy gen, NBP reasoning, Q&A, subject variants.

### Deferred Phase 2 polish (still pending)
- Webhooks (orders/create, customers/update, app/uninstalled)
- Brand profile crawler (sites of merchants for voice extraction — feeds Phase 5 prompt 1)
- Auto-sync on install (currently triggered manually)

---

## 📅 Session: 2026-05-05 — Spec hybrid + Shopify-first

### What got done
- 📥 User shared `PRODUCT_SPEC.md` (2,126 lines) — alternative spec to compare against ours
- 🔍 Full gap analysis between our 18 docs and PRODUCT_SPEC
- ✅ **Lifecycle framework upgraded:** 6 stages → **7 stages + 3 tiers + behavior badges** (see [[02-Lifecycle-Framework]])
- ✅ **Median replaces mean** for all repurchase cycle calculations
- ✅ **Threshold strategy locked:** Option A (multipliers) for MVP, Option B (percentiles) auto-upgrade at >200 customers
- ✅ Decisions logged in [[15-Decisions-Log]]

### ✅ Adopted in this session (now in docs)

🔴 **Tier 1 — Differentiating metrics (added to [[18-Differentiating-Metrics]] doc):**
1. ✅ Customer Health Score (0-100 composite per customer with 5 sub-scores)
2. ✅ Revenue at Risk (merchant-level dollar hero metric)
3. ✅ First-to-Second Purchase Tracker (dedicated metric with industry benchmarks)
4. ✅ Customer Concentration Risk (Pareto top-10% concentration)
5. ✅ Discount Dependency Score (per-customer + merchant-wide)

🏗️ **Architecture decisions (locked):**
- ✅ Pricing tier update: **$99/$249/$599/$999** (was $39/$99/$249/$499)
- ✅ Distribution: **Shopify-first + Shopify Billing API + App Store from day 1** (was Stripe-first)
- ✅ Build timeline: **19-21 weeks** (was 18-20)
- ✅ App Store submission begins Week 14 (4-8 week review window)

### Still pending (deferred to v1.5 / v2):

🟡 **Tier 2 — v1.5+ features:**
6. Klaviyo full integration (read engagement + push flows)
7. Saturation/Fatigue Detection (cross-channel touch tracking)
8. Replenishment Layer (subscription opt-in detection)
9. Customer Concierge Timeline (full event log per customer)
10. Predicted vs Actual public widget (credibility builder)
11. Holdout testing for causal attribution

🟢 **Tier 3 — v2+ items:**
12. ML Privacy Framework + Isolated Mode (enterprise tier opt-out) — needs new doc 19-ML-Privacy.md
13. Acquisition Quality Score (UTM source × CLV/churn)
14. Margin-Aware Recommendations (profit, not revenue)
15. Conversational LLM-driven onboarding (vs static wizard)
16. Quarterly Industry Benchmark Report (marketing strategy — separate from product features)
17. Today View as primary daily screen (UX framing — Phase 6 implementation detail)

### ✅ Resolved 2026-05-05
- Dev server / Tailwind issue: fixed by clearing `.next/` cache + fresh `npm run dev`
- Auth flow verified end-to-end (signup → email verify → dashboard)
- Dashboard placeholder updated to reflect Shopify-first plan

### Next session — start here
1. **Phase 2 — Shopify integration** (Weeks 3-6 of plan)
   - Spawn Ruflo swarm: 1 architect + 2 backend-dev coders + 1 tester
   - Build: Shopify OAuth, Bulk Operations sync, webhook handlers, brand profile crawler, CSV upload fallback
   - Use Shopify dev store for testing (no approval needed for custom apps)
   - Milestone: dev store data syncs end-to-end
2. Optional: write [[20-ML-Privacy]] doc (Isolated Mode framework) — only matters when multi-tenant ML kicks in (v1.5+)

### Prerequisites for next session
- [ ] Shopify Partner account created (https://partners.shopify.com)
- [ ] Dev store created (xxxxx.myshopify.com)
- [ ] Shopify Partner API credentials accessible (Partner Dashboard → Apps → Create app)

### Files updated this session
- `02-Lifecycle-Framework.md` — 7+3 framework, median, multiplier thresholds
- `03-Segmentation.md` — 3 tiers (Standard/Premium/VIP), 7 stages
- `11-Integrations.md` — **Shopify-first** (was Stripe-first), Shopify Billing API, CSV fallback
- `12-Pricing.md` — **$99/$249/$599/$999** tiers
- `14-Build-Plan.md` — 19-21 weeks, integrated metrics into Phase 3 + 7
- `15-Decisions-Log.md` — 6 new dated decisions
- `18-Differentiating-Metrics.md` — **NEW** — Health Score, Revenue at Risk, First-to-Second, Concentration Risk, Discount Dependency
- `19-Multi-Platform-Roadmap.md` — **NEW** — Adapter pattern, BigCommerce + WooCommerce + Salla + Zid + Magento expansion roadmap. **MENA (Salla/Zid) flagged as founder's unique strategic edge**
- `README.md` — Shopify-first positioning
- `SESSION-NOTES.md` — this file

---

## 📅 Earlier session: 2026-05-04

### What got done
- ✅ Project scaffolding (folder structure, .gitignore, README, CLAUDE.md)
- ✅ 18 spec docs written in `docs/` (00-Overview through 17-MVP-Tech-Spec)
- ✅ Memory entries saved to `~/.claude/projects/.../memory/`
- ✅ Obsidian vault working (open `docs/` folder as vault)
- ✅ Git repo initialized
- ✅ GitHub: pushed to `https://github.com/advancedtechhd-a11y/CLM` (private, branch `main`)
- ✅ **Week 1 build:** Next.js 14.2 + TypeScript + Tailwind + React 18.3 — dev server runs, build passes
- ✅ **Week 2 build:** Supabase auth flow — signup, signin, forgot-password, callback, signout, middleware
- ✅ Supabase project provisioned (`mltmjlnyhfhorvrldpuv`)
- ✅ `.env.local` configured with URL + anon key + service_role key

### ⚠️ Known issue (fix this first next session)
At end of session, user tested signup at localhost:3000/signup and reported:
- No Tailwind styling visible (pages look like plain HTML)
- Sign up button doesn't respond when clicked

**Likely cause:** Dev server was started before Tailwind config files existed; cache is stale.

**Fix to try first:**
```
# Stop dev server (Ctrl+C in its terminal)
cd C:\Users\Gamer1\lifecycle-dev
rmdir /s /q .next
npm run dev
# Then hard-refresh browser with Ctrl+Shift+R
```

If still broken: check browser DevTools (F12) → Console tab → look for red errors. Also check the `npm run dev` terminal output for compilation errors.

### Outstanding items
- 🔄 **Rotate Supabase service_role key** (user pasted it in chat — should generate fresh one)
- 🔄 Verify signup → email verification → dashboard flow works end-to-end after dev server fix
- 🔄 Set up Supabase email template branding (Settings → Auth → Email Templates) — optional, can wait

### Where we are in the build plan
| Week | Status |
|------|--------|
| Week 1: Project scaffolding | ✅ Done |
| Week 2: Auth flow | ✅ Done (pending verification) |
| **Week 3: Dashboard shell + sidebar + settings** | ⏭ Next up |
| Week 4: Stripe Connect integration | Pending |
| Weeks 5-20 | See [[14-Build-Plan]] |

### Tomorrow's session — start here
1. Fix the dev server / Tailwind issue (steps above)
2. Verify signup flow works end-to-end (sign up → check email → click verification → land on /dashboard)
3. Begin Week 3:
   - App layout shell (sidebar + header + main)
   - Settings pages (account, billing, team)
   - Brand creation flow (user creates their first brand entity)
   - Empty placeholders for Strategy, Segments, Customers, Reports pages

### Useful commands reference
```bash
# Dev server
cd C:\Users\Gamer1\lifecycle-dev && npm run dev

# Build (sanity check)
npm run build

# Git
git add . && git commit -m "..." && git push

# Database (Supabase) — when needed
# Web dashboard: https://supabase.com/dashboard/project/mltmjlnyhfhorvrldpuv
```

### Files created in this session (cumulative)
- `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- `app/(auth)/layout.tsx` + `signup/page.tsx` + `signin/page.tsx` + `forgot-password/page.tsx`
- `app/(app)/layout.tsx` + `dashboard/page.tsx`
- `app/auth/callback/route.ts` + `auth/signout/route.ts`
- `lib/supabase/client.ts` + `server.ts` + `middleware.ts`
- `middleware.ts` (root)
- `.env.example` + `.env.local`
- 18 spec docs in `docs/`
- Memory entries

### Three commits on `main`
```
4fd1541 docs: log GitHub repo creation
ba6b02a Week 2: Supabase auth (signup, signin, forgot-password, middleware)
86949d8 Week 1: Next.js 14 + TypeScript + Tailwind scaffolding
52fe709 Initial commit: project scaffolding + spec docs
```
