# 15 — Decisions Log

Chronological log of major architectural and product decisions, with rationale. Read this when revisiting a decision to understand *why* before changing it.

---

## 2026-05-04 — Project conception

**Context:** Owner is a 42yo senior bank manager (CLM, 20 years), Middle East-based expat with 10-year property-linked visa. $1M debt, no savings, baby coming, full-time employed. Wants to build SaaS, eventually exit for financial freedom.

**Constraints determined:**
- Pure self-serve product (owner can't do sales while employed)
- No public face (no LinkedIn, employer issue)
- IP separation from employer (use only public CLM frameworks + general expertise)
- Time-constrained: evenings/weekends only
- Anonymous-friendly brand identity OK
- Friend's Shopify store as first design partner

**Decision:** Build AI + ML CLM SaaS for e-com / SaaS / course creators (not banks while employed).

---

## 2026-05-04 — Architecture: Rules-first, AI overlay

**Question:** Should the system be LLM-driven for strategic decisions, or rules-based with AI as overlay?

**Decision:** Rules-based core, ML for predictions, LLM for creative/explanation only.

**Rationale:**
- Banks have run rule-based decisioning for 30 years (Pega, SAS, FICO) — this is the proven architecture
- Rules: deterministic, auditable, cheap, fast, no vendor lock-in
- LLM-only systems are brittle, expensive, hard to defend in compliance review
- Owner's banking background pulls naturally toward this architecture
- Defensibility: rules + frameworks = durable IP; LLM prompts = anyone can copy

**Cost impact:** ~$0.50–1 per client per month vs $2–4 if LLM-heavy.

See [[01-Architecture]].

---

## 2026-05-04 — Lifecycle framework: 6 stages (not 9)

**Question:** Use full banking 9-stage framework or simplified 6-stage?

**Decision:** 6 stages for MVP. Banking 9-stage was too granular for e-com / SaaS where customer relationships are simpler (single product line, fewer products to cross-sell, simpler regulatory environment).

**Stages:** Acquisition, Onboarding, Engagement, Retention, Win-back, Advocacy.

**Future:** Add 9-stage as Pro tier feature for sophisticated customers (fintechs, neobanks, multi-product B2B SaaS).

See [[02-Lifecycle-Framework]].

---

## 2026-05-04 — Dynamic thresholds, not universal

**Question:** Use universal time thresholds (e.g., 90 days for Onboarding) or compute per client?

**Decision:** Compute thresholds dynamically from each client's data.

**Rationale:**
- Banking's 90-day onboarding doesn't translate to e-com (where customer cycles are 7–365 days)
- A coffee subscription has avg inter-purchase = 7 days; mattress brand = 1800 days. Same threshold can't apply.
- Use 75th percentile of time-to-2nd-purchase for Onboarding window
- Lapsed = 1.5× avg interval; Dormant = 3-4×; Archive = 5-6×
- Industry benchmarks as fallback when client data is thin

**Foundation:** Pareto/NBD (Schmittlein 1987), BG/NBD (Fader 2005) — public academic.

---

## 2026-05-04 — ML in MVP: CLV + NBP + Churn (not all 7 candidate models)

**Question:** How much ML in MVP?

**Decision:** Three ML models in MVP — CLV, NBP, Churn. Other models (NBO, price sensitivity, channel propensity, send-time) start as rules-based, upgrade to ML in Phase 2.

**Rationale (per model):**
- **CLV (BG-NBD + Gamma-Gamma):** 18-point accuracy gap vs rules; well-established library; off-the-shelf
- **NBP (collaborative filtering):** 20-point accuracy gap vs market basket; library handles math
- **Churn:** Core product value prop, banking standard, 10-point gap = real $ impact
- **NBO:** Cold-start problem severe (needs offer-response data); rules using ML scores work in MVP
- **Price sensitivity / channel / send-time:** Marginal accuracy gain over rules; don't justify MVP complexity

**Cost:** ~$0.50–2/client/month for ML, easily absorbed at $39/$99/$249 tiers.

**Why three rather than zero:** Owner correctly pushed back that "weak MVP = death in e-com" because customers are ROI-focused. Pure-rules positioning was too weak; "AI + ML powered" is the credibility threshold.

See [[04-CLV-Model]], [[05-NBP-Model]], [[06-Churn-Model]], [[07-NBO-Logic]].

---

## 2026-05-04 — Don't send emails ourselves in MVP

**Question:** Build our own email-sending infrastructure to compete with Klaviyo, or push strategies to existing tools?

**Decision:** MVP pushes to Klaviyo / Customer.io / Mailchimp / etc. Phase 2 adds optional auto-send via Postmark/SES. Phase 3 considers full ESP.

**Rationale:**
- Email deliverability is a deep specialized domain (Klaviyo has 50+ engineers on this)
- IP warming, bounce management, compliance (CAN-SPAM, CASL, GDPR) is real engineering
- Owner is solo + part-time + $1M debt → can't reinvent ESP infrastructure
- Customers using Klaviyo aren't switching off it for a 1-year-old startup
- "Sit above tools" positioning has lower friction than "replace Klaviyo"

**Phase 2 path:** Postmark/SES handle deliverability, we add UI + lifecycle automation logic. Lower lift than full ESP.

**YC story (if applicable):** "We started as the strategist; with funding, we'll build the full stack and replace Klaviyo entirely." Stronger than "I half-built an ESP solo."

---

## 2026-05-04 — IP separation from employer

**Trigger:** Owner shared internal bank documents (DIB CLV deck dated 27 Apr 2026, CLM Campaign Calendar dated 22 Apr 2026) while designing the product.

**Decision:** Build only from public industry frameworks + owner's general expertise (head-knowledge). NEVER use employer's specific documents, formulas, calibrations.

**Rationale:**
- Standard banking employment contracts include work-for-hire IP assignment
- Even if owner authored the documents, they belong to employer under work-for-hire
- Owner's *expertise and mental models* are 100% portable; specific employer documents are not
- UAE banks litigate aggressively on this

**What's safe to use:**
- Industry-standard stage names (Acquisition, Onboarding, etc. — not proprietary)
- Public academic frameworks (Pareto/NBD, BG/NBD, RFM, Gamma-Gamma)
- Owner's general judgment encoded as rules + system prompts

**What's not safe:**
- Specific employer documents, screenshots, calibrations
- DIB-specific discount rates (8-10% UAE) or cost factors (30-60% digital reduction)
- Verbatim copy from internal materials

**Recommendation made:** Owner should request written side-business approval from HR/Legal before launch.

---

## 2026-05-04 — Pricing: 4 tiers, $39 to $499

**Tiers:** Starter $39, Growth $99, Pro $249, Agency $499.

**No free tier** — attracts hobbyists, not buyers; absorbs support cost.

**Trial:** 14 days, no credit card required to start, prompts for card on Day 10.

**Anchoring:** Position vs hiring CLM consultant ($5–15k engagement) — makes $99/mo look cheap. Don't anchor to Klaviyo (we're not their competitor).

See [[12-Pricing]].

---

## 2026-05-04 — Skip landing page validation, test on friend's store

**Question:** Run paid ads to landing page first, OR build MVP and test on friend's store?

**Decision:** Skip landing page validation; go straight to MVP build. Friend's Shopify store as first design partner.

**Rationale (owner's argument):**
- Owner is confident the gap exists (verified — no competitor doing this exact wedge)
- Friend's store provides real data + real feedback without needing public marketing
- 18–20 week build is the bottleneck, not validation
- Time spent on landing page is time not spent building

**Risk accepted:** No early signal of willingness-to-pay until soft launch (Week 18+).

---

## 2026-05-04 — Project setup: Obsidian vault + Ruflo

**Decision:**
- Project folder: `C:\Users\Gamer1\lifecycle-dev\`
- Documentation in `docs/` as Obsidian vault (markdown files with `[[wiki-style]]` linking)
- Use Ruflo (claude-flow) for swarm coordination during build
- Memory entries in `~/.claude/projects/.../memory/` for cross-session context
- Working name: "lifecycle-dev" (final name TBD)

**Rationale:**
- Markdown docs are portable, version-controllable, AI-readable
- Obsidian gives navigation (graph view, backlinks) without lock-in
- Ruflo enables multi-agent parallel work during build phases

---

## 2026-05-05 — Lifecycle framework upgraded to 7 stages + 3 tiers

**Trigger:** User shared external `PRODUCT_SPEC.md` (2,126 lines) with an alternative 11-stage model. Comparison conducted; gaps identified.

**Decision:** Replace original 6-stage framework with **7 stages + 1 orthogonal tier dimension + behavior badges**.

**New 7 stages (mutually exclusive):**
Lead → New → Active → Slipping → At Risk → Churned → Dormant

**3 tiers (separate column):** Standard / Premium / VIP (CLV-based)

**Badges (behavior-based, multi-select):** won_back, champion, referrer, reviewer, ugc_creator

**Why:**
- Old 6-stage was too coarse — collapsed Slipping/At Risk/Churned into "Retention" and "Win-back," losing intervention granularity
- PRODUCT_SPEC's 11-stage was better on granularity but mixed phases/tiers/badges in one column (data model nesting issue)
- Hybrid 7+3+badges keeps the granularity AND fixes the nesting problem
- Won-back as 30-day badge (not stage) preserves tracking without state-machine complexity

## 2026-05-05 — Median replaces mean for all cycle calculations

**Trigger:** PRODUCT_SPEC explicitly uses median (not mean) for typical repurchase cycle. Our spec was inconsistent — used 75th percentile for some thresholds, "average" for others.

**Decision:** **Median throughout.** No use of arithmetic mean for repurchase intervals.

**Why:**
- Repurchase intervals are right-skewed distributions (long tail of customers with huge gaps pulls mean upward)
- Mean misses "typical customer" behavior; median captures it
- Industry standard for similar metrics in banking, telco, fraud detection
- Concrete example: skincare brand with 80 normal customers (35-45 day cycles) + 5 outliers (250-365 days). Mean = ~67 days. Median = ~38 days. Threshold = "1.5× normal" should be ~57 days, not ~100 days.

**Per-customer vs merchant median:**
- If customer has ≥3 purchases: use customer's own median
- If 1-2 purchases: blend customer + merchant median (weighted by data confidence)
- If 0-1 purchases: fall back to merchant median entirely

## 2026-05-05 — Threshold method: Option A (multipliers) for MVP, Option B (percentiles) for v1.5+

**Decision:** Use **multipliers of median** for MVP threshold computation, with **automatic upgrade to raw percentiles** once a merchant has >200 customers with 2+ orders.

**Option A (MVP):**
- Active: ≤ 1.0× median
- Slipping: 1.0–1.5× median
- At Risk: 1.5–2.5× median
- Churned: > 2.5× median
- Dormant: > 4× median (after failed Tier 4 win-back)

**Option B (v1.5+, when data is sufficient):**
- Active: ≤ p50 (median)
- Slipping: p50–p75
- At Risk: p75–p90
- Churned: > p90

**Why this evolution:**
- For typical right-skewed distributions, A and B produce similar segmentation 80-90% of the time
- A wins for new merchants (<200 customers) — multipliers are stable on small samples; percentiles flap
- B wins for mature merchants and edge cases — distribution-shape aware (handles bimodal, heavy-tail patterns)
- B is industry-standard for serious analytics (banks, telcos, academic CRM)
- Sophisticated buyers (Plus brands) prefer percentile rigor — credibility advantage at premium pricing tiers

**Implementation:** Compute both median AND percentiles in `merchant_metrics` daily job (cheap). Use multipliers by default. Auto-switch to percentiles once threshold met.

---

## 2026-05-04 — GitHub repo created

**Decision:** Private repo at `https://github.com/advancedtechhd-a11y/CLM` (under same org as VidForge). Branch: `main`. Local folder name and repo name differ — local is `lifecycle-dev`, repo is `CLM` — final product name TBD; either can be renamed later.

**Initial commits pushed:** spec scaffolding + Week 1 Next.js 14.2 setup.

---

## Future decisions to revisit

- [ ] Final product name (after MVP build, before public launch)
- [ ] Free tier in Phase 2? (TBD based on early-customer data)
- [ ] Annual pricing introduction (Phase 2)
- [ ] Self-send (Postmark/SES) introduction (Phase 2 trigger TBD)
- [ ] First custom integration beyond Phase 1 (depends on customer demand)
- [ ] When to apply for YC (target: $10k MRR)
- [ ] When to quit day job (target: $20k MRR + 6 months runway saved)

---

## How to use this log

When making a new significant decision:
1. Add a new dated section below the most recent entry
2. State the question, decision, and rationale
3. Cross-reference relevant docs with `[[wiki-links]]`

When revisiting an old decision:
1. Read the original entry
2. Note any changed conditions
3. Either update inline or add a new entry referencing the old one
