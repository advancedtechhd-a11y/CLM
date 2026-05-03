# 04 — CLV Model (Customer Lifetime Value)

## What this predicts

For each customer, two outputs:
1. **Historical CLV** — what they've actually spent to date
2. **Predicted forward CLV** — projected total future value over next T months

Plus tier assignment: Platinum / Gold / Silver / Bronze.

## Method

Two ML models combined (both from `lifetimes` Python library):

### BG/NBD model — predicts purchase frequency
- Fader, Hardie, Lee (2005) — public academic, peer-reviewed
- Models when each customer will purchase next
- Inputs: recency (R), frequency (F), tenure (T)
- Output: expected number of future purchases

### Gamma-Gamma model — predicts purchase value
- Fader, Hardie (2013) — public academic
- Models the monetary value of each purchase
- Inputs: frequency, average monetary value
- Output: expected average value per future purchase

### Combined formula
```
Predicted CLV = E[future purchases] × E[avg purchase value] × discount_factor
```

Discount factor adjusts for time-value-of-money (default 10% annual, configurable).

## Implementation (concrete code sketch)

```python
from lifetimes import BetaGeoFitter, GammaGammaFitter
from lifetimes.utils import summary_data_from_transaction_data

# Step 1: prepare RFM summary from raw transactions
summary = summary_data_from_transaction_data(
    transactions_df, 
    customer_id_col='customer_id',
    datetime_col='order_date',
    monetary_value_col='total',
    observation_period_end='2026-05-04'
)

# Step 2: fit frequency model
bgf = BetaGeoFitter(penalizer_coef=0.001)
bgf.fit(summary['frequency'], summary['recency'], summary['T'])

# Step 3: fit value model
ggf = GammaGammaFitter(penalizer_coef=0.001)
ggf.fit(summary[summary['frequency'] > 0]['frequency'],
        summary[summary['frequency'] > 0]['monetary_value'])

# Step 4: predict CLV for each customer
summary['predicted_clv'] = ggf.customer_lifetime_value(
    bgf,
    summary['frequency'], summary['recency'], summary['T'],
    summary['monetary_value'],
    time=24,           # 24 months horizon
    discount_rate=0.01 # monthly discount rate
)
```

That's roughly 30 lines of code. The library handles all the math.

## Output structure

Per customer, we store:
```json
{
  "customer_id": "abc123",
  "historical_clv": 340,
  "predicted_clv_24mo": 890,
  "p_alive": 0.68,
  "expected_future_purchases_12mo": 4.2,
  "expected_avg_value": 67,
  "clv_tier": "Gold",
  "clv_percentile": 78,
  "confidence": 0.82,
  "computed_at": "2026-05-04T..."
}
```

## CLV tier assignment

Computed per client (not universal):
- **Platinum** — top 5% predicted CLV
- **Gold** — next 15%
- **Silver** — next 30%
- **Bronze** — bottom 50%

Tier is recomputed monthly. Customers can migrate up/down tiers.

## Where CLV is used

The CLV tier drives multiple decisions:

| Use case | How CLV tier affects it |
|----------|--------------------------|
| Retention save offers | Platinum/Gold get premium offers; Bronze gets cheap email |
| Win-back tier intensity | High CLV = SMS + email + paid retargeting; Bronze = email only |
| Cross-sell budget | Higher CLV = full-price NBP; lower = discounted |
| Referral program eligibility | Top tiers get prioritized advocacy program enrollment |
| Customer service routing | Platinum may get human support; Bronze AI/self-serve |

## Cold-start handling

For new clients with <50 customers having sufficient purchase history:
- Use industry-category benchmarks for initial CLV estimates
- Show "Estimated — based on industry data" badge
- Switch to data-driven CLV once threshold met

For new customers (just first purchase) within an established client:
- Use cohort averages until the customer has 2+ purchases
- Show "Predicting — limited data" badge

## Refresh cadence

- Initial fit: when client onboards (or accumulates sufficient data)
- Re-fit: monthly (background job)
- Per-customer scoring: on data sync (incremental)

## Cost

Training: runs on a single Python process, ~30 seconds for 100k customers. Cost per client per month: <$0.10 in compute (Modal/Replicate or on Railway worker).

Inference: vectorized, scoring 10k customers in <1 second.

## Compared to rules-based CLV

| Metric | Rules-based (cohort math) | ML (BG-NBD + GG) |
|--------|---------------------------|---------------------|
| Accuracy | ~70% | ~88% |
| Cold-start | Better (just averages) | Worse (needs data) |
| Defensibility | Low (anyone can copy) | Medium (the framework, not the model) |

ML wins for accuracy, which directly impacts retention spend efficiency. The 18-point accuracy gap matters for budgeting save offers.
