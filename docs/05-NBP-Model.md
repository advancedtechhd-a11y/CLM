# 05 — NBP Model (Next Best Product)

## What this predicts

For each customer, a ranked list of products they're most likely to buy next, with probability scores and reasoning.

```json
{
  "customer_id": "abc123",
  "nbp_ranked": [
    {"product_id": "prod_7",  "name": "Vitamin C Serum",       "score": 0.68},
    {"product_id": "prod_12", "name": "Hyaluronic Moisturizer","score": 0.45},
    {"product_id": "prod_3",  "name": "Gentle Cleanser",       "score": 0.30}
  ],
  "reasoning": "Customer bought Retinol Serum and Eye Cream in last 60 days. Co-purchase pattern shows Vitamin C completes the routine for 71% of similar customers."
}
```

## Method (MVP)

**Collaborative filtering** via matrix factorization. Specifically:
- Library: `implicit` (Python) — well-established, fast
- Algorithm: Alternating Least Squares (ALS) or BPR (Bayesian Personalized Ranking)
- Input: customer-product purchase matrix (binary or count-based)
- Output: latent factor vectors per customer + per product → similarity scores

Augmented with:
- **Co-purchase market basket analysis** — which products are bought together
- **Sequence patterns** — what tends to come after what (Markov chain over product categories)
- **Customer-level conditioning** — basket history, frequency, recency (RFM-aware)

## Implementation sketch

```python
import implicit
from scipy.sparse import csr_matrix

# Step 1: build customer-product purchase matrix
# rows = customers, cols = products, values = purchase count
matrix = csr_matrix((counts, (customer_idx, product_idx)))

# Step 2: train ALS model
model = implicit.als.AlternatingLeastSquares(
    factors=64,
    regularization=0.01,
    iterations=20
)
model.fit(matrix.T)  # implicit expects items × users

# Step 3: get recommendations per customer
def recommend_for(customer_id, n=5):
    customer_idx = customer_id_to_idx[customer_id]
    item_ids, scores = model.recommend(
        customer_idx, 
        matrix[customer_idx],
        N=n,
        filter_already_liked_items=True
    )
    return list(zip(item_ids, scores))
```

~50 lines of code. Library handles the math.

## Why collaborative filtering (vs alternatives)

| Method | Pros | Cons |
|--------|------|------|
| Market basket only (rules) | No training needed | Misses non-obvious affinities; stuck on static co-purchases |
| **ALS / BPR** | Captures latent patterns, scales | Cold-start for new products/customers |
| Sequence models (LSTM) | Better for ordered behaviors | Requires more data and tuning |
| Pure LLM | Generative explanations | Expensive, doesn't handle large catalogs |

ALS is the right MVP choice — production-grade, well-understood, off-the-shelf.

## Cold-start handling

### New customer (no purchase history)
Fall back to:
1. Bestsellers in their declared category preference (if any)
2. Brand-profile-aligned products
3. Most-viewed products on first session (if browsing data)

Show "Limited data — recommending bestsellers" badge.

### New product (no purchase data yet)
Fall back to:
1. Content-based: similar to other products in same category
2. Manual tagging by brand (in product catalog)
3. Promote to "Featured" segment for cold-start exposure

### New client (entire catalog)
Bootstrap with category-level recommendations:
- "Customers who bought from Category X often buy from Category Y"
- Aggregated industry data (when available, anonymized)

## Refresh cadence

- Full retraining: monthly (small clients) or weekly (large clients with active catalog changes)
- Incremental updates: on product launch / catalog change
- Per-customer recommendations: cached, refreshed on data sync

## Output uses

NBP feeds into:

| Use case | How |
|----------|-----|
| Cross-sell campaigns | Pick top NBP, generate offer |
| Onboarding Day-21 push | Recommend complementary product to first purchase |
| Win-back messaging | Highlight NBP as enticement |
| Email content personalization | "Recommended for you" sections |
| Search/recommendation widgets on client site (Phase 2) | Real-time API |

## NBP confidence threshold

We don't push every NBP — only those with confidence > threshold.

- `score > 0.7` → high confidence, use as primary CTA
- `score > 0.5` → medium confidence, secondary
- `score < 0.5` → don't push (would feel random)

Threshold per-client tunable based on catalog density.

## Compared to rules-based NBP

| Metric | Market basket (rules) | Collaborative filtering (ML) |
|--------|------------------------|-------------------------------|
| Accuracy | ~60% | ~80% |
| Handles new patterns | Poorly | Well |
| Catalog scale | OK for <100 SKUs | Scales to 100k+ SKUs |
| Cold-start | Better | Needs fallback |
| Cost | $0 | <$0.10/client/month |

The 20-point accuracy gap is meaningful for cross-sell revenue. Worth the ML investment.

## Phase 2 enhancements

- **Per-client custom models** (vs. global model) — for clients with >5k customers
- **Sequence-aware models** (LSTM, transformer) — for catalogs where order matters
- **Two-tower neural recommender** — for sophisticated personalization
- **Real-time API** for on-site recommendations (currently batch-only)
