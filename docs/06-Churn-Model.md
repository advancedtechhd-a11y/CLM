# 06 — Churn Model

## What this predicts

For each customer, the probability they will churn in the next N days (configurable: 30, 60, 90).

```json
{
  "customer_id": "abc123",
  "p_churn_30d": 0.78,
  "p_churn_60d": 0.85,
  "p_churn_90d": 0.91,
  "primary_signals": ["frequency_drop_60%", "no_open_45d", "bnpl_late_payment"],
  "risk_tier": "high",
  "recommended_action": "save_offer_premium"
}
```

## Two methods (chosen by business type)

### For e-commerce (transactional, no fixed subscription)
**BG/NBD model** from `lifetimes` Python library.

- Same library as [[04-CLV-Model]] — already in our stack
- Predicts P(alive) — probability customer is still "active" given purchase history
- Inputs: recency, frequency, tenure
- Foundation: Fader, Hardie, Lee 2005 (public academic)
- Build time: 2–3 days

```python
from lifetimes import BetaGeoFitter

bgf = BetaGeoFitter(penalizer_coef=0.001)
bgf.fit(summary['frequency'], summary['recency'], summary['T'])

# P(alive) — inverse of churn probability
p_alive = bgf.conditional_probability_alive(
    summary['frequency'], summary['recency'], summary['T']
)
p_churn = 1 - p_alive
```

### For SaaS / subscription (deterministic billing)
**LightGBM gradient boosting classifier.**

- Predicts probability of cancellation in next N days
- Inputs: rich behavioral feature set
- Build time: 1–2 weeks

#### Feature engineering for SaaS churn:
| Feature category | Examples |
|------------------|----------|
| Usage | Login frequency last 7/30/60d, feature adoption count, session duration |
| Engagement | Email open rate, support ticket count, NPS score |
| Billing | Payment failures, plan changes, downgrade history |
| Tenure | Days since signup, days since first paid |
| Cohort | Acquisition month, channel, plan tier |
| Behavioral | Feature usage decline rate, support sentiment |

```python
import lightgbm as lgb

model = lgb.LGBMClassifier(
    n_estimators=100,
    learning_rate=0.05,
    num_leaves=31
)
model.fit(X_train, y_train)
p_churn = model.predict_proba(X_test)[:, 1]
```

### For hybrid businesses
Use both approaches per customer based on their relationship type. Routing handled by rules engine.

## Risk tier mapping

We bucket customers by churn probability:

| Tier | P(churn 30d) | Action |
|------|--------------|--------|
| **Critical** | > 0.7 | Immediate save offer (CLV-tiered) |
| **High** | 0.5–0.7 | Save sequence (Day 0, 7, 14) |
| **Medium** | 0.3–0.5 | Soft check-in, monitor |
| **Low** | 0.1–0.3 | Routine engagement |
| **Stable** | < 0.1 | No retention intervention needed |

## Signal explanation

The model also surfaces *why* a customer is flagged. For BG/NBD, this is derived from R/F/T patterns. For LightGBM, we use SHAP values.

```python
import shap

explainer = shap.Explainer(model)
shap_values = explainer(customer_features)
top_signals = shap_values.values[0].argsort()[-3:]  # top 3 contributing features
```

LLM then converts SHAP outputs to plain English for the dashboard:
> "Sarah's churn risk is driven by: (1) login frequency dropped 70% in last 30 days, (2) hasn't opened any emails in 45 days, (3) downgraded plan tier 2 weeks ago."

## Cold-start handling

- New client (insufficient data): use rules-based churn detection (`days_since_last_purchase > 1.5× avg interval`)
- New customer (just signed up): low churn risk by default; re-evaluate after first 30 days
- New product/feature: include as feature when sufficient adoption data exists

## Refresh cadence

- Model retraining: monthly (or when significant data accumulates)
- Per-customer scoring: daily (background job)
- Real-time scoring: on key events (failed payment, support ticket created)

## Where churn predictions are used

| Use case | How |
|----------|-----|
| Retention save offers | High-risk customers get prioritized save campaigns |
| Save offer budget | Budget proportional to CLV × churn risk |
| Win-back tier escalation | Skip tier 1-2 if churn already imminent |
| At Risk segment population | Auto-add high-risk customers |
| Dashboard alerts | "12 high-CLV customers entered Critical tier this week" |
| Anomaly detection | Sudden spike in churn risk = something broken |

## Compared to rules-based churn

| Metric | Rules (time-based) | ML (BG-NBD / LightGBM) |
|--------|---------------------|---------------------------|
| Accuracy | ~75% | ~85% |
| False positives | High (wastes save budget) | Lower |
| Captures behavioral signals | No | Yes |
| Handles seasonality | Poorly | Well |
| Cost | $0 | <$0.10/client/month |

The 10-point accuracy gap = meaningful $ impact via better save spending. **Banks invest in churn ML for this reason.** Worth it for MVP.

## Phase 2 enhancements

- **Survival analysis** (Cox proportional hazards) for time-to-event predictions
- **Per-client custom models** for sophisticated clients
- **Real-time scoring API** for in-product interventions
- **Causal inference** on save offers (what actually CAUSED retention vs. correlation)
