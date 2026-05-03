# 03 — Segmentation

Segmentation is a first-class capability, not a sub-feature. Banks treat it that way; we do too.

## 5 segment types

All auto-computed where possible, all dynamic (update as data changes), all exportable to execution tools.

### 1. Lifecycle stage segments (auto)
From [[02-Lifecycle-Framework]] — every customer is in exactly one of these:
- Acquisition (with sub-stages: newsletter, account, cart, trial)
- Onboarding
- Engagement
- Retention (At Risk)
- Win-back (4 tiers: Light Lapsed, Moderate, Deep, Dormant)
- Advocacy

### 2. Value tier segments (auto, CLV-based)
Computed from [[04-CLV-Model]]:
- Platinum (top 5% predicted CLV)
- Gold (next 15%)
- Silver (next 30%)
- Bronze (bottom 50%)

Used for budget allocation in offers (premium spend on Platinum, low-cost on Bronze).

### 3. RFM segments (auto, industry-standard 11-segment model)

| Segment | Definition |
|---------|------------|
| Champions | High R, high F, high M |
| Loyal Customers | High F + M, recent |
| Potential Loyalists | Recent + medium F |
| New Customers | High R, low F |
| Promising | Recent, low value |
| Customers Needing Attention | Above-avg R, F, M but slipping |
| About to Sleep | Below-avg R, F |
| At Risk | Spent big, long time ago |
| Can't Lose Them | High value, lapsed |
| Hibernating | Low R, F, M |
| Lost | Lowest scores |

Industry-standard segmentation framework (Chen, Sain, Guo 2012, public academic literature).

### 4. Behavioral segments (auto)

Computed from purchase behavior:
- **Discount-driven** — >50% of purchases used promo codes
- **Full-price loyal** — rarely uses discounts
- **Multi-category** — bought from 3+ product categories
- **Single-category** — bought from 1 category only (cross-sell candidates)
- **BNPL users** — primary payment method is Klarna/Affirm/Tabby/etc.
- **High-frequency** — top 20% inter-purchase frequency
- **Sporadic** — irregular purchase patterns

These flag intervention modifiers (e.g., BNPL users get installment framing, not % off).

### 5. Custom segments (user-defined)

UI for clients to define their own:
- "Bought Serum AND no Moisturizer" → cross-sell program
- "VIP candidates" — manually curated list
- "Returns history > 2" — operational concern
- "Geographic — California only" — regional campaign

Defined via simple rule builder (drag-drop conditions). Stored as queries that re-evaluate on data changes.

## How segments are used

### Trigger source for programs
Each program in our system has a segment as its trigger:
- "Win-back Tier 3" program → fires for customers in (Lifecycle = Win-back) AND (Tier = Deep Lapsed)
- "VIP early access" → fires for customers in Advocacy + Platinum tier

### Export to execution tools
Every segment can be pushed as a live segment to:
- Klaviyo (segment + flow creation)
- Customer.io
- Mailchimp
- ConvertKit
- CSV download

Updates automatically when customers cross thresholds.

### Overlap intelligence
A customer can be in multiple segments. The system shows overlaps and prioritizes:
- "Sarah is in: Engagement (lifecycle) + Gold (value) + Multi-category (behavioral) + Champions (RFM)"
- For messaging: highest-priority segment wins (usually lifecycle stage takes precedence)
- Avoids over-messaging the same customer

## Segment health monitoring

Dashboard shows:
- Segment size trends (Platinum growing? Dormant shrinking?)
- Stage transition rates (Onboarding → Engagement %)
- Cross-tier migrations (Bronze → Silver upgrades)

Alerts fire when:
- Segment grows/shrinks > 20% in a week (anomaly)
- At-risk segment grows faster than save program can address
- Dormancy archive is bloating (cleanup needed)

## Implementation note

Segments are computed in the rules engine ([[01-Architecture]] Layer 1) using ML scores ([[01-Architecture]] Layer 2) as inputs. Stored denormalized in `segments` table for query speed. Recomputed on data sync (continuous) and full refresh (monthly).
