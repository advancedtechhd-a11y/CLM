# 02 — Lifecycle Framework

## Architecture: 7 stages + 1 tier dimension

A customer is described by **two orthogonal classifications**:

1. **Lifecycle stage** (one of 7, mutually exclusive) — *what behavior right now?*
2. **Value tier** (one of 3, separate column) — *how valuable?*

This separation prevents the data-model nesting confusion you get when stages and tiers are mixed (e.g., "Loyal" vs "VIP" vs "Active" all in one column).

## The 7 lifecycle stages

| # | Stage | Definition | Cycle ratio (× median) | E-com mapping | SaaS mapping |
|---|-------|------------|------------------------|---------------|--------------|
| 1 | **Lead** | Registered, no purchase | N/A | Newsletter / account / cart | Trial signup |
| 2 | **New** | In onboarding window (dynamic) | 0 — first purchase made | Day 0 → first-value milestone | Trial → first paid month |
| 3 | **Active** | On cycle, post-onboarding | ≤ 1.0× | Repeat purchases, normal rhythm | Active subscription, on plan |
| 4 | **Slipping** | Slightly overdue | 1.0 – 1.5× | Frequency drop early-warning | Reduced usage, light disengagement |
| 5 | **At Risk** | Significantly overdue, save window | 1.5 – 2.5× | Past normal rhythm, save needed | Cancellation risk |
| 6 | **Churned** | Past cycle, win-back territory | > 2.5× | Lapsed buyer | Cancelled subscription |
| 7 | **Dormant** | Failed final win-back, archived | After failed Tier 4 attempt | Archive routing applies | Permanent churn |

## The 3 value tiers (orthogonal — separate column)

CLV-based, recomputed monthly:

| Tier | Definition |
|------|------------|
| **Standard** | Bottom ~80% by predicted CLV |
| **Premium** | Top 20% by CLV |
| **VIP** | Top 5% by CLV |

A customer can be: **Active + VIP** / **At Risk + Premium** / **Churned + Standard** etc.

In the database:
```sql
customers
├── lifecycle_stage:  TEXT  -- one of 7 stages
└── value_tier:       TEXT  -- one of 3 tiers
```

## Lead vs Customer (the wall)

The transition from **Lead → New** is the first transaction. Everything before is lead nurture; everything after is customer relationship management.

| Status | Stage | Examples |
|--------|-------|----------|
| Lead | Lead | Newsletter sub, account created, cart abandoned, free trial |
| 🟢 First transaction | Lead → New transition | First purchase or first paid subscription |
| Customer | New → Active → … → Dormant | Anyone who has transacted at least once |

This split is critical because lead nurture campaigns differ fundamentally from customer onboarding campaigns. See [[08-Message-Blueprints]].

## Onboarding window (the New stage)

The **New** stage is time-bounded — when does it end?

**Onboarding ends at first-value milestone OR T+onboarding_window, whichever comes first.**

First-value defaults by business type:
- E-com: 2nd purchase
- E-com (high-AOV / low-frequency): first repeat order OR positive review
- SaaS: feature adoption milestone (e.g., used core feature 5 times)
- Subscription box: 3rd shipment received without cancellation

Configurable per client.

## Dynamic thresholds (median-based, per client)

We **don't** use universal thresholds (90 days, etc.). Each client's thresholds are computed from their own data.

### Central tendency: median (not mean)

Repurchase intervals are right-skewed (a long tail of customers with huge gaps pulls the mean upward and away from typical behavior). **Median is the typical cycle.**

### Threshold calculation: Option A (multipliers of median) — MVP default

| Threshold | Formula | What it captures |
|-----------|---------|------------------|
| **Onboarding window** | 1.5× median time-to-2nd-purchase OR 90 days, whichever first | When most repeat customers have repeated |
| **Active** | cycle_ratio ≤ 1.0× median | On normal rhythm |
| **Slipping** | 1.0× < cycle_ratio ≤ 1.5× | Slight slowdown, soft nudge |
| **At Risk** | 1.5× < cycle_ratio ≤ 2.5× | Save window, intervention warranted |
| **Churned** | cycle_ratio > 2.5× | Win-back tier sequence begins |
| **Dormant** | After 4× median + failed final win-back | Archive routing applies |

Examples:

| Business type | Median time-to-2nd | Onboarding | Slipping | At Risk | Churned | Dormant |
|---------------|---------------------|------------|----------|---------|---------|---------|
| Daily coffee subscription | 7 days | ~10 days | 7-10 | 11-17 | 18+ | 28+ |
| Skincare brand | 38 days | ~57 days | 38-57 | 58-95 | 95+ | 152+ |
| Mid-frequency apparel | 60 days | ~90 days | 60-90 | 91-150 | 150+ | 240+ |
| Home goods | 120 days | ~180 days | 120-180 | 181-300 | 300+ | 480+ |

**All thresholds derived from THEIR data**, not universal constants.

Computed at onboarding from client data, recalculated monthly. Falls back to industry-category benchmarks when client data is thin (<50 customers with 2nd purchase).

### Per-customer vs merchant-level median

Use the customer's OWN median if they have enough purchase history:

```python
def compute_customer_expected_cycle(customer, merchant_metrics):
    customer_intervals = compute_intervals_for_customer(customer)
    
    if len(customer_intervals) >= 3:
        # Trust the customer's own pattern
        return median(customer_intervals)
    elif len(customer_intervals) >= 1:
        # Blend customer + merchant (weighted by data confidence)
        weight = len(customer_intervals) / 3.0
        return weight * median(customer_intervals) + (1 - weight) * merchant_metrics.median
    else:
        # Fall back to merchant baseline
        return merchant_metrics.median
```

### Future upgrade: Option B (raw percentiles) — v1.5+

When a merchant has >200 customers with 2+ orders, percentile-based thresholds are more accurate for distribution-shape edge cases (heavy tails, bimodal patterns).

| Threshold | Option A (MVP — multipliers) | Option B (v1.5+ — percentiles) |
|-----------|------------------------------|--------------------------------|
| Active | ≤ 1.0× median | ≤ p50 (median) |
| Slipping | 1.0–1.5× median | p50 – p75 |
| At Risk | 1.5–2.5× median | p75 – p90 |
| Churned | > 2.5× median | > p90 |

For typical right-skewed distributions, both produce similar segmentation 80-90% of the time. The differences appear in:
- Heavy-tail distributions (luxury, low-frequency)
- Bimodal patterns (subscribers + one-time gift buyers)
- Very mature merchants where distribution shape matters more than central tendency

**Migration plan:**
- v1.0 — Compute both median AND percentiles in `merchant_metrics` job (cheap)
- v1.0 — Use multiplier-based thresholds (Option A) by default
- v1.5+ — Once merchant has enough data (>200 customers w/ 2+ orders), switch to percentile-based thresholds (Option B) automatically
- v2+ — Sophisticated buyers (Plus brands, agencies) can opt into percentile-mode early

```python
def get_thresholds(merchant_metrics, customer_count_with_2plus_orders):
    if customer_count_with_2plus_orders < 200:
        return {
            'method': 'multiplier',
            'lapsed': 1.5 * merchant_metrics.median,
            'at_risk': 2.5 * merchant_metrics.median,
            'churned': 4.0 * merchant_metrics.median,
        }
    else:
        return {
            'method': 'percentile',
            'lapsed': merchant_metrics.p75,
            'at_risk': merchant_metrics.p90,
            'churned': merchant_metrics.p95,
        }
```

Both methods are documented; merchant data triggers the upgrade automatically.

Academic foundation: Pareto/NBD (Schmittlein 1987) and BG/NBD (Fader 2005) — public peer-reviewed literature.

## Edge cases

### Single-purchase businesses (mattresses, furniture, weddings)

If median time-to-2nd-purchase > 365 days, switch to **"Single-Purchase Business Mode"**:
- Activation = first review, social share, or referral generated
- Engagement = repeat brand interactions (email, browse, accessories)
- Win-back doesn't apply (no normal cycle to be past)
- Advocacy is the main expansion vector

### Subscription businesses

- Cycle is deterministic (next billing date)
- Onboarding window = 1 billing cycle
- Lifecycle driven by: payment failures, cancellation requests, downgrade signals

### Hybrid (one-time + subscription)

Compute thresholds separately per cohort, treat as different lifecycle paths in dashboard.

## Win-back tiers (within Churned + Dormant stages)

The Churned stage isn't a single state — it's a 4-tier intervention sequence with escalating treatment:

| Tier | Definition | Treatment | Banking analog |
|------|------------|-----------|----------------|
| **Tier 1: Light** | Just entered Churned (cycle 2.5-3×) | Soft nudge, no offer | Engagement reminder |
| **Tier 2: Moderate** | Tier 1 didn't respond (3-3.5×) | Targeted offer, NBP-driven | Reactivation campaign |
| **Tier 3: Deep** | Tier 2 didn't respond (3.5-4×) | Premium offer (CLV-tiered) | Last-call retention |
| **Tier 4: Final (Dormancy)** | Tier 3 didn't respond OR > 4× median | Final emotional appeal + best offer | Pre-escheatment |
| **→ Dormant stage** | Failed Tier 4 attempt | Archive routing applies | Account closed / escheated / collections |

### Archive routing (3-state, mirrors banking escheatment)

After failed Tier 4 dormancy attempt, customer routes based on remaining relationship state:

| Customer state | Action | Banking analog |
|----------------|--------|----------------|
| Has positive asset (loyalty points, store credit, gift card) | Move to "Low-Touch List" — newsletter only | Escheated to central bank — preserved low-cost touch |
| Zero balance / no relationship | Full archive — remove from marketing | Account closed |
| Negative balance / pending dispute / unfulfilled refund | Operational queue (NOT marketing) | Negative balance / collections |

This discipline saves email costs, protects deliverability, and surfaces unfulfilled obligations.

## Won-back (badge, not stage)

When a customer in Churned or Dormant returns and makes a purchase, they re-enter the lifecycle as **Active** with a `won_back_at` timestamp. The "Won-back" status is a **30-day badge**, not a stage:

```sql
customers
├── lifecycle_stage:  "Active"
├── value_tier:       "Premium"
├── won_back_at:      "2026-05-04 14:23:00"  -- expires after 30 days
```

Why a badge instead of a stage:
- They're behaviorally Active again
- Their tier-based interventions still apply
- Won-back-specific messaging fires for 30 days (special re-onboarding)
- Tracking measures Win-back program success

## Advocacy (badge, not stage)

Similar treatment — Advocacy is **behavior-based badges**, not a stage:

```sql
customers
├── lifecycle_stage:    "Active"
├── value_tier:         "VIP"
├── advocacy_badges:    ["champion", "referrer", "reviewer"]
```

Badge types:
- `champion` — NPS 9-10 response
- `referrer` — brought new customers
- `reviewer` — left positive review (4-5 stars)
- `ugc_creator` — submitted photos/videos

A customer with any advocacy badge is eligible for advocacy programs (referral invites, UGC requests, VIP perks). They remain in their behavioral stage (usually Active or Premium/VIP tier).

## Stage transition rules (defaults, configurable)

| Transition | Default rule |
|------------|--------------|
| Lead → New | First transaction (purchase or paid subscription) |
| New → Active | First-value milestone hit OR T+onboarding_window expires |
| Active → Slipping | cycle_ratio crosses 1.0× median |
| Slipping → At Risk | cycle_ratio crosses 1.5× median |
| Slipping → Active | New purchase made (back on cycle) |
| At Risk → Active | Save offer accepted, new purchase |
| At Risk → Churned | cycle_ratio crosses 2.5× median |
| Churned tier escalation | 7-14 days between tiers, no response |
| Churned → Active | Win-back successful (purchase made) — `won_back_at` badge set |
| Churned → Dormant | Failed Tier 4 final attempt |
| Dormant → Archived | After 30-day re-permission window with no response |

## Special signals (cross-cutting modifiers)

These don't change the stage directly but trigger interventions across all stages:

- **BNPL late payment** — early At Risk trigger (banks track this; we should too)
- **Subscription downgrade (SaaS)** — At Risk before payment failure
- **Refund / dispute** — operational queue, not marketing
- **Negative review** — At Risk + escalation
- **Customer service complaint** — At Risk signal
- **Positive review** — Advocacy candidate (badge: `reviewer`)
- **Referral signup attributed** — Advocacy badge: `referrer`
- **NPS 9-10 response** — Advocacy badge: `champion`

See [[03-Segmentation]] for how these become segments and trigger campaigns.

## Migration note (from old 6-stage spec)

Earlier drafts of this doc used a 6-stage framework (Acquisition / Onboarding / Engagement / Retention / Win-back / Advocacy). Replaced with 7 stages + 3 tiers + badges for these reasons:

- **Better intervention granularity** (Slipping vs At Risk vs Churned have distinct cycle thresholds, distinct messaging)
- **Cleaner data model** (no nesting confusion between stage / tier / status)
- **Won-back tracked explicitly** (was missing in old spec)
- **Median replaces mean** for all threshold calculations (right-skew of distributions)

See [[15-Decisions-Log]] for full rationale.
