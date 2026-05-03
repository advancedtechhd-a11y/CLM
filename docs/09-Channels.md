# 09 — Channels

## Channel inventory

| Channel | Phase | Primary use cases |
|---------|-------|-------------------|
| **Email** | 1 (MVP) | All stages — workhorse channel |
| **SMS** | 1 (MVP) | Urgent saves, time-sensitive offers, VIP touches |
| **Web push** | 1 (MVP) | Site visitors with permission, abandoned carts |
| **WhatsApp** | 2 | MENA / India / Brazil / SEA markets, conversational |
| **Mobile push** | 2 | App-based businesses |
| **Paid retargeting** | 2 | Cross-channel reinforcement (Facebook, Google, TikTok) |
| **In-app messages** | 2 | SaaS onboarding, feature adoption |
| **On-site popups/banners** | 3 | Klaviyo OnSite, Privy, Optimonk |
| **Direct mail** | 3 | Premium / luxury / VIP touches (Postable, Lob) |

## Channel × stage default matrix

| Stage | Primary | Secondary | Avoid |
|-------|---------|-----------|--------|
| Acquisition (lead nurture) | Email | Web push | SMS — no permission yet |
| Onboarding | Email | SMS for milestones (order, ship) | Aggressive multi-channel |
| Engagement | Email | SMS for VIP, Push for app users | Saturating low-CLV with SMS |
| Retention (At Risk) | Email + SMS | Web push | Generic newsletter (need targeted) |
| Win-back (Light/Moderate) | Email | — | SMS — annoying for low-intent |
| Win-back (Deep/Dormant) | Email + SMS for high CLV, paid retargeting top tier | WhatsApp where supported | Wasting SMS on Bronze |
| Advocacy | Email | Social (referral share) | SMS — too transactional |

## Channel propensity per customer

The rules engine computes per-customer channel preferences from engagement history:

```python
def channel_propensity(customer):
    return {
        "email": engagement_rate(customer.email_history),
        "sms": engagement_rate(customer.sms_history),
        "push": engagement_rate(customer.push_history)
    }
```

Customer-specific rankings, not store-wide averages. Override channel default if customer has clear preference.

## Channel-specific guidance

### Email
- Workhorse — covers 80% of CLM communication
- Subject line variants: 3–5 per send, A/B test
- Brand voice critical (extracted from [[11-Integrations]] brand crawl)
- Send time: optimal per customer (default mode of past purchase hours)
- Mobile-first responsive design

### SMS
- High-friction, high-attention — use sparingly
- Cost per send is real (vs email near-zero)
- 160 char limit — punchy, urgent, single CTA
- Best for: cart abandonment Hour 48, save offer last-call, VIP early access
- Avoid: routine newsletters, low-CLV blast sends
- TCPA / GDPR compliance: must have explicit SMS consent

### Web push
- Browser-permission-based
- Best for: cart abandonment, back-in-stock, price drops
- Lower friction than email
- Generally short, image-heavy
- OneSignal or Klaviyo Web Push

### WhatsApp (Phase 2)
- Massive in MENA, India, Brazil, SEA
- Conversational tone (not broadcast email)
- Higher open rate than email (90%+)
- Strict consent required (Meta Business policy)
- Templates require pre-approval
- Twilio, Wati, Meta Business API
- Premium feature for relevant geographies

### Mobile push (Phase 2)
- App-based businesses only
- Best for: SaaS in-product, retention nudges
- OneSignal, native APIs

### Paid retargeting (Phase 2)
- Treat as a channel — export segment to ad platforms
- Best for: high-CLV win-back, abandoned cart reinforcement
- Facebook/Instagram, Google, TikTok APIs

### In-app messages (Phase 2)
- SaaS onboarding flows
- Feature adoption nudges
- Intercom, Pendo, Customer.io In-App

## Channel orchestration rules

When multiple channels available, prioritize:

```
RULE: NO_DOUBLE_SEND
IF customer received via Email in last 12 hours
THEN don't send via SMS for same campaign

RULE: ESCALATING_URGENCY
For Win-back Tier 3:
  Touch 1: Email
  Touch 2 (+3d): SMS (escalation)
  Touch 3 (+5d): Email + paid retargeting

RULE: CHANNEL_FALLBACK
IF primary channel = SMS AND customer has no SMS consent
THEN downgrade to Email
```

## Compliance / consent

Each channel has its own consent requirements:

| Channel | Consent needed | Regulation |
|---------|----------------|------------|
| Email | Implied + unsubscribe | CAN-SPAM, CASL, GDPR |
| SMS | Explicit opt-in | TCPA, GDPR |
| WhatsApp | Explicit opt-in | Meta Business Policy, GDPR |
| Web push | Browser permission | Built into browser |
| Mobile push | App permission | Built into OS |
| Paid retargeting | Cookie consent | GDPR, CCPA |

Our system tracks consent per channel per customer. Suppression list management is critical (built into rules engine).

## Phase 1 minimum: Email + SMS + Web push

For MVP, these three channels cover ~95% of e-com use cases. WhatsApp and others are Phase 2 expansion based on customer geography demand.

## Sending mechanism

**MVP: We don't send. We push to client's existing tools.**

For Email/SMS: push segments + flow specs to client's Klaviyo / Customer.io / Mailchimp / etc.

**Phase 2: Optional auto-send via Postmark + Twilio**

For clients without their own tool, we offer "Auto-Send Mode":
- Backend: Postmark for email, Twilio for SMS
- Frontend: customer experiences "everything in one tool"
- Pricing: tier upgrade ($79 → $149/mo includes sending)
- We never compete with Klaviyo on send-quality — we just enable simpler stack

**Phase 3: Full ESP** (post-funding, hire deliverability engineer).

See [[15-Decisions-Log]] for why we don't send in MVP.
