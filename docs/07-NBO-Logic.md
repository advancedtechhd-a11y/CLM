# 07 — NBO Logic (Next Best Offer)

## NBP vs NBO — the distinction

| | Next Best Product (NBP) | Next Best Offer (NBO) |
|---|--------------------------|--------------------------|
| Question | *Which* product is this customer most likely to buy? | *How* do we maximize conversion + retain margin? |
| Output | "Customer X → 62% likely to buy Product 7" | "Send Product 7 with 15% off via email Day 5, expires 7 days" |
| Inputs | Purchase history, basket affinity | Price sensitivity, channel propensity, timing, CLV tier, margin floor |

NBP is "what." NBO is "how."

## Why NBO is rules-based in MVP (not ML)

Unlike CLV/NBP/Churn which use historical *intrinsic* customer behavior, NBO requires **offer-response training data** — which new clients don't have on day 1.

Cold-start challenges:
- No prior offer-response history per client
- Counterfactual evaluation hard without control groups
- Per-client offer catalogs vary widely
- Best ML methods (uplift modeling, contextual bandits) need explicit experimentation

**Rules-based NBO using ML scores as inputs produces specific, defensible offers without these problems.** ML upgrade in Phase 2 once we have offer-response data.

## NBO inputs (ML scores + rules)

```python
def compute_nbo(customer, brand_profile):
    # ML inputs (from other models)
    clv_tier        = ml.clv.predict(customer)         # → Platinum/Gold/Silver/Bronze
    nbp_top         = ml.nbp.predict(customer)[0]      # → top product + confidence
    p_churn         = ml.churn.predict(customer)       # → 0.0-1.0
    
    # Rules-based features
    price_sensitivity = rules.price_sensitivity_score(customer)
    channel_prop      = rules.channel_propensity(customer)
    bnpl_user         = rules.is_bnpl_user(customer)
    inter_purchase    = rules.avg_inter_purchase_days(customer)
    optimal_send_time = rules.optimal_send_time(customer)
    
    # Brand context
    brand_voice       = brand_profile.voice
    brand_discount_history = brand_profile.discount_frequency
    margin_floor      = brand_profile.margin_floor
    
    # Decision logic (200+ rules) ↓
```

## Offer decision rules (examples)

```
RULE: BNPL_USER_INSTALLMENT_FRAMING
IF customer.payment_method = "Klarna|Affirm|Tabby|Tamara"
THEN offer.framing = "spread_over_4_payments"
   NOT "percentage_off"

RULE: PLATINUM_NO_DISCOUNT
IF clv_tier = "Platinum" 
   AND brand.discount_history < 5_per_year
   AND price_sensitivity < 30
THEN offer.discount = 0
   AND offer.value_add = "free_expedited_shipping"
   REASONING: "Premium customer, brand doesn't discount, 
              full-price tolerant — preserve positioning"

RULE: HIGH_CHURN_PREMIUM_SAVE
IF p_churn > 0.7 AND clv_tier IN ["Gold", "Platinum"]
THEN offer.discount = lookup_save_discount(clv_tier)
   AND offer.urgency = "expires_48hr"
   AND offer.channels = ["email", "sms"]

RULE: LOW_CHURN_SOFT_NUDGE
IF p_churn < 0.3 AND nbp_top.score > 0.6
THEN offer.discount = 0
   AND offer.message_type = "recommendation"
   REASONING: "Healthy customer, gentle cross-sell, 
              don't burn margin on someone who'd buy anyway"

RULE: SUBSCRIPTION_BOX_SKIP_ESCALATION
IF business_type = "subscription_box"
   AND customer.skipped_count >= 2
   AND skip_window < 60_days
THEN escalate_to_winback_tier_3
   REGARDLESS_OF chronological_lapsed_threshold
   REASONING: "Skip patterns predict cancellation 
              faster than time alone"

RULE: HIGH_PRICE_SENSITIVITY_DISCOUNT_DRIVEN
IF price_sensitivity > 70 
   AND nbp_top.product_category IN customer.discount_history_categories
THEN offer.discount = customer.typical_discount_pct
   AND offer.urgency = "expires_24hr"
   REASONING: "Discount-driven customer; match historical 
              discount expectation; create urgency"
```

A real production NBO rules engine has 200–500 such rules covering edge cases. **This is your IP** — your 20 years of CLM judgment encoded.

## Offer output structure

```json
{
  "customer_id": "abc123",
  "program_type": "engagement_cross_sell",
  "product": {
    "id": "prod_7",
    "name": "Vitamin C Serum"
  },
  "offer": {
    "discount_pct": 15,
    "framing": "percentage_off",
    "value_adds": ["free_shipping_over_50"],
    "urgency_hours": 168,
    "tier_constraint": "Gold"
  },
  "channel": {
    "primary": "email",
    "secondary": null,
    "send_time": "2026-05-08T14:00:00",
    "timezone": "America/Los_Angeles"
  },
  "messaging": {
    "subject_variants": ["Your skincare routine is missing one thing 🌿", "Sarah, complete your collection"],
    "body": "[brand-voice-matched generated copy]",
    "cta": "Add to routine"
  },
  "budget": {
    "max_discount_value": 12,
    "estimated_margin": 28,
    "clv_tier_budget_remaining": 145
  },
  "reasoning": "Sarah is in Engagement stage (Gold tier, $890 CLV). Past purchases of Retinol and Eye Cream suggest skincare routine completion intent. Low price-sensitivity score (32) — minimal discount sufficient. Email is her dominant channel (78% engagement). Inter-purchase rhythm suggests Day 5 optimal."
}
```

## Tiered save offer logic

For [[02-Lifecycle-Framework]] Retention stage:

| CLV Tier | Save offer for high churn risk | Channel mix |
|----------|--------------------------------|-------------|
| Platinum | 25–35% off + free expedited shipping + personal touch | Email + SMS + (Phase 2: direct mail) |
| Gold | 20–25% off site-wide | Email + SMS |
| Silver | 15% off | Email |
| Bronze | 10% off OR no save attempt | Email only |

Bronze gets minimal save spend because the math doesn't work — saving a $90 LTV customer with a $30 discount is net negative if response rate is < 30%.

## Margin protection

Every offer goes through a margin floor check:

```
RULE: MARGIN_FLOOR_PROTECTION
IF (offer.discount_value + cost_of_goods) > (revenue_per_unit × margin_floor)
THEN reject_offer 
   OR substitute_value_add (free shipping > discount where possible)
```

Margin floor is configurable per client (default: 35% on cross-sell, 20% on retention).

## Phase 2 NBO ML upgrade

Once we have 3–6 months of offer-response data per client, layer ML on top:

### Uplift modeling (causal inference)
Predicts incremental impact of an offer (vs no offer). Distinguishes:

| Customer type | Action |
|---------------|--------|
| Persuadables (need offer to convert) | ✅ Offer |
| Sure things (would buy anyway) | ❌ Skip — preserve margin |
| Lost causes (won't convert either way) | ❌ Skip |
| Sleeping dogs (offer hurts them) | ❌ Avoid actively |

Libraries: `causalml`, `scikit-uplift`, Microsoft `EconML`.

### Contextual multi-armed bandits
Continuously learn which offer "arm" wins per customer context. Self-improving.

Libraries: `vowpalwabbit`, `river`.

### Reinforcement learning (Phase 3+)
Optimize lifetime customer value across offer sequences, not single offers. Sophisticated, premium feature.
