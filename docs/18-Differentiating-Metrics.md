# 18 — Differentiating Metrics

These are the metrics that turn the product from "another analytics tool" into the **customer intelligence layer** for e-commerce. Each is a deliberate differentiator vs. existing tools (Klaviyo, Lifetimely, Repeat, Triple Whale, Peel).

## 18.1 Customer Health Score (PRIMARY differentiator)

A composite **0-100 score per individual customer** summarizing their overall relationship state.

### Why it matters
- Merchants don't want 8 separate metrics — they want one number that says "this customer is healthy or in trouble"
- B2B CRM/CS platforms (Gainsight, Totango) use this pattern; e-com hasn't widely adopted
- Makes prioritization trivial: sort by health score, work the worst first
- Trackable over time: "Sarah's score dropped from 78 to 47 in 60 days — she's slipping"

### Score computation

5 sub-scores (each 0-100), weighted into final score:

```python
def compute_customer_health_score(customer, customer_metrics, merchant_metrics):
    # === Recency Score (30% weight) ===
    cycle_ratio = customer_metrics.recency_days / customer_metrics.expected_cycle_days
    if cycle_ratio <= 1.0:
        recency_score = 90 + (1.0 - cycle_ratio) * 10  # 90-100
    elif cycle_ratio <= 1.5:
        recency_score = 60 + (1.5 - cycle_ratio) / 0.5 * 20  # 60-80
    elif cycle_ratio <= 2.5:
        recency_score = 30 + (2.5 - cycle_ratio) / 1.0 * 20  # 30-50
    else:
        recency_score = max(0, 20 - (cycle_ratio - 2.5) * 5)
    
    # === Frequency Score (20% weight) ===
    p90_orders = merchant_metrics.p90_orders_per_customer
    median_orders = merchant_metrics.median_orders_per_customer
    if customer.orders_count >= p90_orders:
        frequency_score = 90 + min(10, (customer.orders_count - p90_orders) * 2)
    elif customer.orders_count >= median_orders + 1:
        frequency_score = 70 + (customer.orders_count - median_orders) / (p90_orders - median_orders) * 15
    elif customer.orders_count >= median_orders:
        frequency_score = 50 + (customer.orders_count - median_orders) * 15
    elif customer.orders_count >= 1:
        frequency_score = 30 + customer.orders_count * 15
    else:
        frequency_score = 10  # Lead

    # === Monetary Score (15% weight) ===
    spend_percentile = compute_spend_percentile(customer, merchant_metrics)
    if spend_percentile >= 90:
        monetary_score = 90 + (spend_percentile - 90)
    elif spend_percentile >= 50:
        monetary_score = 60 + (spend_percentile - 50) * 0.625
    elif spend_percentile >= 25:
        monetary_score = 40 + (spend_percentile - 25) * 0.8
    else:
        monetary_score = 20 + spend_percentile * 0.8

    # === Engagement Score (15% weight) ===
    # v1: Default 50 (no engagement data without Klaviyo integration)
    # v1.5+: Compute from email/SMS engagement
    if customer_metrics.email_engagement_data_available:
        open_rate_90d = customer_metrics.email_open_rate_90d
        if open_rate_90d >= 0.40:
            engagement_score = 80 + (open_rate_90d - 0.40) * 50
        elif open_rate_90d >= 0.15:
            engagement_score = 50 + (open_rate_90d - 0.15) / 0.25 * 25
        elif open_rate_90d > 0:
            engagement_score = 20 + open_rate_90d / 0.15 * 25
        else:
            engagement_score = 10
        if customer.email_unsubscribed:
            engagement_score = 0
    else:
        engagement_score = 50  # Neutral default

    # === Cycle Adherence Score (20% weight) ===
    # Personalized to customer's own buying pattern
    if customer_metrics.personal_cycle_available:
        personal_cycle = customer_metrics.personal_repurchase_cycle_days
        deviation_pct = abs(customer_metrics.recency_days - personal_cycle) / personal_cycle
        if deviation_pct <= 0.20:
            cycle_adherence = 85 + (0.20 - deviation_pct) * 75
        elif deviation_pct <= 0.50:
            cycle_adherence = 55 + (0.50 - deviation_pct) / 0.30 * 25
        elif deviation_pct <= 1.0:
            cycle_adherence = 25 + (1.0 - deviation_pct) / 0.50 * 25
        else:
            cycle_adherence = max(0, 20 - (deviation_pct - 1.0) * 10)
    else:
        cycle_adherence = recency_score  # fallback

    # === Final Weighted Score ===
    final_score = round(
        recency_score * 0.30 +
        frequency_score * 0.20 +
        monetary_score * 0.15 +
        engagement_score * 0.15 +
        cycle_adherence * 0.20
    )

    # Band assignment
    if final_score >= 80:
        band = 'thriving'
    elif final_score >= 60:
        band = 'healthy'
    elif final_score >= 40:
        band = 'slipping'
    elif final_score >= 20:
        band = 'at_risk'
    else:
        band = 'critical'

    return {
        'health_score': final_score,
        'band': band,
        'sub_scores': {
            'recency': round(recency_score),
            'frequency': round(frequency_score),
            'monetary': round(monetary_score),
            'engagement': round(engagement_score),
            'cycle_adherence': round(cycle_adherence)
        }
    }
```

### Score bands

| Score | Band | Action |
|-------|------|--------|
| 80-100 | **Thriving** | Reward, request reviews/referrals, exclusive perks |
| 60-79 | **Healthy** | Maintain, light engagement, cross-sell |
| 40-59 | **Slipping** | Soft re-engagement, no aggressive discounting |
| 20-39 | **At Risk** | Active win-back campaign with incentive |
| 0-19 | **Critical** | Final win-back attempt, then suppress |

### Where it surfaces in the product

**Customer list view:**
- Every customer row shows health score with colored band
- Sortable by score (default: lowest score with highest CLV first)
- Filterable by band

**Customer detail page:**
- Hero number at top: "Health Score: 47/100 — Slipping"
- Sub-score breakdown showing what's dragging it down
- Score history chart (last 90 days)
- Plain-English explanation: "Sarah's score dropped 31 points in 60 days. Main reason: she hasn't purchased in 67 days, twice her normal cycle. Her email engagement also stopped 45 days ago."

**Today view:**
- Top recommendations prioritized partly by health score × CLV (worst-affected high-value customers first)

**Segment views:**
- Each segment shows aggregate score distribution
- "Your VIP segment averages 87. Your win-back segment averages 28."

### Database schema additions

```sql
ALTER TABLE customer_metrics ADD COLUMN health_score INTEGER;
ALTER TABLE customer_metrics ADD COLUMN health_score_band TEXT;
ALTER TABLE customer_metrics ADD COLUMN recency_score INTEGER;
ALTER TABLE customer_metrics ADD COLUMN frequency_score INTEGER;
ALTER TABLE customer_metrics ADD COLUMN monetary_score INTEGER;
ALTER TABLE customer_metrics ADD COLUMN engagement_score INTEGER;
ALTER TABLE customer_metrics ADD COLUMN cycle_adherence_score INTEGER;
ALTER TABLE customer_metrics ADD COLUMN score_trend_30d INTEGER;
ALTER TABLE customer_metrics ADD COLUMN score_trend_direction TEXT;

CREATE INDEX idx_metrics_health_score ON customer_metrics(merchant_id, health_score DESC);
CREATE INDEX idx_metrics_band ON customer_metrics(merchant_id, health_score_band);

-- Daily snapshot for trend tracking
CREATE TABLE customer_health_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  health_score INTEGER NOT NULL,
  recency_score INTEGER,
  frequency_score INTEGER,
  monetary_score INTEGER,
  engagement_score INTEGER,
  cycle_adherence_score INTEGER,
  computed_on DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(customer_id, computed_on)
);
CREATE INDEX idx_health_history_customer ON customer_health_history(customer_id, computed_on DESC);
```

### Implementation rules

- Compute health scores in the daily metrics refresh job alongside existing customer_metrics computation
- Snapshot health history daily to a separate table — don't recompute history retroactively
- Surface scores everywhere customers appear (list, detail, segments, recommendations)
- Color-code bands consistently across UI (green Thriving, yellow Healthy, orange Slipping, red At Risk, dark red Critical)
- Always show "why" for low scores — never let merchant see "Health Score: 23" without explanation
- For new merchants (<30 days of data), show with reduced confidence indicators

---

## 18.2 Revenue at Risk (HEADLINE merchant metric)

Merchant-level dollar figure surfaced at the top of the dashboard. Creates urgency, justifies subscription cost.

### Computation

```python
def compute_revenue_at_risk(merchant_id):
    """
    Sum of expected future revenue (CLV) weighted by churn probability,
    across all customers with churn_probability > 50%.
    """
    at_risk_customers = query_customers_where(
        merchant_id=merchant_id,
        churn_probability_gt=0.50
    )
    revenue_at_risk = sum(
        c.predicted_clv_180d * c.churn_probability
        for c in at_risk_customers
    )
    # Industry average win-back conversion: 15-25%
    estimated_recoverable = revenue_at_risk * 0.20
    
    return {
        'total_at_risk': revenue_at_risk,
        'estimated_recoverable': estimated_recoverable,
        'at_risk_customer_count': len(at_risk_customers),
        'top_at_risk_customers': sorted(
            at_risk_customers,
            key=lambda c: -(c.predicted_clv_180d * c.churn_probability)
        )[:10]
    }
```

### Surfacing

Top of dashboard, hero number:
> **$47,300 of revenue is at risk** from 234 churning customers. Acting now could recover an estimated $9,460. [View at-risk customers →]

### Why it matters
- Quantifies the problem in dollars (not abstract metrics)
- Drives daily logins ("how much is at risk today?")
- Justifies subscription cost: "$99/month subscription, $47K at risk, even 5% recovery is 24x ROI"

### Schema

```sql
ALTER TABLE merchant_metrics ADD COLUMN revenue_at_risk NUMERIC;
ALTER TABLE merchant_metrics ADD COLUMN estimated_recoverable_revenue NUMERIC;
ALTER TABLE merchant_metrics ADD COLUMN at_risk_customer_count INTEGER;
```

Recomputed in the daily merchant_metrics job.

---

## 18.3 First-to-Second Purchase Tracker

The most expensive lifecycle transition in e-commerce. Most tools don't isolate it; we do.

### Metrics tracked

```sql
ALTER TABLE merchant_metrics ADD COLUMN first_to_second_conversion_rate NUMERIC;
-- % of first-time buyers who make a second purchase within 90 days

ALTER TABLE merchant_metrics ADD COLUMN median_days_to_second_purchase INTEGER;
-- median time gap for those who do convert

ALTER TABLE merchant_metrics ADD COLUMN first_to_second_revenue_lift NUMERIC;
-- average revenue lift per converted customer
```

### Computation

```python
def compute_first_to_second_metrics(merchant_id):
    customers = get_customers_with_first_purchase_180d_ago(merchant_id)
    converted = [c for c in customers if c.orders_count >= 2]
    conversion_rate = len(converted) / len(customers) if customers else 0
    
    days_to_second = [
        (c.second_order_at - c.first_order_at).days
        for c in converted
    ]
    median_days = np.median(days_to_second) if days_to_second else None
    
    # Best-converting product paths (1st product → 2nd product)
    paths = get_first_product_to_second_product_paths(merchant_id)
    top_paths = sorted(paths, key=lambda p: -p['conversion_rate'])[:5]
    
    return {
        'conversion_rate': conversion_rate,
        'median_days_to_second': median_days,
        'top_converting_product_paths': top_paths,
        'optimal_second_purchase_window': (median_days - 7, median_days + 7)
    }
```

### Surfacing

Dedicated dashboard widget:
> "Your first-to-second purchase conversion is 23% (industry benchmark for skincare: 38%). Customers who do convert do so around day 32. We recommend triggering a second-purchase campaign to first-time buyers between day 25-35. **Estimated revenue impact: $18,400/quarter.**"

### Why it matters
- Highest-ROI lifecycle stage to optimize
- Klaviyo doesn't isolate or surface this
- A 5% improvement in 1→2 conversion typically translates to 20-30% total revenue lift
- Aligns with our [[02-Lifecycle-Framework]] New → Active transition

---

## 18.4 Customer Concentration Risk

Health metric for merchant's overall business. Surfaces hidden risk.

### Computation

```python
def compute_concentration_risk(merchant_id):
    customers = get_all_customers_with_orders(merchant_id)
    customers_sorted = sorted(customers, key=lambda c: -c.total_spent)
    
    total_revenue = sum(c.total_spent for c in customers)
    top_10_pct_count = max(1, int(len(customers) * 0.10))
    top_10_pct_revenue = sum(c.total_spent for c in customers_sorted[:top_10_pct_count])
    
    concentration_pct = top_10_pct_revenue / total_revenue if total_revenue else 0
    
    # Risk if losing top 5 customers
    top_5_clv = sum(c.predicted_clv_365d for c in customers_sorted[:5])
    
    return {
        'top_10_pct_revenue_share': concentration_pct,
        'risk_level': 'high' if concentration_pct > 0.50 else 'medium' if concentration_pct > 0.35 else 'low',
        'top_5_customer_annual_value': top_5_clv,
        'top_5_customer_health_scores': [c.health_score for c in customers_sorted[:5]]
    }
```

### Surfacing

> "Your top 10% of customers generate 67% of revenue. This is **high concentration risk**. If you lost just your top 5 customers, you'd lose $34K/year in expected revenue. **Two of your top 5 currently have health scores below 50** — they need immediate attention."

### Schema

```sql
ALTER TABLE merchant_metrics ADD COLUMN top_10_pct_revenue_share NUMERIC;
ALTER TABLE merchant_metrics ADD COLUMN concentration_risk_level TEXT;
ALTER TABLE merchant_metrics ADD COLUMN top_5_customer_annual_value NUMERIC;
```

### Why it matters
- SMB merchants don't realize how concentrated their revenue is
- Sophisticated metric that builds trust
- Surfaces VIP retention as the highest priority

---

## 18.5 Discount Dependency Score

Per-customer + merchant-level metric on discount reliance.

### Per-customer computation

```python
def compute_discount_dependency(customer):
    orders = get_customer_orders(customer.id)
    total_orders = len(orders)
    discounted_orders = len([o for o in orders if o.discount_total > 0])
    
    if total_orders == 0:
        return None
    
    dependency_pct = discounted_orders / total_orders
    
    if dependency_pct >= 0.70:
        category = 'highly_dependent'
    elif dependency_pct >= 0.40:
        category = 'moderately_dependent'
    elif dependency_pct >= 0.15:
        category = 'occasional_user'
    else:
        category = 'full_price_buyer'
    
    return {
        'dependency_pct': dependency_pct,
        'category': category
    }
```

### Schema

```sql
ALTER TABLE customer_metrics ADD COLUMN discount_dependency_pct NUMERIC;
ALTER TABLE customer_metrics ADD COLUMN discount_dependency_category TEXT;
ALTER TABLE merchant_metrics ADD COLUMN merchant_discount_dependency_pct NUMERIC;
```

### Recommendations triggered

- **full_price_buyer + loyal customer:** *"Don't send discounts. They buy at full price. Recommend perks or exclusive access instead."*
- **highly_dependent customer at risk:** *"They've been trained on discounts. Win-back must include 20%+ off to convert."*
- **merchant discount % > 30%:** *"Your merchant-wide discount dependency is high. Industry benchmark for [category]: 18%. Consider strategy to reduce."*

### Why it matters
- Merchants don't realize they've trained customers to wait for discounts
- Reduces gross margin tax
- Sophisticated metric, not in other tools
- Feeds [[07-NBO-Logic]] — full-price buyers don't get discount offers

---

## Implementation priority within MVP build

These all go into **Phase 3 (Rules Engine, weeks 6-10)** of the build plan, alongside RFM and segmentation:

| Feature | Build effort | Phase | Dependencies |
|---------|--------------|-------|--------------|
| Customer Health Score + history table | 5 days | Phase 3 | RFM scoring done first |
| Discount Dependency | 2 days | Phase 3 | Order data synced |
| Concentration Risk | 2 days | Phase 3 | CLV predictions available |
| Revenue at Risk | 2 days | Phase 7 (Reporting) | Churn predictions available |
| First-to-Second Tracker | 3 days | Phase 7 (Reporting) | Order data synced |

**Total added time: ~14 days = ~2 weeks of work** (overlapping with existing phase work, so net schedule impact is ~1 week).

## Phase 2 metrics (deferred)

These are documented in PRODUCT_SPEC and worth building in v1.5+ but not MVP:

- **Saturation/Fatigue Detection** (cross-channel touch tracking) — needs Klaviyo + Postscript integration
- **Time-of-Day / Day-of-Week Optimization** — needs engagement data from Klaviyo
- **Acquisition Quality Score** (UTM source × CLV/churn) — needs UTM hygiene
- **Predicted vs Actual public widget** (credibility builder) — needs accumulated prediction data
- **Margin-Aware Recommendations** — needs product cost data
- **Replenishment/Subscription Layer** — needs Recharge/Bold integration
- **Customer Concierge Timeline** (full event log) — UI work, valuable for v1.5

These are tracked in [[14-Build-Plan]] as Phase 2 features.
