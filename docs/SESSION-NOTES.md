# Session Notes — pick up here next time

## 📅 Session: 2026-05-05 (today)

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

### Next session — start here
1. **Fix the dev server / Tailwind issue** from 5/4 session (delete `.next/`, restart `npm run dev`, hard-refresh browser)
2. Verify signup → email verification → dashboard works end-to-end
3. Resume **Week 2-3 build** with updated spec:
   - Update auth pages with refreshed Tailwind classes
   - Begin dashboard shell (sidebar, header, settings)
   - Plan Shopify integration for Week 4-6
4. Optional: write [[19-ML-Privacy]] doc (Isolated Mode framework) — only matters when multi-tenant ML kicks in (v1.5+)

### Files updated this session
- `02-Lifecycle-Framework.md` — 7+3 framework, median, multiplier thresholds
- `03-Segmentation.md` — 3 tiers (Standard/Premium/VIP), 7 stages
- `11-Integrations.md` — **Shopify-first** (was Stripe-first), Shopify Billing API, CSV fallback
- `12-Pricing.md` — **$99/$249/$599/$999** tiers
- `14-Build-Plan.md` — 19-21 weeks, integrated metrics into Phase 3 + 7
- `15-Decisions-Log.md` — 5 new dated decisions
- `18-Differentiating-Metrics.md` — **NEW** — Health Score, Revenue at Risk, First-to-Second, Concentration Risk, Discount Dependency
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
