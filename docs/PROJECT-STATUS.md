# LifecycleAI — Project Status

**Last updated:** 2026-05-08 evening (**v1.5 widget dashboard SHIPPED + Phase 8 scale hardening SHIPPED**. 5 new widgets, 8 active crons all chunked, 23 migrations applied, 11-entry Ops Runbook. Day 17-21 launch plumbing remains. See "v1.5 — BUILT" section + "Phase 8 — Scale Hardening" section below.)
**Sessions logged:** see `SESSION-NOTES.md`
**Master plan:** see `14-Build-Plan.md`
**MVP work plan:** see locked scope at top of this file (Days 1-21)

## 🟢 Locked MVP scope progress (21-day plan)

| Day | Item | Status |
|-----|------|--------|
| 1-5 | DNA layer (per `DNA_IMPLEMENTATION_GUIDE.md`) | ✅ COMPLETE — migration 0007, assembly job, API endpoint, DNA card UI, Step 5 verification all passing |
| 6-8 | Cart abandonment program | ✅ COMPLETE — checkouts webhooks, recovery linking, 8th program template, /api/cron/process-cart-abandonments (every 30 min), Overview hero |
| 9-11 | "Why" reasoning prompts (3 surfaces) | ✅ COMPLETE — 3 specialized prompts, 3 cache-backed API endpoints, WhyButton component, wired into Strategy detail / Customer detail / DNA card. ~$0.012 per merchant per cycle (then cached) |
| 12 | Email delivery (Resend) + Settings page | ✅ COMPLETE — Resend SDK, HTML+text email template, `/api/cron/email-monthly-reports` (1st of month). Simple Settings replaced by full sidebar layout (see below). **Pending**: `RESEND_API_KEY` from resend.com. |
| 13-15 | Form-based segment builder (minimal) | ✅ COMPLETE — migration 0008, segment library + safe SQL builder, 3 pages (list/new/detail), CSV export. SQL-injection-safe. |
| 16 | Public marketing site | ✅ COMPLETE — `/`, `/pricing`, `/privacy`, `/terms`. Full SaaS landing page (hero + dashboard mockup + problem/feature/comparison/architecture sections + final CTA). |
| **+** | **Admin Panel (Tiers 1-3)** | ✅ **COMPLETE — 24 pages added, see new section below** |
| **+** | **Settings expansion (Tiers 1-2)** | ✅ **COMPLETE — 9-section sidebar layout, see new section below** |
| **+** | **Full shadcn/ui design system refactor** | ✅ **COMPLETE — 60+ pages migrated, teal #0F6E56 primary, dark mode tokens ready, see new section below** |
| **+** | **Customizable widget dashboard v1** | ✅ **COMPLETE — 11 widgets, drag/resize/add/remove/undo/reset, lives at `/dashboard/grid` alongside classic, see new section below** |
| 17-18 | Shopify Billing API + Settings billing wiring | ⏳ Pending |
| 19 | Production deploy (Vercel + Railway + domain) | ⏳ Pending — **TWO deploy gates** before declaring complete: (1) verify v1.5 anomaly rollback path live (see Ops Runbook entry 6 — swap vercel.json path, confirm legacy cron fires, swap back); (2) verify Resend duplicate-send behavior — send a test email twice with the same `idempotencyKey` via the production Resend account, capture actual HTTP response codes and error messages, document the observed behavior in Ops Runbook entry 11 |
| 20 | App Store listing assets | ⏳ Pending |
| 21 | Friend's-store live test + submit | ⏳ Pending — also the live verification of seasonality detector on real merchant data (seeded dev data too thin to trigger 3σ; real merchant volume needed to confirm threshold tuning) |

**Locked MVP: 16 of 21 days complete (~76%).**
**Plus:** ~25 days of additional in-scope work (Admin Panel + Settings expansion) ✅ done.

---

## 🛠️ Admin Panel — COMPLETE (Tiers 1-3, 24 pages)

Internal control panel at `/admin/*`. Requires email in `admin_users` table.

### Tier 1 — Operations (12 routes)
- `/admin` — overview with platform stats + recent audit log
- `/admin/merchants` — directory with search/filter/pagination
- `/admin/merchants/[id]` — detail with 4 tabs (Overview / Activity / Billing / Support)
- `/admin/support` — inbox (list + detail + reply form, emails via Resend if configured)
- `/admin/billing` — MRR, tier breakdown, recent installs
- `/admin/billing/failed-payments` + `/refunds` — placeholders for Day 17-18
- `/admin/system` — health overview
- `/admin/system/crons` — scheduled job documentation
- `/admin/system/errors` — webhook error log (last 7 days)
- `/admin/system/api-usage` — Anthropic spend per merchant + per prompt
- `/admin/system/webhooks` — per-event-type stats + recent events

### Tier 2 — Analytics (5 pages)
- `/admin/analytics/onboarding` — 5-step funnel + weekly cohort table
- `/admin/analytics/feature-usage` — adoption % per feature, power users, under-using
- `/admin/analytics/cohort-retention` — heatmap of 12 install months × 12 retention months
- `/admin/analytics/cancellations` — monthly trend + recent cancellations
- `/admin/analytics/ai-costs` — spend dashboard with margin alert (>50% MRR)

### Tier 3 — Scaling (7 pages)
- `/admin/segmentation` — 6 pre-built merchant segments + drill-down list
- `/admin/promotions` + `/new` — promo code CRUD with tier targeting + usage limits + expiry
- `/admin/settings/audit-log` — super_admin-only filterable audit trail
- `/admin/settings/feature-flags` — toggle global + rollout % + tier overrides
- `/admin/settings/email-templates` — markdown editor for transactional emails (welcome, billing failed, trial ending)
- `/admin/settings/rate-limits` — per-merchant override list (enforcement is v1.5)
- `/admin/settings/team` — super_admin-only invite/deactivate flow

### Admin actions all audit-logged
Add note · Suspend / reactivate · Force re-sync · Regenerate strategy · Impersonate · Create ticket · Reply (with email) · Internal notes · Mark resolved/pending · Assign · Create promo · Toggle promo · Upsert flag · Upsert email template · Set rate-limit override · Invite admin · Deactivate admin

### Tier 4 (Forecasting / Cost-per-feature / Merchant Health Scoring / Compliance)
**Deferred per scope** — build when you have 100+ merchants.

### To activate yourself as super_admin
```sql
INSERT INTO public.admin_users (email, name, role)
VALUES ('your-signin-email@example.com', 'Kazim', 'super_admin');
```
Then visit `localhost:3002/admin`.

---

## ⚙️ Settings Page — COMPLETE (Tiers 1-2, 9 sections)

Merchant-facing at `/dashboard/settings/*` with sticky sidebar layout.

### Tier 1 — Required (5 sections)
- `/account` — display name, timezone (12 IANA zones), language (locked English with Arabic v2 stub), password reset, sign out, account deletion docs
- `/shop` — connected store info, last sync, permissions list, disconnect via Shopify admin
- `/billing` — current plan card, pricing tiers reference, link to Shopify admin charges
- `/notifications` — master toggle + 5 sub-toggles + notification email + quiet hours (auto-save on change)
- `/team` — v1.1 placeholder card

### Tier 2 — Should-have (4 sections)
- `/brand-voice` — voice profile + samples + key claims + re-extract button
- `/strategy` — risk tolerance + discount range + auto-approve threshold + channels + cycle override
- `/privacy` — retention slider + anonymization + GDPR data export + deletion request
- `/integrations` — Shopify (live) + Klaviyo / Postscript / Mailchimp / Yotpo / Smile placeholders (v1.5)

### Tier 3 — Power user features
**Deferred per scope** — Customizations, Reports & Exports, Advanced

---

## 🎨 Design system — shadcn/ui (NEW)

Full visual refactor migrating from rough Tailwind utility classes to a real component system.

### Foundation
- **shadcn/ui** as primary component library — Card, Button, Input, Label, Select, Switch, Tabs, Table, Dialog, DropdownMenu, Avatar, Badge, Alert, Progress, Sheet, Tooltip, Popover, Separator, Skeleton, Textarea (19 core components in `components/ui/`)
- **Lucide React** for all icons (replaced ~80% of emoji usage on key pages)
- **Theme tokens** in `app/globals.css` — light + dark mode CSS variables
- **Tailwind config** extended with: primary/secondary/destructive/warning/success/muted/accent/popover/card/sidebar/chart token namespaces
- New `lib/utils.ts` with `cn()` helper

### Brand
- **Primary: teal `#0F6E56`** (HSL 165 78% 24%) — replaces blue across CTAs, links, focus rings
- **Destructive: red `#A32D2D`** — Revenue at Risk, suspend actions
- **Warning: amber `#BA7517`** — cart abandonment, billing alerts
- New **`<Logo />` component** — 18×18 rounded teal square with white center dot + "LifecycleAI" wordmark (used in sidebar, marketing header, auth, onboarding)

### Layouts
- **Merchant dashboard** (`app/(app)/layout.tsx`) — new 240px sidebar with grouped nav (Primary / Secondary), sticky `<SiteHeader />` with avatar dropdown menu
- **Admin panel** (`app/admin/layout.tsx`) — kept dark zinc-950 sidebar (intentional separation), amber accent, sticky header
- **Settings** (`app/(app)/dashboard/settings/layout.tsx`) — sticky sidebar within main content
- **Onboarding** — gradient background, Card-wrapped wizard steps with new StepIndicator (Lucide check)
- **Auth** — centered Card on muted background

### Pages refactored
- ✅ **Merchant dashboard** — overview (with Revenue at Risk hero, KPI grid, distribution charts, CLV section), customers list (proper Table), customer detail, customer DNA card (8 sections + 6 dimension cards), segments (list/new/detail), strategy (list/detail with offer framework callouts), recommendations (NBP table + 4 framework sections), reports (list/markdown viewer), brand profile, connect store
- ✅ **Settings** (9 sections) — all forms converted to shadcn `Input` / `Switch` / `Select` / `Textarea` / `Card` patterns with auto-save
- ✅ **Admin panel** (24 pages) — `AdminPageHeader` + `AdminStat` shared components, zinc/amber palette, all tables polished with consistent border/shadow
- ✅ **Onboarding** (3 wizard steps) — Card-wrapped, Lucide step icons, `<Button>` CTAs
- ✅ **Auth** (signin/signup/forgot-password) — Label + Input pairs, Lucide success/error states
- ✅ **Marketing** (landing/pricing/privacy/terms) — header/footer use new Logo component, primary CTAs swapped to teal
- ✅ **Shared components** — StatCard, DistributionBars, Badge, WhyButton, CopyButton, PrintButton, RegenerateStrategyButton, StepIndicator, SettingsSidebar, AdminSidebar all updated

### Build health
- ✅ `npm run typecheck` — clean
- ✅ `npm run build` — production build succeeds, all 47+ routes compile
- ✅ Dev server boots in ~1.4s
- Pre-existing `lib/shopify/sync.ts` warnings — fixed during refactor

### What's deferred to v1.1
- Mobile responsive pass (sidebar collapse on small screens)
- Dark mode toggle (tokens ready, but no toggle UI yet)
- Tremor `BarList` + `SparkAreaChart` selective additions (mentioned in original prompt; using shadcn equivalents instead)

---

## 🧩 Widget Dashboard v1 — COMPLETE (built 2026-05-07)

Customizable drag-and-drop widget grid at `/dashboard/grid`. Classic dashboard at `/dashboard` kept untouched for side-by-side comparison.

### Architecture
- `react-grid-layout/legacy` (12-column responsive grid, drag + resize)
- Per-merchant layout persisted to `merchant_dashboards.widgets` JSONB (migration 0014)
- Default layout seeds on first visit
- All widgets render real data from existing schema — no fake/sample data
- **Schema v2** — widgets store explicit `{ w, h }` (raw grid units). Per-widget `minW/maxW/minH/maxH` constraints in `WIDGET_CONFIGS` bound drag-resize. `migrateLegacyWidget()` auto-converts v1 (`size: tier`) data on first load.
- **Widget extension points** via `WidgetShellContext`: widgets can push dynamic `subtitle` and `headerLink` overrides into the shell's header area

### 11 widgets shipped
| Widget | Data source |
|--------|-------------|
| KPI: Revenue at Risk | `merchant_metrics.revenue_at_risk` |
| KPI: Total Revenue | `merchant_metrics.total_revenue` |
| KPI: Predicted CLV | `clv_summary.total_predicted_clv_365d` |
| KPI: Repeat Rate | `merchant_metrics.repeat_purchase_rate` (toned vs 25-30% benchmark) |
| Lifecycle Distribution | Bar list grouped by lifecycle stage |
| Value Tier Donut | Recharts donut grouped by VIP/Premium/Standard |
| Revenue Trend (30d) | Recharts area chart, daily orders bucketed in JS |
| At-Risk Customers | Top 10 by predicted_clv where churn > 0.5 |
| Featured Customer DNA | Top customer by impact (CLV × churn) + 6 DNA dimensions |
| Why Reasoning | Rule-based bullets from DNA dimensions (LLM cache deferred to v1.5) |
| Today's Priority | Cart abandonments + slipping VIPs + at-risk count, full-width red accent |

### UX evolution (built across multiple iterations)

**v1 (Phase 6 original):** Edit mode toggle + slide-out library Sheet + click-cycle resize.

**v2 (revised 2026-05-07 PM after merchant feedback):**

#### No edit mode toggle — always-on
- Removed edit-mode toggle, `E` keyboard shortcut, edit-mode banner
- Drag/resize/close work continuously
- Reset-to-default lives in the library footer

#### Permanent right-side library
- 280px sticky panel, always visible on desktop
- Hidden on mobile (read-only single-column grid)
- Sectioned: "Already added · N" + "Available · N"
- Search bar + 4 category filters (All / KPIs / Customers / Analytics)
- Each card: colored 30px icon (per-widget `iconColor`), title, description, size pill
- Click card to add (appended at bottom) OR drag onto grid for positional drop

#### Drag-from-library to grid (positional drop)
- HTML5 drag from library card → RGL renders teal-dashed placeholder following cursor
- Drop lands widget at exact (x, y)
- Click-to-add fallback still works (appends at bottom)
- Already-added widgets are not draggable from library

#### Drag-from-grid to library to remove
- Drag any widget by its header → library turns red with "Drop here to remove" badge
- When cursor crosses into library bounds: library glows brighter, badge says "Release to remove" + scales 110%
- Release → widget removed instantly + 5s undo toast
- **Performance fix:** uses a global `mouseup` capture-phase listener that fires BEFORE RGL's snap-back animation, so removal feels instant (not "few seconds delay" as it did before the fix)
- Touch support included (`touchmove` + `touchend`)

#### Drag-resize via corner handle (replaced cycle button)
- Hover any widget → resize handle appears at bottom-right (two diagonal stripes)
- Drag corner inward/outward to resize within per-widget min/max bounds
- The previous click-cycle "Maximize2" button was confusing (most widgets had only 1 size tier — did nothing); removed
- Schema migrated from named tiers (`size: 'small'|'medium'|'large'`) to raw `w`/`h` with `migrateLegacyWidget()` running once on load

#### Drag handle UX
- The widget HEADER (title + description area) is the drag handle — large, intuitive target
- `cursor-grab` on hover, `cursor-grabbing` while dragging
- A subtle `≡` `GripHorizontal` icon fades in on header hover
- Remove button (×) at top-right uses `e.stopPropagation()` on click + mousedown so it doesn't trigger drag start

#### Visible grid canvas
- Grid area has its own beige inset card (`bg-#FAFAF7`, 0.5px border, 14px radius)
- Background tints darker (`#F1EFE6`) when a grid widget is being dragged

#### Visual styling matches HTML template
- **Inter font** loaded globally via `next/font/google`
- Beige page background (`#F7F5F0`) on the grid route only
- Title styling: 24px semibold tracking-[-0.025em]
- Per-widget colored icon palette in library (green/blue/purple/amber/red/pink/coral)
- 14px rounded corners, 0.5px borders, soft shadow on hover

#### Today's Priority redesign
- Vertical scrollable list of action items (was horizontal flex-wrap)
- Each item: colored icon + title + description + per-item action button ("Recover →" / "Review →" / "Save →")
- Default size bumped to h:3; can grow to h:6
- Eyebrow text moved to widget subtitle ("Top actions to take right now · 4 active") — uses dynamic subtitle override

#### Lifecycle Distribution defaultH bumped 3 → 5
- 7 lifecycle stages couldn't fit at h:3 (some bars hidden)
- Now drops at h:5 by default with all stages visible

#### Header ↗ link override (NEW shell capability)
Widgets can push a "view full" link into the shell's header next to the × button. Uses the `widget-subtitle-context` API (`useSetWidgetHeaderLink`).

| Widget | Header link |
|--------|-------------|
| AtRiskTable | ↗ → `/dashboard/customers?stage=at_risk` |
| DnaFeatured | ↗ → `/dashboard/customers/[id]/dna` |
| PriorityBar | ↗ → `/dashboard/strategy` |

The `↗` icon button hovers teal, tooltip shows full label. Always visible.

#### Sticky footer pattern (applied to ALL widgets with footer links)
Footer "View ..." links retained at bottom of widget — but with a flex layout that **keeps them pinned at the bottom no matter how small the widget is resized**:

```jsx
<div className="h-full flex flex-col">
  {/* scrolling body */}
  <div className="flex-1 min-h-0 overflow-auto">{content}</div>
  {/* STICKY footer — never squeezed out */}
  <div className="flex-shrink-0 pt-2 mt-2 border-t">
    <Link>View full ...</Link>
  </div>
</div>
```

**Critical detail:** Tailwind's `flex-1` doesn't include `min-height: 0` by default. Without `min-h-0` on the scrolling body, the browser refuses to shrink it below content height, pushing the footer out of view. The combination of `flex-1 min-h-0 overflow-auto` (body) + `flex-shrink-0` (footer) is what makes the footer truly sticky.

| Widget | Footer link | Sticky? |
|--------|-------------|---------|
| PriorityBar | "View full action plan →" | ✅ |
| DnaFeatured | "View full DNA card →" | ✅ |
| AtRiskTable | "View all at-risk customers →" | ✅ |
| WhyReasoning | (italic source note) | ✅ |
| TrendChart | (top stats line) | ✅ pinned at top instead |

#### Dynamic subtitle override (NEW shell capability)
Widgets can override the static `config.description` with runtime content via `useSetWidgetSubtitle`. Currently used by PriorityBar to show the active action count.

### Bug fixes baked in
1. ✅ **Layout sync** — id-based map lookup (not index-based) so RGL events update the right widget
2. ✅ **Debounce stability** — useRef-based hook, created once, reads latest callback via inner ref
3. ✅ **Size cycling obsolete** — schema replaced with raw w/h + per-widget min/max; drag-resize via corner handle
4. ✅ **`update_updated_at_column` trigger function** created in migration 0014
5. ✅ **No SSR mobile flash** — CSS-only `md:hidden` / `hidden md:block`, both trees rendered SSR
6. ✅ **Priority bar redesign** — vertical scrollable list scales with content
7. ✅ **addWidget rollback** — try/catch matches removeWidget pattern
8. ✅ **Library hit-test bounds** — ref points at INNER sticky div, not outer aside (which stretched to grid height, causing false-positive removes during normal drags)
9. ✅ **Instant grid→library remove** — global mouseup capture-phase listener fires before RGL's snap-back animation
10. ✅ **KPI overflow fixed** — defaults bumped (KPIs h:3, lifecycle h:5, value tier h:4)
11. ✅ **Lifecycle bars compacted** — single-row format (label / fill / count) replaces stacked layout. All 7 stages fit by default; canonical lifecycle order (Active → Dormant) instead of count-sorted.
12. ✅ **Sticky footer across all widgets** — `flex-1 min-h-0 overflow-auto` body + `flex-shrink-0` footer. Footer "View full" links never get clipped on resize. Applied to PriorityBar, DnaFeatured, AtRiskTable, WhyReasoning, LifecycleDistribution, TrendChart.

### Per-widget error isolation
Each widget wrapped in `WidgetErrorBoundary`. One bad widget = its own card shows retry button; the rest of the grid keeps working.

### Build cost
`/dashboard/grid` is ~145 kB First Load JS (Recharts is the bulk). Dynamic-import opportunity for v1.1.

### ⚠️ Open performance decision (logged 2026-05-07 PM)

**Issue:** initial dashboard load takes 2-3 seconds because each of 11 widgets fires its own client-side server-action call after mount, AND several queries are duplicated across widgets:

| Underlying query | Called by # widgets |
|------------------|---------------------|
| `getMerchantMetrics()` | 6 (4 KPIs + 2 distributions + priority bar) |
| `fetchFeaturedDnaCustomer()` | 2 (DnaFeatured + WhyReasoning) |
| Other unique queries | 3-4 |

So ~13 DB queries on every page load when 6-7 unique queries would do.

Slow individual queries: `fetchRevenueTrend` does 30 days of orders + JS bucketing (could be one SQL `GROUP BY date_trunc('day')`); `fetchAtRiskCustomers` and `fetchFeaturedDnaCustomer` do JOINs + sorts.

**Three options offered to user (decision pending):**

| Option | Effort | Speed gain |
|--------|--------|------------|
| **A. Quick wins** | 30-45 min | ~50% faster |
|     • Wrap underlying queries with React `cache()` to dedupe within a request |
|     • Push `fetchRevenueTrend` aggregation into SQL |
|     • Share `fetchFeaturedDnaCustomer` between DnaFeatured + WhyReasoning |
| **B. Server-side prefetch** | 1-2 hrs | ~80% faster |
|     • Move all data fetching to `grid/page.tsx` server component |
|     • `Promise.all` parallel fetches |
|     • Pass each widget its data as initial props |
|     • Eliminates client→server round-trips on first load |
| **C. SWR + background refresh** | half day | best perceived speed |
|     • Adds `swr` dependency |
|     • Cache responses across page loads with stale-while-revalidate |
|     • Combine with B for first-load + subsequent visits |

**Recommendation:** A now (cheapest, biggest visible win for the time invested). Defer B/C until after launch unless real merchants flag it. **User has not yet picked.**

### What's deferred to v1.5
- Per-widget delta indicators (require historical metric snapshots)
- LLM-generated "why reasoning" cache (currently rule-based)
- Mini-sparklines in KPI cards
- **5 widgets requiring new data infrastructure: `geographic_spread`, `cohort_health`, `recent_activity`, `health_score_trend`, `anomalies_panel`** — full spec at `docs/v1.5-widget-dashboard.md`
- Multiple saved layouts per merchant
- Widget-level config (date range, segment filter)

---

## ✅ v1.5 Widget Dashboard — BUILT (shipped 2026-05-08)

**Canonical spec:** `docs/v1.5-widget-dashboard.md` (planning artifact). What actually shipped is documented below.

The full v1.5 build was sequenced as 8 phases (0 through 7, plus a 3.5 historical-health-backfill addition). Stop-and-report after each phase. Estimated 11-12 days; actual build wall-clock was one focused session because Kazim approved the full chain.

### What shipped — by phase

| Phase | What landed |
|-------|-------------|
| **0** Foundational helpers | `lib/dates.ts`, `lib/utils/flags.ts`, `lib/metrics/queries.ts`, `lib/cohorts/queries.ts`. Extended `lib/rules/stats.ts` with `standardDeviation`. Plus `scripts/test-phase-0.ts` — 29 assertions, runnable smoke harness. |
| **1** Foundational data | Migration 0015 (geo columns on merchants + customers). OAuth/sync/webhook handlers updated to capture country/region/city from Shopify. Two backfill scripts (`backfill-merchant-geo.ts`, `backfill-customer-geo.ts` with order-payload free path before API fallback). |
| **2** GeographicSpread widget | Top-10 countries by customer count, flag emojis + horizontal bars + percentages. Coral icon, `analytics` category. |
| **3** Daily metrics + Health Score Trend | Migration 0016 (`merchant_daily_metrics`). `compute-daily-metrics` cron (1am UTC). HealthScoreTrend Recharts widget with `useSetWidgetSubtitle` push. |
| **3.5** Historical health backfill (added per Kazim) | Migrations 0017-0019. `lib/metrics/historical-backfill.ts` — chunked invocation pattern (9 chunks × 10 days, fire-and-forget chain). `detect-stuck-backfills` cron with auto-recovery, per-incident counter reset, 3-attempt cap. Widget shows "Day X of 90" progress, polls every 30s. |
| **4** Cohort Health | Migration 0020. `compute-cohort-metrics` cron (2am UTC). CohortHealth widget — 6-month color-coded retention table. Inline call from onboarding so widget renders day 1. |
| **5** Events + Recent Activity | Migration 0021. `lib/events/emit.ts` (try/catch wrapped, GDPR-isolated render). 4 emit calls in webhook handler (`order.created/first/cart.abandoned/cart.recovered`) with `dedupe_key` for retry safety. `cleanup-events` cron (3am UTC). RecentActivity widget. |
| **6** Anomaly seasonality system | Migration 0022. Day-of-week baseline detector (8 weeks, min 4 same-day). Sale auto-detector (5 signals, 2+ to fire, cold-start guard). Holiday calendar (lazy-loaded `date-holidays` + `hijri-converter` — chose hijri-converter over moment-hijri to avoid the 67 KB moment.js dep). Threshold layering (snoozed → sale 5σ → holiday 4σ → normal 3σ). Per-metric description generator (6 dedicated phrasing functions). AnomaliesPanel widget with sale-confirmation card, snooze button, all-clear state. Legacy detector preserved at `/api/cron/detect-anomalies-legacy` for 30-day rollback window. |
| **7** Polish + verification | Migrations applied to local Supabase. Detector text quality validated against the spec bar — all 6 metrics produce specific, signed, day-named descriptions ("Revenue down 22% — $1,840 yesterday vs $2,360 trailing Tuesday avg"). Day 19 deploy gates documented for live verification of (a) anomaly rollback path and (b) Resend duplicate-key behavior. |

### What's in the codebase now (v1.5 specific)

- **5 new widgets** (`geographic_spread`, `health_score_trend`, `cohort_health`, `recent_activity`, `anomalies_panel`) — bringing total to 16 (11 v1 + 5 v1.5)
- **8 new migrations** (0015 through 0022)
- **5 new tables** + 2 ALTER TABLE additions on existing
- **6 new cron routes** (`compute-daily-metrics`, `compute-cohort-metrics`, `cleanup-events`, `detect-stuck-backfills`, `detect-anomalies` replaced, `detect-anomalies-legacy` preserved)
- **2 new npm packages** — `date-holidays`, `hijri-converter` (~10 KB combined, lazy-loaded inside `checkPublicHoliday`)

`/dashboard/grid` bundle: **150 kB First Load JS** (was 142 kB pre-v1.5; +8 kB for 5 widgets averaging ~1.5 kB each).

### Locked decisions baked into the build (do not revisit without reason)

- Vercel Cron API routes (not Inngest)
- All aggregations pre-computed nightly into dedicated tables, never on read
- All new widgets use **v2 widget config schema** (`defaultW/H` + `minW/maxW/minH/maxH` + `iconColor`)
- Theme tokens only — no hex codes in new widget components
- RLS pattern: `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())` on every new table
- Cold-start guard: <14 days of history → skip sale detection AND skip anomaly detection
- Threshold layering order: snoozed → sale → holiday → normal (first match wins)
- Quiet rollout: `merchants.anomaly_detection_enabled` defaults FALSE — enable per merchant via Ops Runbook entry 5 (SQL one-liner)
- Legacy v1.1 anomaly detector preserved at `-legacy` route for 30-day rollback window — delete on or after **2026-06-08** if seasonality stays stable

---

## ⚙️ Phase 8 — Scale hardening (shipped 2026-05-08, post-v1.5)

After v1.5 build, Kazim raised: *"if I get 100 merchants × 100K customers, will Vercel break?"* Honest answer was no — Vercel auto-scales — but several CRON routes would hit the Vercel 5-min function timeout at scale (compute-daily-metrics + compute-cohort-metrics + detect-anomalies + email-monthly-reports). He pushed for fixing it BEFORE deploy: *"i want a solid start... we cant hurry and mvp a product which breaks."*

### What shipped

| File | Type | Purpose |
|------|------|---------|
| `supabase/migrations/0023_cron_runs.sql` | NEW | One row per cron invocation. Tracks chunks_completed, recovery_attempts, status, total_merchants. Two indexes: stale-active + path-recent. System-level (no RLS). |
| `lib/cron/run-state.ts` | NEW | Helpers: `startCronRun`, `recordChunkComplete` (resets recovery_attempts to 0 — per-incident), `markCronRunComplete`, `markCronRunFailed`, `incrementRecoveryAttempt`. `MAX_RECOVERY_ATTEMPTS = 3`. |
| `lib/cron/chunked-handler.ts` | NEW | `runChunkedCron(req, opts)` — generic chunked-cron wrapper. Auth, parse `?run_id&offset`, bootstrap on chunk 0, fire next chunk fire-and-forget OR mark complete on last chunk. Per-merchant errors don't kill the chunk — collected in response. |
| `lib/metrics/queries.ts` | EDIT | `getActiveMerchants` now accepts `{ limit, offset, extraWhere }` for chunked iteration. New `countActiveMerchants(extraWhere)` helper. Stable ordering for deterministic OFFSET pagination. |
| `lib/email/resend.ts` | EDIT | `sendEmail()` accepts `idempotencyKey` arg → sent as Resend's `Idempotency-Key` header. Detects Resend's idempotency-rejection error codes and returns `{ ok: true, deduped: true }`. |
| 4 cron routes | REWRITE | `compute-daily-metrics`, `compute-cohort-metrics`, `detect-anomalies` → 25-30 lines each, all use `runChunkedCron` helper. `email-monthly-reports` is bespoke — uses **atomic SQL claim** (`WITH to_claim ... FOR UPDATE SKIP LOCKED ... UPDATE ... RETURNING`) + `idempotencyKey: monthly-report:${id}` — TWO layers of double-send protection. |
| `app/api/cron/detect-stuck-cron-runs/route.ts` | NEW | 7am UTC daily. Companion to `detect-stuck-backfills`. Scans `cron_runs` for stuck runs, increments recovery_attempts, fires next chunk (offset-based or claim-based depending on cron). 3-attempt cap → marks failed with diagnostic. |
| `app/api/cron/cleanup-events/route.ts` | EDIT | Scope expanded: events 90d + cron_runs `complete` 90d + cron_runs `failed` 180d + cron_runs `in_progress` NEVER. Per-category counts in response. |
| `scripts/run-cron-chunk.ts` | NEW | Manual chunk re-fire by `--run-id=<uuid>`. Auto-resurrects failed runs to `in_progress` with counter reset. Optional `--from-chunk=N` override. |

### Capacity ceiling lifted

| Scenario | Pre-Phase-8 | Post-Phase-8 |
|----------|-------------|--------------|
| 5 merchants | ~25s, 1 invocation | Same |
| 30 merchants | Borderline timeout | ~30s × 6 chunks ✓ |
| 100 merchants | **❌ ~10 min, times out** | ✅ ~30s × 20 chunks |
| 1000 merchants | n/a | ✅ ~30s × 200 chunks (Postgres becomes the bottleneck before Vercel does) |

Each chunk runs in its own ≤5-min Vercel function invocation. The 100+ merchant cliff is gone.

### Three problems closed simultaneously

1. **Cron timeouts at scale** — chunked self-firing pattern, mirrors Phase 3.5 historical-health-backfill design
2. **Silent stuck runs** — `detect-stuck-cron-runs` cron at 7am UTC, per-incident recovery counter, 3-attempt cap
3. **Email double-sends** — atomic SQL claim closes SELECT→UPDATE race, Resend `idempotencyKey` closes SMTP-handoff partial-send race. Belt and braces.

---

## 📊 Cron + migration totals

### Active cron jobs (8 of 100 used on Vercel Pro)

| # | Cron | Schedule | Phase |
|---|------|----------|-------|
| 1 | `detect-anomalies` (seasonality-aware) | Mondays 9am UTC | v1.5 Phase 6 |
| 2 | `process-cart-abandonments` | Every 30 min | v1 Day 6-8 |
| 3 | `email-monthly-reports` (chunked + atomic claim) | 1st of month 9am UTC | v1 Day 12 + Phase 8 |
| 4 | `compute-daily-metrics` (chunked) | 1am UTC daily | v1.5 Phase 3 + Phase 8 |
| 5 | `compute-cohort-metrics` (chunked) | 2am UTC daily | v1.5 Phase 4 + Phase 8 |
| 6 | `cleanup-events` (extended scope) | 3am UTC daily | v1.5 Phase 5 + Phase 8 |
| 7 | `detect-stuck-backfills` | 6am UTC daily | v1.5 Phase 3.5 |
| 8 | `detect-stuck-cron-runs` | 7am UTC daily | Phase 8 |

Plus `detect-anomalies-legacy` — **unscheduled**, preserved at its own path for one-line vercel.json rollback. Delete on or after 2026-06-08 if seasonality stays stable.

### Migrations applied (23 total — 0001 through 0023, all on local Supabase)

v1: 0001-0014 (core schema, metrics, NBP, reports, strategy, DNA, segments, admin, support, settings, dashboards). v1.5: 0015 (geo) → 0022 (anomaly seasonality). Phase 8: 0023 (cron_runs).

### Widgets (16 total)

11 v1 (4 KPIs, lifecycle distribution, value tier donut, trend chart, at-risk table, DNA featured, why reasoning, priority bar) + 5 v1.5 (geographic_spread, health_score_trend, cohort_health, recent_activity, anomalies_panel).

---

## 🚧 Open threads — specs ready to hand off

Two specs authored separately during this session (external to repo at time of writing). Recommended: paste into the locations below for version control, mirroring the pattern used for `docs/v1.5-widget-dashboard.md`. PROJECT-STATUS.md references them by repo path so future sessions can find them without re-deriving.

### `docs/data-capture-roadmap.md` — Data capture roadmap

3-tier data capture plan. Per Kazim's scoping:
- **Tier 1**: 5-6 days
- **Tier 2**: 8 days
- **Tier 3**: demand-driven

Status: spec authored, not yet implemented. Trigger: TBD per user.

### `docs/pre-launch-scale-hardening.md` — Pre-launch scale hardening

12-item hardening plan. Per Kazim's scoping:
- **Critical**: 4-5 days
- **Should-ship**: 2-3 days
- **Nice-to-have**: ~1.5 hours

Status: spec authored, not yet implemented. Some Phase 8 work overlaps the "Critical" tier (chunked crons, email idempotency, stuck detection) — review before starting to dedupe.

### Author note

I (Claude) have NOT reviewed the contents of these two specs in this session. Scope summaries above are from Kazim's notes. When implementation is triggered, future Claude sessions should:
1. Read the spec files in `docs/`
2. Cross-reference what's already shipped (especially Phase 8 — likely overlaps the "Critical" hardening tier)
3. Surface the dedupe before coding

---

## 🪟 Decision still open

**Should `/dashboard/grid` replace `/dashboard`?** Currently both routes coexist. The classic shadcn dashboard at `/dashboard` has a small "Try the new customizable grid →" link in the top-right. Plan: validate with friend's-store + first 10 paying merchants, then either swap or keep both based on usage data.

### ⚠️ Open decision: dramatic v2 redesign?

User feedback after seeing the refactored dashboard: *"i dont see any change in the template, its the same"*

Inspection confirmed the refactor IS applied (new teal Logo, Lucide sidebar icons, avatar dropdown, accent left-borders on hero cards, rounded-xl + shadow-sm on all cards, primary teal CTAs). But the **structural layout is unchanged**, so the visual difference reads as incremental polish rather than a redesign. Two paths to choose from:

**Path A — Accept current state (recommended for ship-speed):**
The refactor is foundationally correct. Production-grade component system, design tokens, type-safe, dark-mode-ready, build-clean. Move on to Days 17-21 (billing, deploy, app store) and ship.

**Path B — Push for "Linear/Vercel/Stripe" 2026-grade feel (1-2 days):**
Add:
- **Inter or Geist Variable** font (replaces system default — biggest single visual upgrade)
- **Bigger hero typography** — Revenue at Risk hero text 48-56px instead of 36px, more whitespace around it
- **KPI cards with mini sparklines** — Tremor `SparkAreaChart` in corner of each card, like Stripe dashboard
- **Replace lifecycle bar list** with proper Recharts horizontal bar with hover tooltips
- **Better backdrop blur** in header, subtle gradient hero backgrounds
- **Page transitions** (view-transition API or Framer Motion)

**Decision pending — user has not yet chosen between A and B.** If A, mark this section closed. If B, queue as a separate refactor block before Day 19 deploy.

---

## TL;DR — Where you stand

The product is now end-to-end with a full SaaS surface area:
- Merchant-facing dashboard (overview, customers, segments, strategy, recommendations, reports, brand profile, DNA card, settings)
- Public marketing site (landing, pricing, privacy, terms)
- Internal admin panel (24 pages across operations / analytics / scaling)
- shadcn/ui design system migrated across all 60+ pages (token-based, dark-mode-ready, build-clean)

What's left is **launch plumbing** (Shopify Billing API + production deploy + App Store assets) — about **4-5 days of focused work** to ship.

**Open question:** whether to invest 1-2 days in a v2 dramatic visual redesign (Inter font + sparkline-augmented KPI cards + bigger hero typography) BEFORE shipping, or ship now and polish in v1.1.

---

## ✅ DONE — what's already working

### Phase 1 — Foundation
- [x] Next.js 14 + App Router scaffolding
- [x] Supabase project + auth (signup, signin, password reset, email verify)
- [x] Database schema with 6 migrations applied
- [x] Tailwind layout
- [x] Sidebar nav + dashboard shell

### Phase 2 — Shopify Integration
- [x] Shopify OAuth (custom app install)
- [x] Initial customer + order sync from Shopify Admin API
- [x] Brand voice extraction from storefront crawl
- [x] **Webhooks** (orders/create, orders/updated, orders/cancelled, customers/create, customers/update, app/uninstalled)
- [x] **Auto-crawl on install** — pipeline triggers automatically post-OAuth
- [x] Onboarding wizard (4-step welcome → connect → setup → dashboard)
- [x] HMAC verification on all webhook events
- [x] Audit trail in `webhook_events` table

### Phase 3 — Rules Engine
- [x] RFM scoring per customer
- [x] 7-stage lifecycle classification (lead/new/active/slipping/at_risk/churned/dormant)
- [x] Value tier (VIP / Premium / Standard)
- [x] Median-based dynamic thresholds per merchant
- [x] Customer Health Score (0-100, 5 sub-scores: recency 30%, frequency 20%, monetary 15%, engagement 15%, cycle adherence 20%)
- [x] Concentration Risk (Pareto top-10%)
- [x] Discount Dependency score per customer + merchant-wide
- [x] Revenue at Risk (CLV × churn × intervention rate)
- [x] First-to-Second purchase tracker (merchant-level)
- [x] BNPL detection
- [x] Health-score history snapshots (`customer_health_history` table)

### Phase 4 — ML Models (Python service)
- [x] FastAPI ML service running on port 8000
- [x] Python 3.12.10 venv with `lifetimes`, `implicit`, `lightgbm`
- [x] CLV: BG/NBD + Gamma-Gamma (90/180/365 day predictions)
- [x] NBP: ALS collaborative filtering with per-customer recommendations
- [x] Churn: BG/NBD-based P(alive) → churn probability
- [x] Endpoints: POST /score/{clv,nbp,churn,all}/{merchant_id}
- [x] HTTP wired into TypeScript pipeline (`lib/ml/client.ts`)

### Phase 5 — LLM Layer (Anthropic)
- [x] Anthropic SDK client with model routing (Sonnet / Opus / Haiku)
- [x] Cost tracking per call (USD logged)
- [x] Prompt 1: Brand voice extraction (Sonnet) — verified on Allbirds
- [x] Prompt 2: Per-segment copy generation (Sonnet) — used in strategy programs
- [x] Prompt 4: Monthly narrative report (Opus) — verified on dev store
- [x] Prompt 5: Anomaly explanation (Sonnet) — generates 2-3 hypotheses
- [x] **Anomaly detector** — compares health snapshots, flags spikes
- [x] **Anomaly cron** — Vercel cron Mondays 9am UTC scans all merchants

### Phase 6 — Strategy Generator
- [x] 7 program templates with offer-framework awareness:
  - VIP Win-back, Standard Win-back (recovery offers)
  - At-Risk Save (retention)
  - Slipping Customer Rescue (save)
  - First-to-Second Purchase Push (habit-forming)
  - VIP Retention Touch (NBO — engagement)
  - Active Customer Cross-Sell (NBP-led — engagement)
- [x] Eligibility queries → audience identification
- [x] Estimated revenue impact calculation (audience × response rate × CLV)
- [x] LLM copy generation per program in brand voice
- [x] Persisted to `strategy_programs` table
- [x] Regenerate strategy button with live progress

### Phase 7 — Exports (MVP version)
- [x] CSV export of customer list (filterable by stage / tier)
- [x] CSV export of strategy program audience with email copy embedded
- [x] PDF download via browser print (with print-friendly CSS)
- [x] Copy-to-clipboard buttons for subject lines + email body

### Phase 8 — Reporting (partial)
- [x] Overview dashboard with Revenue at Risk hero
- [x] CLV summary section (total / median / top 10% / avg churn)
- [x] Lifecycle distribution chart
- [x] Value tier distribution chart
- [x] Customers list page with filters
- [x] **Customer detail page** with health sub-scores, NBP recommendations, order history, health trend
- [x] Strategy list + detail pages
- [x] Recommendations page (NBP table + NBO matrix split by framework)
- [x] Monthly reports list + markdown viewer
- [x] Brand profile viewer

### UX / polish (added during build)
- [x] Loading spinners on long actions
- [x] 404 page
- [x] Error boundary page
- [x] Empty states with helpful CTAs
- [x] Step indicator for onboarding wizard

### Public marketing site
- [x] Full SaaS landing page at `/` (hero + dashboard mockup + features + comparison table + architecture + final CTA)
- [x] `/pricing` (4 tiers + FAQ + value props)
- [x] `/privacy` (13 sections, GDPR/CCPA/UAE)
- [x] `/terms` (16 sections, SaaS-standard)
- [x] Sticky `MarketingHeader` + `MarketingFooter` (shared across all marketing pages)

### Admin Panel — Tiers 1-3 (24 pages)
- [x] **Tier 1 — Operations**: overview, merchants directory, merchant detail (4 tabs), support inbox, billing dashboard, system health (crons / errors / API usage / webhooks)
- [x] **Tier 2 — Analytics**: onboarding funnel, feature usage, cohort retention heatmap, cancellations, AI cost dashboard
- [x] **Tier 3 — Scaling**: merchant segmentation (6 pre-built), promotions CRUD, audit log viewer, feature flags, email templates, rate limits, team management
- [x] All admin actions audit-logged
- [x] Role-based permissions (super_admin / admin / support / read_only)

### Settings expansion (9 sections, sidebar layout)
- [x] **Tier 1**: Account / Shop / Billing / Notifications / Team-placeholder
- [x] **Tier 2**: Brand voice / Strategy preferences / Data & privacy / Integrations
- [x] Auto-save on text-blur and toggle changes
- [x] Audit trail in `merchant_settings_log`

---

## ❌ REMAINING — what's left to ship MVP

### 🔴 MVP-blockers — required before App Store submission

| Item | Effort | Why blocking |
|------|--------|--------------|
| **Shopify Billing API** | 1.5 days | No revenue without it. Charges plan price on install + handles upgrades/downgrades/cancellations. |
| **Production deployment — Vercel** | 4 hrs | Need live HTTPS URL for App Store listing |
| **Production deployment — Railway (ML service)** | 4 hrs | Need Python service hosted somewhere reachable from Vercel |
| **Domain + DNS setup** | 2 hrs | Buy `lifecycleai.app` (or similar), point at Vercel |
| **App Store listing copy** | 4 hrs | Description, value prop, feature list |
| **App Store screenshots** | 2 hrs | 5-7 screenshots from production environment |
| **App Store demo video** | 4 hrs | 30-60 second walkthrough |
| **Support email + setup** | 1 hr | support@lifecycleai.app via Cloudflare email routing or Google Workspace |
| **Resend API key** | 5 min | Sign up at resend.com (free tier 3000 emails/mo), paste key into `.env.local` |
| **Friend's-store live test** | 1 day | Real merchant data validation |
| **Submit to App Store** | 30 min | Click submit, wait 4-8 weeks |
| **Legal review** | external | Privacy Policy + Terms drafts exist; lawyer should review (~$300-800 SaaS-experienced) |
| **Submit to App Store** | 30 min | Click submit, wait 4-8 weeks |
| **Friend's-store live test** | 1 day | Real merchant data validation |

**Total MVP-blocker work: ~4-5 days**

### 🟡 Should-have polish — improves first impressions for reviewers

| Item | Effort | Impact |
|------|--------|--------|
| **shadcn/ui design upgrade** | 1 day | Major visual improvement |
| **Mobile responsive pass** | 0.5 day | Sidebar collapses on phones |
| **Health Score distribution widget on Overview** | 30 min | Shows account health at a glance |
| **In-app help / tooltips** | 0.5 day | Reduces support load |
| **Settings page** | 0.5 day | Account, billing, team management |

**Total polish: ~3 days**

### 🟢 Deferred to v1.1 (post-launch, weeks 1-4)

| Item | Why deferred |
|------|--------------|
| Email delivery of monthly reports | Needs Resend/Postmark integration |
| Webhook retry queue | Shopify auto-retries; not critical for MVP |
| ML model drift detection | Premature optimization |
| Training pipelines on schedule | Currently retrains on each call (fine for low volume) |
| CSV upload (manual data import) | Shopify covers MVP |
| Per-program performance dashboard | Needs attribution engine |
| Stage health dashboard | Nice-to-have |

### 🔵 Deferred to v1.5 (months 2-4)

| Item | Strategic reason |
|------|------------------|
| **Klaviyo direct push integration** | "Killer feature" — locks merchants in |
| Customer.io / Mailchimp / ConvertKit / Postscript | Cover ~95% of merchants' execution stack |
| Holdout testing for causal attribution | Sophisticated buyers ask for this |
| Customer Concierge Timeline | Single-customer event log |
| Saturation / Fatigue Detection | Cross-channel touch tracking |
| NBP "why" reasoning prompt | LLM explanation per recommendation |
| Q&A in dashboard | Conversational interface |
| Subject line variants prompt | A/B testing helper |
| Stage transition audit prompt | Explainability |
| Custom segment builder UI | Power users |
| Strategy versioning | Track how strategies evolve |

### 🟣 Deferred to v2.0+ (months 4-12)

| Item | Strategic reason |
|------|------------------|
| **DNA Layer** (per `DNA_IMPLEMENTATION_GUIDE.md`) | 6-dimension structured customer profile — basis for advanced features |
| BigCommerce integration | Doubles TAM |
| WooCommerce integration | Triples TAM |
| **Salla / Zid integration (MENA)** | Your MENA strategic edge |
| Arabic LLM copy generation | Same |
| Multi-currency handling (SAR, AED) | Same |
| RTL UI support | Same |
| Subscription / Replenishment Layer (Recharge, Bold) | Recurring revenue play |
| Yotpo / Stamped reviews integration | Advocacy detection |
| Intercom / Gorgias support tickets | At-risk signals |
| Acquisition Quality Score | UTM × CLV/churn — directly impacts ad spend |
| Margin-Aware Recommendations | Profit, not revenue |
| Conversational LLM onboarding | UX leap |
| Today View | Daily-prioritized "do these 3 things" |
| Quarterly Industry Benchmark Report | Marketing flywheel |

### 🟤 Deferred to v3+ (year 2)

- Magento / Adobe Commerce
- Custom rule builder UI
- Built-in A/B testing framework
- Loyalty program integration (Smile, Yotpo Loyalty)
- Ad platform push (Meta, Google, TikTok lookalikes)
- White-label / agency tier
- Public API + webhook subscriptions
- Enterprise tier (SSO, audit logs, data residency)

---

## 🎯 Recommended path forward

```
Day 1-2:    Shopify Billing API + Privacy/ToS pages
Day 3:      Production deploy (Vercel + Railway)
Day 4:      Domain + App Store listing copy + screenshots
Day 5:      Friend's-store live test + submit to App Store
Day 5+:     Wait 4-8 weeks for Shopify review
            Use that time for: shadcn UI upgrade, v1.1 polish, DNA layer
```

After MVP submission, the natural v1.5 priority is **Klaviyo integration** (highest-ask feature). Then **MENA expansion** (your strategic edge).

---

## Key decisions already made (locked)

See `15-Decisions-Log.md` for full rationale. Highlights:

1. **Rules + ML + LLM 3-layer architecture** (rules-first, LLM as messenger)
2. **Shopify-first distribution** (was Stripe-first)
3. **Pricing**: $99 / $249 / $599 / $999 monthly tiers
4. **7-stage lifecycle + 3 value tiers** (locked from Klaviyo's 4-stage)
5. **Median-based thresholds, not mean**
6. **NBO/NBP scoped to engagement stage only** (banker insight — recovery / save / win-back are different frameworks)
7. **Klaviyo deferred to v1.5** (CSV export covers MVP)
8. **ML service runs as separate Python microservice** on Railway
9. **Pin Python to 3.12.10** (3.14 has no ML library wheels)
10. **Shopify Billing API**, not Stripe (Shopify takes 0% on first $1M ARR)

---

## Files / structure

```
C:\Users\Gamer1\lifecycle-dev\
├── app/                          Next.js App Router
│   ├── (auth)/                   signup, signin, forgot-password
│   ├── (app)/dashboard/          overview, customers, strategy, reports, brand, recommendations, connect
│   ├── api/                      Shopify OAuth, webhooks, exports, cron
│   └── onboarding/               4-step wizard
├── components/                   Sidebar, StatCard, DistributionBars, Badge, etc.
├── lib/
│   ├── rules/                    rules engine (TS)
│   ├── ml/                       Python ML service client
│   ├── llm/                      Anthropic client + prompts
│   ├── strategy/                 program templates + orchestrator
│   ├── brand/                    crawler + voice extraction
│   ├── reports/                  monthly narrative
│   ├── anomalies/                detection
│   └── shopify/                  OAuth, sync, webhooks, admin API
├── ml-service/                   Python FastAPI service
│   ├── app/                      main.py, db.py, models/{clv,nbp,churn}.py
│   └── .venv/                    Python 3.12.10
├── supabase/migrations/          0001-0006 SQL migrations
├── scripts/                      CLI tools (sync, compute, generate, etc.)
└── docs/                         Spec docs (00-19) + this file
```

---

## Health check

| Component | Working | Tested |
|-----------|---------|--------|
| Auth flow (signup → email → dashboard) | ✅ | ✅ |
| Shopify OAuth → install → first sync | ✅ | ✅ (dev store) |
| Webhooks (HMAC verify + persist + process) | ✅ | ✅ (synthetic test) |
| Rules engine end-to-end | ✅ | ✅ (32 customers scored) |
| ML scoring (CLV / NBP / Churn) | ✅ | ✅ (28 customers scored) |
| Brand voice extraction | ✅ | ✅ (Allbirds: high confidence) |
| Strategy generation (7 programs) | ✅ | ✅ ($39k estimated impact) |
| Monthly narrative report | ✅ | ✅ (April 2026 generated) |
| CSV exports | ✅ | ✅ |
| PDF download | ✅ | ✅ |
| Anomaly cron | ✅ | ✅ (1 merchant scanned, 0 anomalies) |
| Onboarding wizard auto-runs | ✅ | not yet on a real install |
| Production deployment | ❌ | n/a |
| Shopify Billing API | ❌ | n/a |

---

## What you can demo today

If you needed to show this to a Shopify merchant or YC partner today, you could:

1. Sign up at `localhost:3002`
2. Connect a Shopify dev store (or a real shop)
3. Watch the auto-pipeline run (sync → score → brand voice → strategy)
4. Show Overview dashboard with Revenue at Risk hero
5. Click into Strategy → show 7 prioritized programs with email copy
6. Click a program → show audience + AI-generated email copy + CSV export
7. Click Reports → show April monthly narrative (real names, real dollar amounts)
8. Click Customers → drill into Tianna Predovic ($42k predicted CLV)
9. Show the 5 health sub-scores + NBP recommendations
10. Click Recommendations → show NBO matrix split by lifecycle framework

That's a complete demo of the end-to-end product. The only thing you couldn't show is **collecting payment** (Shopify Billing API not built) and **a live URL** (only on localhost).

---

## 🛠️ Ops Runbook

Operational procedures for running v1.5+ infrastructure. Add new entries as you encounter them; don't wait until you remember "we did that thing once."

### 1. Stuck health backfill recovery

**Symptom:** A merchant's `health_backfill_status = 'in_progress'` for >1 hour with no progress (`health_backfill_chunks_completed` not advancing). The dashboard widget shows "Day X of 90" indefinitely.

**Auto-recovery:** Daily `/api/cron/detect-stuck-backfills` cron (6am UTC) handles this. Finds merchants where `last_chunk_at < NOW() - 1 hour AND status = 'in_progress'`. For each:
- If `health_backfill_recovery_attempts < 3` → increment counter, re-fire next chunk via fetch. Successful chunks reset counter to 0 (per-incident semantics).
- If `health_backfill_recovery_attempts >= 3` → mark `status = 'failed'` with diagnostic in `health_backfill_error` including the `--from-chunk=N` recovery command.

Errors logged via `console.error` → visible in Vercel log explorer. (Sentry swap is a 1-line replacement when you set up the account.)

**Manual recovery:**
```bash
# Get the chunk to resume from:
SELECT shop_domain, health_backfill_status, health_backfill_chunks_completed, health_backfill_error
  FROM merchants
  WHERE health_backfill_status IN ('failed', 'in_progress')
    AND status = 'active';

# Resume from chunk N (= chunks_completed):
npx tsx scripts/run-historical-health-backfill.ts <shop_domain> --from-chunk=<N>
```

The script runs locally — no Vercel timeout, walks every remaining chunk back-to-back. Idempotent (`ON CONFLICT` in writes), so re-running an already-processed chunk is safe.

### 2. Manual health-backfill chunk re-fire (no stuck detection needed)

**When to use:** Testing the chunked endpoint, forcing a re-run after a schema change, or kicking off a backfill that never started.

```bash
# Full backfill from scratch (90 days):
npx tsx scripts/run-historical-health-backfill.ts <shop_domain>

# Custom window (e.g., 30 days):
npx tsx scripts/run-historical-health-backfill.ts <shop_domain> --days=30

# Resume from chunk 4:
npx tsx scripts/run-historical-health-backfill.ts <shop_domain> --from-chunk=4

# Re-fire a single chunk via the production endpoint (requires CRON_SECRET):
curl -X POST https://<your-domain>/api/internal/backfill-health-history \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"merchant_id": "<uuid>", "chunk": 5, "total_chunks": 9}'
```

### 3. Cron status check

**Vercel dashboard:** `https://vercel.com/<team>/<project>/cron-jobs` — shows last invocation, success/fail status, next scheduled run for each cron.

**Current cron count: 5 of 100 used.** Configured in `vercel.json`:

| Cron | Schedule | Purpose |
|------|----------|---------|
| `detect-anomalies` | Mondays 9am UTC | Weekly anomaly scan (legacy v1.1) |
| `process-cart-abandonments` | Every 30 min | Cart-recovery program send-time |
| `email-monthly-reports` | 1st of month 9am UTC | Monthly merchant emails |
| `compute-daily-metrics` | 1am UTC daily | Populates `merchant_daily_metrics` (Phase 3) |
| `detect-stuck-backfills` | 6am UTC daily | Auto-recovers stuck health backfills (Phase 3.5+) |

Phase 4 will add `compute-cohort-metrics` (2am daily) → 6 of 100. Phase 5 adds `cleanup-events` (3am daily) → 7 of 100.

**To re-fire a cron manually:**
```bash
# Auth via CRON_SECRET — the same header Vercel injects on schedule
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://<your-domain>/api/cron/<cron-name>
```

### 4. Supabase quick-inspect SQL

**Backfill status across all active merchants:**
```sql
SELECT
  shop_domain,
  health_backfill_status,
  health_backfill_chunks_completed || '/' || health_backfill_chunks_total AS progress,
  health_backfill_recovery_attempts AS recoveries,
  health_backfill_last_chunk_at,
  health_backfill_error
FROM merchants
WHERE status = 'active'
ORDER BY installed_at DESC;
```

**Daily metrics coverage for one merchant (last 30 days):**
```sql
SELECT metric_date, avg_health_score, revenue, orders_count, new_customers
FROM merchant_daily_metrics
WHERE merchant_id = '<uuid>'
ORDER BY metric_date DESC
LIMIT 30;
```

**Health history per-customer count for one merchant:**
```sql
SELECT computed_on, COUNT(*) AS customers_snapshotted
FROM customer_health_history
WHERE merchant_id = '<uuid>'
GROUP BY computed_on
ORDER BY computed_on DESC
LIMIT 30;
```

**Active customer count by country (Phase 2 GeographicSpread sanity check):**
```sql
SELECT country_code, country_name, COUNT(*) AS customers
FROM customers
WHERE merchant_id = '<uuid>' AND country_code IS NOT NULL
GROUP BY country_code, country_name
ORDER BY customers DESC;
```

### 5. Enable anomaly detection for a merchant (v1.5 Phase 6 quiet rollout)

**Why:** `merchants.anomaly_detection_enabled` defaults to `FALSE`. The seasonality detector cron skips merchants where this flag is false, so the entire system is dark by default. Flipping per merchant is the rollout mechanism — surface the alerts to one merchant, watch for false-positive rate, expand if good.

**SQL to enable:**
```sql
UPDATE public.merchants
SET anomaly_detection_enabled = TRUE
WHERE shop_domain = 'example-store.myshopify.com';
```

**Verify:**
```sql
SELECT shop_domain, anomaly_detection_enabled, anomalies_snoozed_until
FROM public.merchants
WHERE status = 'active';
```

**Test before rollout (recommended):**
```bash
# Bypasses the enabled flag — runs detector inline regardless
npx tsx scripts/run-detect-anomalies.ts example-store.myshopify.com
```

This prints all detected anomalies for yesterday, with the description text the merchant will actually see. If text quality looks off, fix the description function in `lib/anomalies/description.ts` BEFORE flipping the flag.

**Disable** (e.g., if false-positive rate too high for one merchant):
```sql
UPDATE public.merchants SET anomaly_detection_enabled = FALSE WHERE shop_domain = 'X';
```

**v1.6 candidate:** admin panel toggle UI under `/admin/merchants/[id]`. Skipped for MVP — SQL is fine when the merchant count fits on one hand.

### 6. Rollback to legacy v1.1 anomaly detector

**When to use:** If the new seasonality detector misfires badly in production (e.g., flooding merchants with false positives). One-line vercel.json edit puts the old detector back in charge within minutes of a redeploy.

**Rollback procedure:**
1. Edit `vercel.json` — change the cron entry `"path": "/api/cron/detect-anomalies"` to `"path": "/api/cron/detect-anomalies-legacy"`
2. Redeploy. The legacy v1.1 detector resumes firing on the same Mondays-9am-UTC schedule.
3. New seasonality cron stops being invoked (its path is no longer scheduled).
4. The legacy code at `app/api/cron/detect-anomalies-legacy/route.ts` was preserved specifically for this. See the DEPRECATED comment block at the top of that file.

**30-day deletion reminder:** **2026-06-08**. If the seasonality detector has been stable for 30 days post-deploy, delete:
- `app/api/cron/detect-anomalies-legacy/` (entire directory)
- `lib/anomalies/detect.ts` (the v1.1 detector logic)
- This rollback runbook entry

**Forward-only after that.** If a 31-day-old issue surfaces, fix the seasonality detector instead of reviving legacy.

### 7. RLS isolation verification (run after adding any new tenant-scoped table)

**Why:** A single broken RLS policy = data leak across merchants. One policy missing the `auth.uid()` clause and Merchant A can query Merchant B's rows.

**Static check (fast, run from CLI):**
```bash
npx tsx scripts/verify-rls-policies.ts
```
Confirms every tenant-scoped table has RLS enabled and at least one policy referencing `auth.uid()`. Does NOT exercise the policy at runtime — that's the cross-tenant SQL test below.

**Cross-tenant behavioral test (run in Supabase dashboard SQL editor):**

This actually exercises the RLS policies under the `authenticated` role. The CLI script's `service_role` connection bypasses RLS, so this test must run in the dashboard.

```sql
-- 1. Pick two real merchants from different users
SELECT id AS merchant_id, user_id, shop_domain FROM merchants WHERE status = 'active' LIMIT 5;

-- 2. Pick two user_ids from above. Set the JWT claim to USER_A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '<USER_A_UUID>';

-- 3. Try to query each tenant table for MERCHANT_B (owned by USER_B). Each should return 0 rows.
SELECT 'merchant_daily_metrics' AS tbl, COUNT(*) FROM merchant_daily_metrics WHERE merchant_id = '<MERCHANT_B_UUID>'
UNION ALL
SELECT 'merchant_cohort_metrics', COUNT(*) FROM merchant_cohort_metrics WHERE merchant_id = '<MERCHANT_B_UUID>'
UNION ALL
SELECT 'events', COUNT(*) FROM events WHERE merchant_id = '<MERCHANT_B_UUID>'
UNION ALL
SELECT 'anomalies', COUNT(*) FROM anomalies WHERE merchant_id = '<MERCHANT_B_UUID>'
UNION ALL
SELECT 'customers', COUNT(*) FROM customers WHERE merchant_id = '<MERCHANT_B_UUID>'
UNION ALL
SELECT 'orders', COUNT(*) FROM orders WHERE merchant_id = '<MERCHANT_B_UUID>'
UNION ALL
SELECT 'customer_metrics', COUNT(*) FROM customer_metrics WHERE merchant_id = '<MERCHANT_B_UUID>';
```

**Expected result:** every COUNT = 0. Any non-zero row is a data leak — fix the policy on that table immediately and audit any code that may have already exposed data via the broken policy.

**Run cadence:** every time a new tenant-scoped table is added. Add the table name to `scripts/verify-rls-policies.ts` `TENANT_TABLES` array AND to the cross-tenant test query above.

### 8. Stuck cron run recovery

**Symptom:** `cron_runs.status = 'in_progress'` for >1 hour with no progress (stuck chunked-cron run — fire-and-forget chain dropped a chunk somewhere). Affects `compute-daily-metrics`, `compute-cohort-metrics`, `detect-anomalies`, `email-monthly-reports`.

**Auto-recovery:** The `detect-stuck-cron-runs` cron runs daily at 7am UTC. Finds stuck runs, increments `recovery_attempts`, fires the next chunk via fetch. Caps at 3 attempts before marking the run `'failed'` with diagnostic.

**SQL inspection** (paste into Supabase dashboard):
```sql
-- All recent runs, newest first. Note the `id` column — that's the --run-id arg for manual recovery.
SELECT id, cron_path, status, chunks_completed, total_merchants,
       recovery_attempts, last_chunk_at
FROM cron_runs
ORDER BY started_at DESC
LIMIT 20;

-- Filter to stuck-ish runs only
SELECT id, cron_path, chunks_completed, recovery_attempts, last_chunk_at
FROM cron_runs
WHERE status = 'in_progress'
  AND last_chunk_at < NOW() - INTERVAL '1 hour'
ORDER BY last_chunk_at;
```

**Manual recovery** (when auto-recovery has hit 3 attempts and given up, or you need to nudge before 7am UTC):
```bash
npx tsx scripts/run-cron-chunk.ts --run-id=<uuid>
```
The script reads `cron_runs`, computes the next chunk's offset (or claim-based for email cron), fires the cron's GET endpoint with Bearer auth. Resurrects `failed` runs to `in_progress` with `recovery_attempts = 0` automatically.

**Force restart from a specific chunk** (rare — only when you know `chunks_completed` in the DB is wrong):
```bash
npx tsx scripts/run-cron-chunk.ts --run-id=<uuid> --from-chunk=0
```

### 9. Failed cron run forensics

**Why this entry exists:** a failed run (`status = 'failed'`) means auto-recovery exhausted 3 attempts. Something is genuinely broken — fix the underlying bug before retriggering, or you'll burn the next 3 attempts the same way.

**Retention:** failed runs kept 180 days for audit (vs 90 days for completed). Set in `cleanup-events` cron's retention config.

**Inspection SQL:**
```sql
SELECT id, cron_path, error, recovery_attempts, last_chunk_at, metadata
FROM cron_runs
WHERE status = 'failed'
ORDER BY last_chunk_at DESC;
```

The `error` column contains the diagnostic from `detect-stuck-cron-runs` ("Stuck after 3 recovery attempts. cron_path=X, chunks_completed=N, last_chunk_at=T...") OR the per-chunk error if a chunk threw before stuck detection took over.

**Re-trigger after fixing the underlying bug:**
```bash
npx tsx scripts/run-cron-chunk.ts --run-id=<uuid>
```
Auto-resurrects from `failed` → `in_progress` with `recovery_attempts = 0`. If the bug is genuinely fixed, the chain resumes from where it left off.

**If you need to start fresh** (e.g. metadata was wrong, want to recompute everything from chunk 0):
1. `UPDATE cron_runs SET status = 'failed' WHERE id = '<uuid>';` to lock the broken row
2. Manually trigger the cron's GET endpoint with no `run_id` to start a fresh run:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/<cron-name>
   ```

### 10. Email monthly reports — partial-send recovery

**Why this entry exists:** the email cron has TWO layers of dedupe protection (atomic SQL claim + Resend `idempotencyKey`), but if BOTH fail simultaneously OR if you need to manually intervene, you need to know how to verify what actually happened.

**The partial-send race** (the rare case both layers protect against):
1. Cron claims report → atomic SQL UPDATE sets `emailed_at = NOW()`
2. `sendEmail()` to Resend → request lands, Resend processes, response is lost (network blip, function timeout)
3. Our code returns `ok: false` (we think it failed, but Resend actually delivered)
4. We reset `emailed_at = NULL` so the next cron run retries
5. Next cron tick claims it again, calls `sendEmail()` with the same `idempotencyKey` (`monthly-report:${report_id}`)
6. Resend's API recognizes the key, rejects the duplicate, returns error code `invalid_idempotent_request` or `concurrent_idempotent_requests`
7. Our SDK detects the error, returns `{ ok: true, deduped: true }` from `sendEmail()`
8. We mark `email_recipient` and move on. **Customer received the email exactly once.**

**Forensics — verifying dedupe worked:**

The most reliable observable is the **literal log line** in our own logs (Vercel log explorer or `vercel logs --follow`):

```
[Resend] idempotency dedupe (key=monthly-report:<report-id>): <Resend's error message>
```

Search the log explorer for the literal string `idempotency dedupe` to find these. If there's a matching log line for a `monthly-report:<id>` key, dedupe worked at the SDK level.

**Note on Vercel's filter syntax:** the exact dashboard filter syntax (`level:warn AND message:"X"` or similar) varies by Vercel UI version — confirm the current syntax in their docs once you're using the dashboard regularly. For now, free-text search for `idempotency dedupe` works in any version.

**Note on Resend's HTTP semantics:** I haven't independently verified what HTTP status codes / response shapes Resend returns for duplicate idempotency keys. The SDK exposes them as errors (`result.error.name`), but the underlying transport could be 4xx, 409 Conflict, or 200-with-error-body — different APIs handle this differently. **This is the Day 19 deploy gate** — verify experimentally before relying on the Resend dashboard for forensics.

**Manual override — mark a report as sent without re-firing:**

Only do this if you've **independently verified** the merchant received the email (forwarded copy from them, Resend dashboard confirmation, etc.):

```sql
UPDATE merchant_reports
SET emailed_at = NOW(),
    email_recipient = '<verified-recipient-email>'
WHERE id = '<report-id>';
```

`email_recipient` matters — without it, the audit log shows "emailed but recipient unknown", which is misleading and makes future forensics harder.

### 11. Verify Resend duplicate-key HTTP behavior (Day 19 deploy gate)

**Status:** ⏳ Pending — verify before declaring Day 19 deploy complete.

**Why:** Entry 10's forensic guidance assumes Resend returns errors (not 200s) for duplicate idempotency keys. The SDK code (`node_modules/resend/dist/index.cjs`) shows `idempotencyKey` is sent as `Idempotency-Key` header, and error codes `invalid_idempotent_request` / `concurrent_idempotent_requests` exist — but the actual HTTP response shape (status code, body format, dashboard rendering) was inferred from the SDK source, not verified against the live API.

**Verification procedure** (~5 minutes):

1. From a Vercel deployment with `RESEND_API_KEY` configured, send a test email twice with the same idempotency key:
   ```bash
   # Run twice in quick succession (same key both times)
   curl -X POST https://<your-domain>/api/test/send-with-key \
     -H "Authorization: Bearer $CRON_SECRET" \
     -d '{"to":"yourself@example.com","key":"test-dedupe-001"}'
   ```
   (You'd need a tiny test endpoint for this; or run via a one-off `tsx` script that calls `sendEmail()` directly.)

2. Capture the **HTTP response codes** from both calls (the second should be different from the first if dedupe is working).

3. Capture the **Resend dashboard view** — does the dashboard show 1 send or 2? What's logged for the duplicate?

4. Capture the **error body shape** from the second call — is it 4xx? 200 + error body? 409 Conflict?

5. **Update Ops Runbook entry 10 with the actual observed behavior.** Replace the placeholder note ("haven't independently verified...") with concrete findings. Update the forensics guidance to match.

**Blocks:** Day 19 deploy. Don't go to production without confirming the dedupe layer actually behaves the way our code assumes.

---

*This file is hand-written and will go out of date. For most current status, check the latest entry in `SESSION-NOTES.md`.*
