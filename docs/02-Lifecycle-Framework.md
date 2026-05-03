# 02 — Lifecycle Framework

## The 6 stages

Banking-derived but simplified for e-com / SaaS. Banks use 8–9 stages because relationships are multi-product and multi-decade. E-com / SaaS doesn't have that complexity, so we collapse to 6.

| # | Stage | Definition | E-com mapping | SaaS mapping |
|---|-------|------------|---------------|--------------|
| 1 | **Acquisition** | Lead → first transaction | Newsletter / account / cart / first order | Visit → trial → first paid |
| 2 | **Onboarding** | First transaction → first-value milestone | Day 0–90, secure 2nd purchase | Trial → activated → first paid month |
| 3 | **Engagement** | Active customer relationship | Repeat purchase, AOV growth, cross-category | Feature adoption, expansion |
| 4 | **Retention** | At Risk + active save | Frequency drop, save offer | Renewal risk, prevent downgrade |
| 5 | **Win-back** | Lapsed → reactivation (4 tiers) | See [[#Win-back tiers]] below | Post-cancellation recovery |
| 6 | **Advocacy** | Promoters, referrers, VIPs | NPS 9+, referrals, UGC | Promoters, case studies |

## Lead vs Customer (the wall)

Acquisition handles all pre-transaction states (lead nurture). Onboarding starts at **first transaction** — money has changed hands.

| Status | Stage | Examples |
|--------|-------|----------|
| Lead | Acquisition | Newsletter sub, account created, cart abandoned, free trial |
| 🟢 First transaction | Acquisition → Onboarding transition | First purchase or first paid subscription |
| Customer | Onboarding → Engagement → ... → Advocacy | Anyone who's transacted at least once |

This split is critical because lead nurture campaigns differ fundamentally from customer onboarding campaigns.

## Dynamic thresholds (per client, not universal)

We **don't** use universal thresholds (90 days, etc.). Each client's thresholds are computed from their own data:

| Threshold | Formula | Example (skincare) | Example (coffee subscription) |
|-----------|---------|---------------------|-------------------------------|
| Onboarding window | 75th percentile of time-to-2nd-purchase | ~54 days | ~10 days |
| Lapsed threshold | 1.5× avg inter-purchase interval | 63 days | 11 days |
| Dormant threshold | 3–4× avg inter-purchase | 168 days | 21 days |
| Archive threshold | 5–6× avg inter-purchase | 252 days | 35 days |

Computed at onboarding from client data, recalculated monthly. Falls back to industry-category benchmarks when client data is thin (<50 customers with 2nd purchase).

Academic foundation: Pareto/NBD (Schmittlein 1987) and BG/NBD (Fader 2005) — public peer-reviewed literature.

## Edge cases

### Single-purchase businesses (mattresses, furniture, weddings)
If avg time-to-2nd-purchase > 365 days, switch to **"Single-Purchase Business Mode"**:
- Activation = first review, social share, or referral generated
- Engagement = repeat brand interactions (email, browse, accessories)
- Win-back doesn't apply
- Advocacy is the main expansion vector

### Subscription businesses
- Cycle is deterministic (next billing date)
- Onboarding window = 1 billing cycle
- Lifecycle driven by: payment failures, cancellation requests, downgrade signals

### Hybrid (one-time + subscription)
Compute thresholds separately per cohort, treat as different lifecycle paths in dashboard.

## Onboarding completion

Onboarding ends at **first-value milestone OR T+window**, whichever comes first.

First-value defaults by business type:
- E-com: 2nd purchase
- E-com (high-AOV / low-frequency): first repeat order OR positive review
- SaaS: feature adoption milestone (e.g., used core feature 5 times)
- Subscription box: 3rd shipment received without cancellation

Configurable per client.

## Win-back tiers (with archive routing)

Dormancy doesn't deserve its own stage — it's the deep end of Win-back with escalating treatment:

| Tier | Definition | Treatment | Banking analog |
|------|------------|-----------|----------------|
| **Light Lapsed** | 1–1.5× past avg interval | Soft nudge, no offer | Engagement reminder |
| **Moderate Lapsed** | 1.5–2.5× | Targeted offer, NBP-driven | Reactivation campaign |
| **Deep Lapsed** | 2.5–4× | Premium offer (CLV-tiered) | Last-call retention |
| **Dormant** | 4–6× OR failed all 3 tiers above | Final emotional appeal + best offer | Pre-escheatment |
| **Archived** | Failed dormancy attempt | Stop active marketing | Account closed / escheated / collections |

### Archive routing (3-state, mirrors banking escheatment)

After failed Dormancy attempt:

| Customer state | Action | Banking analog |
|----------------|--------|----------------|
| Has positive asset (loyalty points, store credit, gift card) | Move to "Low-Touch List" — newsletter only | Escheated to central bank — preserved low-cost touch |
| Zero balance / no relationship | Full archive — remove from marketing | Account closed |
| Negative balance / pending dispute / unfulfilled refund | Operational queue (not marketing) | Negative balance / collections |

This discipline saves email costs, protects deliverability, and surfaces unfulfilled obligations.

## Stage transition rules (defaults, configurable)

| Transition | Default rule |
|------------|--------------|
| Acquisition → Onboarding | First transaction |
| Onboarding → Engagement | 2nd purchase OR T+window OR first-value milestone |
| Engagement → At Risk | Frequency drop > 50% baseline OR no purchase in 1.5× avg gap |
| At Risk → Retention (saved) | Save offer triggered/responded |
| At Risk → Win-back | Past lapsed threshold without save response |
| Win-back tier escalation | Time-based (see Win-back tiers above) |
| Dormant → Archived | Failed final dormancy attempt |
| Active → Advocacy | NPS 9+ OR referred new customer OR top 5% LTV in cohort OR repeat orders for non-self addresses |

## Special signals (cross-cutting)

These modify stage transitions and trigger interventions across all stages:

- **BNPL late payment** — early At Risk signal (banks track this)
- **Subscription downgrade (SaaS)** — At Risk earlier than payment failure
- **Refund / dispute** — operational queue, not marketing
- **Negative review** — Retention escalation
- **Customer service complaint** — At Risk signal
- **Positive review** — Advocacy candidate

See [[03-Segmentation]] for how these become segments.
