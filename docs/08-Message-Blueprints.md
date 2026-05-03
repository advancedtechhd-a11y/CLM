# 08 — Message Blueprints

Per-stage messaging frameworks the AI fills in based on brand profile + customer data. See [[02-Lifecycle-Framework]] for stages.

## Acquisition Blueprint (lead → customer)

### Sub-stage: Newsletter subscriber (no purchase)
```
Day 0: Welcome + brand story + soft product intro (Email)
Day 3: Value content (tip/guide/story, not selling) (Email)
Day 7: Social proof (testimonials, UGC) (Email)
Day 10: First-purchase incentive (10–15% off OR free shipping) (Email)
Day 14: Urgency reminder — offer expires (Email)
Day 30: Re-engagement OR move to passive list
```

### Sub-stage: Account created (no purchase)
```
Day 0: Welcome + benefit recap + first offer (Email)
Day 3: Product discovery (top categories) (Email)
Day 7: Personalized recommendation (Email + Web push)
Day 14: Stronger offer + urgency (Email + SMS)
Day 30: Move to passive
```

### Sub-stage: Cart abandonment
```
Hour 1: Soft reminder ("forget something?") (Email)
Hour 24: Reminder + social proof of cart items (Email)
Hour 48: 10–15% discount on cart contents (Email + SMS for high-intent)
Hour 72: Final reminder OR cart cleanup (Email)
```

### Sub-stage: Free trial active (SaaS)
```
Day 0: Welcome + setup wizard guidance (Email + In-app)
Day 2: Feature discovery (Email + In-app)
Day 5: Activation milestone celebration (In-app)
Day 7: ROI calculation / value demonstration (Email)
Day 12 (of 14): Pre-conversion push with offer (Email + SMS)
Day 14: Last call (Email + SMS)
Day 16: Post-expiration recovery (extended trial) (Email)
Day 21: Final conversion attempt (Email)
```

## Onboarding Blueprint (T+0 → first-value)

```
Day 0: Order confirmation + warm thank-you (Email — transactional + brand)
Day 1–2: Setup / how-to guidance (Email)
Day 7: Education — "Getting the most out of [Product]" (Email)
Day 14: Social proof + UGC / community prompts (Email)
Day 21: Soft cross-sell — first NBP suggestion, NO offer (Email)
Day [dynamic]: Reorder / replenishment cue (Email + SMS for Gold+)
Day [dynamic+10]: NBP push WITH offer if no reorder (Email + SMS)
End of Onboarding window: 
   → 2nd purchase: Engagement
   → No 2nd purchase: At Risk
```

Note: "Day [dynamic]" derived from client's avg inter-purchase interval — see [[02-Lifecycle-Framework]] dynamic thresholds.

## Engagement Blueprint (active customers)

### Ongoing cadence programs
```
─ Replenishment reminders (timed to inter-purchase rhythm)
─ Cross-sell campaigns (NBP-driven, monthly trigger)
─ Brand newsletter / educational (weekly–biweekly)
─ VIP early access (Gold/Platinum — new launches first)
─ Loyalty milestone celebrations (10th order, 1-yr anniversary)
```

### Triggered programs
```
─ Birthday / anniversary offers
─ Restock alerts (favorited products back in stock)
─ Price drop alerts (viewed-but-not-bought items)
─ Back-in-stock notifications
─ "Frequently bought together" cross-sell post-purchase
```

### Deepening programs (cross-category)
```
─ "You've tried Category A, now try Category B" — bundle offers
─ Subscribe & Save promotion (one-time → subscription)
─ Try-it-free samples for adjacent categories
```

## Retention Blueprint (At Risk → Save)

### Entry triggers
- Frequency drop > 50% baseline
- Inter-purchase time exceeded by 1.5×
- Email engagement drop (no opens 60d)
- BNPL late payment
- Negative review submitted
- Customer service complaint
- Failed subscription payment

### Intervention sequence
```
Day 0: Soft check-in (no offer)
   "How's everything going, {{first_name}}?"
   Channel: Email
   Goal: Detect cause of disengagement

Day 7: Value reminder + soft incentive
   Top-rated product highlight + 10% off
   Channel: Email

Day 14: Save offer (CLV-tiered — see [[07-NBO-Logic]])
   Platinum/Gold: 20–25% off + free shipping + appreciation message
   Silver: 15% off site-wide
   Bronze: 10% off
   Channel: Email + SMS for Gold+

Day 21: Direct ask (last save attempt)
   "Did we mess up?" — vulnerable, sincere
   Goal: Recover OR understand churn reason
   Channel: Email + SMS for Platinum

Day 28: → Win-back if no response
```

## Win-back Blueprint (4 escalating tiers)

### Tier 1: Light Lapsed
```
Touch 1: Soft "we miss you" (Email)
   No offer — just reconnection
```

### Tier 2: Moderate Lapsed
```
Touch 1: NBP + 15–20% off (Email)
Touch 2 (+3d): Reminder + urgency (Email + SMS for Gold+)
```

### Tier 3: Deep Lapsed
```
Touch 1: Premium offer (30% off / free shipping / bundle) (Email + SMS for Silver+)
Touch 2 (+3d): Last-call urgency (SMS for Gold+, Email others)
Touch 3 (Gold/Platinum only): Personal-style email or direct mail
```

### Tier 4: Dormancy (final attempt)
See [[#Dormancy Blueprint]] below.

## Dormancy Blueprint (mirrors banking escheatment)

```
─────── DORMANCY FINAL WINDOW (14–30 days) ───────

Day 0 (Dormancy declared): "We've missed you" (Email)
   Tone: Low-pressure, brand-voice, no aggressive offer
   Goal: Last warm touch

Day 7: Best-offer-they've-had push
   Channel: Email + SMS for Platinum/Gold ONLY
   Offer: Steepest discount or premium bundle (CLV-tiered)
   Tone: Sincere, "we want you back"
   Expiration: 14 days

Day 14: Last call
   Channel: Email + paid retargeting for Platinum/Gold
   Tone: Urgency without desperation
   Offer: Same as Day 7, expires 48 hours

Day 21: Re-permission email (the "stay or go" moment)
   Subject: "Are we still useful to you?"
   Body: "Click to keep hearing from us. If not, no hard 
          feelings — we'll stop sending."
   Goal: Explicit re-opt-in OR clean removal
   
   → Click = back to active list
   → No click + 7 days = move to archive routing

─────── ARCHIVE ROUTING (3-state) ───────

After failed dormancy:

  Has positive asset (loyalty, store credit, gift card):
    → "Low-Touch List" — newsletter only, no costly offers
    → Re-evaluate quarterly
    Banking: Escheated to central bank (preserved low-touch)

  Zero balance / no asset / no relationship:
    → Full archive — remove from active marketing
    → Saves email cost, improves deliverability
    Banking: Account closed

  Pending dispute / unfulfilled return / chargeback:
    → Operational queue (NOT marketing)
    → Send to support team
    Banking: Negative balance / collections
```

## Advocacy Blueprint

### Entry triggers
- 4+ purchases lifetime
- NPS 9–10
- Submitted positive review
- Referred at least one customer
- Gift purchase pattern (multiple shipping addresses)
- Top 5% LTV in cohort

### Programs
```
─ Referral program enrollment
   Give-$X, get-$X
   Channel: Email + SMS

─ Review request automation
   Trigger: 7 days post-positive purchase from advocate
   Personalized — mention their specific product
   Channel: Email

─ UGC requests
   "Show us your routine" social campaigns
   Photo/video submission incentive
   Channel: Email + DM (if permitted)

─ VIP early access
   New product launches: 48hr early access
   Channel: Email + SMS

─ Insider previews
   Behind-the-scenes content
   Founder updates
   Channel: Email

─ Birthday / anniversary premium gifts
   Free gift on milestone dates
   Low cost, high emotional ROI

─ Direct mail surprise (Phase 2)
   Handwritten thank-you, free product
   For top 1% LTV
   Channel: Direct mail
```

## How blueprints become messages

The rules engine selects the blueprint based on customer's stage + sub-state. The LLM ([[01-Architecture]] Layer 3) fills in:
- Subject line variants (3–5 per send)
- Email body in brand voice
- SMS copy (160 chars, urgent tone)
- Push notification copy
- "Why this offer" reasoning

Brand profile (extracted from website crawl) shapes voice. Customer data shapes specifics ({{first_name}}, last product, recommended NBP).

See [[09-Channels]] for channel-specific guidance.
