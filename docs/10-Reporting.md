# 10 — Reporting

Reporting is the make-or-break of customer retention for OUR product. Without visible ROI, customers cancel. Banks have conversion reports per campaign — we need that too, adapted to e-com.

## 3 layers of reporting

### Layer 1: Per-program performance (per campaign)

For every program the client activates, we track:

```
─────────────────────────────────────────
PROGRAM PERFORMANCE — Dormancy Final Attempt
Activated: 1 Apr 2026 → 30 Apr 2026
─────────────────────────────────────────

📊 AUDIENCE
   Sent to:               47 customers
   Delivered:             45 (96%)
   Opened:                28 (62%) [benchmark: 22%] ✅
   Clicked:               12 (27%) [benchmark: 4%] ✅
   Converted (purchase):   7 (15%) [benchmark: 6%] ✅✅

💰 REVENUE IMPACT
   Attributed revenue:   $1,847
   Avg order value:      $264
   Cost (offers given):  $462
   Net contribution:    $1,385

🔄 CUSTOMER STATE CHANGES
   Won back to active:    7
   Re-permission opt-in:  4 (still on list, no purchase)
   Archived:             34 (clean removal)
   List health saved:    ~$4.20/mo email cost

🎯 ROI vs LifecycleAI
   Cost of subscription:  $79
   Revenue attributable: $1,385
   ROI:                  17.5×

[View customer-level detail] [Compare to last month]
─────────────────────────────────────────
```

### Layer 2: Stage-health dashboard

Monthly view of how each lifecycle stage is performing:

```
─────────────────────────────────────────
LIFECYCLE HEALTH — April 2026
─────────────────────────────────────────

📊 OVERALL HEALTH SCORE
   This month: 73/100  ▲ +6 from March

🚪 STAGE TRANSITION RATES
   Acquisition → Onboarding (conversion):
     This month: 12.4% | Last: 11.1% ▲
   
   Onboarding → Engagement (activation):
     This month: 41% | Last: 36% ▲
   
   Engagement → At Risk (leakage):
     This month: 8% | Last: 11% ▼ (good!)
   
   At Risk → Saved:
     This month: 34% | Last: 28% ▲
   
   Win-back → Recovered:
     This month: 14% | Last: 9% ▲

📈 BOOK GROWTH
   Active customers:  4,829 → 5,124 (+295)
   Total CLV (predicted): $1.4M → $1.62M

💎 VALUE TIER MIGRATION
   Bronze → Silver: 47 customers
   Silver → Gold: 19
   Gold → Platinum: 4
   Total upward migration value: $87k forward CLV
─────────────────────────────────────────
```

### Layer 3: AI-generated monthly narrative

LLM writes a personalized digest each month:

```
"Hi {{first_name}},

Here's your LifecycleAI impact for April 2026:

✅ What worked
- Dormancy archive cleanup recovered 7 customers worth 
  $1,847 and saved $4.20/mo in email costs going forward
- Onboarding Day-21 NBP campaign converted 41% of new 
  customers to second purchase (vs 32% last month)
- Your Platinum tier grew by 4 customers ($23k forward CLV)

⚠️ What needs attention
- Cart abandonment recovery dropped 12% — discount may 
  be too aggressive (margin loss). Recommend testing 
  free shipping variant.
- 'Hibernating' segment grew 8% — want to run a fresh 
  win-back?

🎯 What's queued for May
- 3 new Engagement-stage NBP campaigns (estimated $4–6k impact)
- Q2 advocacy program (referral activation for 89 candidates)

Total ROI this month: 17.5× | Lifetime ROI: 11.2×

[See full report]"
```

This is **why customers don't cancel.** They see the money.

## Attribution methodology

### MVP: Time-window attribution

```
Customer received campaign X → made purchase within Y days = attributed
```

Default windows (configurable per business):
- High-frequency (e-com consumables): 7-day window
- Low-frequency (apparel, home goods): 30-day window
- Subscription: until next billing cycle

Industry-standard last-click-style attribution. Simple, defensible.

### Phase 2 enhancements
- **Multi-touch attribution** — credit shared across touches
- **Control groups** — hold out 5% as control to measure true incremental lift
- **Causal inference** — separate correlation from causation

## What we measure (KPIs by stage)

| Stage | Primary KPI | Secondary KPIs |
|-------|------------|------------------|
| Acquisition | Lead → customer conversion rate | Cost per conversion, time to conversion |
| Onboarding | 1st → 2nd purchase rate (activation) | Time to 2nd purchase, AOV growth |
| Engagement | Repeat purchase frequency | Cross-category penetration, AOV |
| Retention | Save rate (At Risk → recovered) | False positive rate, save offer ROI |
| Win-back | Recovery rate per tier | Cost per recovery, archive rate |
| Advocacy | Referrals generated, NPS | UGC submitted, review rate |

## Comparative benchmarks

We show:
- This month vs last month (trend)
- vs industry average (where we have benchmark data)
- vs your own historical baseline (rolling 6-mo avg)

Industry benchmarks come from public sources (Klaviyo benchmarks, Shopify reports, academic CRM literature). Periodically updated.

## Customer-level drill-down

For any program, customer-level view:

```
SARAH JONES (sarah@email.com)
Stage: Engagement → Retention (entered 2026-04-12)
CLV: $890 (Gold tier)
Churn risk: 78% (Critical)
Last purchase: 2026-02-04 ($124 — Vitamin C Serum)

Programs received:
- 2026-04-15: Save offer email (15% off)
  → Opened: ✅
  → Clicked: ✅
  → Purchased: ✅ ($87 — Day 16)
  → Result: SAVED, back to Engagement

Forward predicted CLV: +$340 from this save
ROI on this save: $87 - $13 (discount) = $74 net
```

Useful for: sanity-checking ROI, understanding individual customer journey, troubleshooting.

## How attribution data flows

```
1. Client activates program → we log program_execution
2. Client pushes to Klaviyo → we log send_attempted
3. Klaviyo API webhook reports send_completed, opens, clicks
4. Customer makes purchase → Stripe/Shopify webhook fires
5. Rules engine: "did purchase happen within attribution window 
   of any active program touch?"
6. If yes → log conversion, attribute revenue
7. Aggregate per program for dashboard
```

Requires:
- Klaviyo API integration (read engagement)
- Stripe/Shopify webhooks (read purchases)
- Database table: `program_executions` linked to `customer_actions`

## Why this matters for retention of OUR customers

Without reporting:
- Customer can't see ROI → believes "this is just an extra subscription cost"
- Cancels in month 2–3
- LTV: ~$80–200

With reporting:
- Customer sees $1,385 attributed monthly revenue from $79 subscription
- Renews indefinitely
- LTV: $2,000+ (3-year retention)

**Reporting is the #1 retention feature for the SaaS itself.** Build it well.
