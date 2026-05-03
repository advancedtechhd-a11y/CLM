# 00 — Overview

## What we're building

A self-serve SaaS that generates **complete customer lifecycle programs** from a merchant's actual customer data, then pushes them to the merchant's existing execution tool (Klaviyo, Customer.io, Mailchimp, etc.).

We are NOT another email-sending platform. We are the **strategy + ML + AI layer** that sits *above* execution tools.

## The wedge

> *"Klaviyo sends emails. We tell you which emails to send, to whom, when, and why."*

The CLM market has 30+ execution tools (Klaviyo, Braze, Customer.io, Mailchimp, etc.) and dozens of analytics tools (Lebesgue, Polar, Lifetimely). **No one builds the strategy layer in between.** That gap is the opportunity.

Banking has had sophisticated CLM strategy systems (Pega, SAS, Adobe Decision Cloud) for 30 years. E-commerce/SaaS hasn't caught up. We bring banking-grade strategy to e-com using AI + ML for scale.

## Who buys

| Persona | Profile | Tool stack | Will pay |
|---------|---------|-----------|----------|
| Small Shopify store owner | $20k–$2M/yr DTC, 1–3 team | Shopify + Klaviyo | $39–79/mo |
| Course creator / digital seller | $50k–$1M/yr | Stripe + ConvertKit/Kajabi | $79/mo |
| Bootstrapped B2C SaaS founder | $10k–$300k MRR | Stripe + Customer.io | $99–199/mo |

## How it works (60-second pitch)

1. Merchant connects Stripe + Shopify (OAuth, 2 minutes)
2. We crawl their public website to extract brand profile (voice, category, target customer)
3. Background sync of their last 12–24 months of customer data
4. **Rules engine** computes segments, lifecycle stages, dynamic thresholds
5. **ML models** predict churn, CLV, next-best-product per customer
6. **LLM** generates brand-voice-matched copy, journey narratives, explanations
7. Merchant sees a dashboard with 5–7 priority programs, each with: customer list, recommended messages, CLV-tiered offers
8. One-click push to their Klaviyo / Customer.io / Mailchimp
9. Monthly auto-refresh as data evolves

## Architecture (3 layers)

See [[01-Architecture]] for full detail.

```
LAYER 3: LLM           ← brand voice, copy, narrative reports
LAYER 2: ML MODELS     ← CLV, NBP, Churn predictions
LAYER 1: RULES ENGINE  ← strategy, segmentation, eligibility — the IP
```

## Lifecycle framework

Banking-derived 6-stage model — see [[02-Lifecycle-Framework]]:

1. Acquisition
2. Onboarding (T+0 → first-value milestone)
3. Engagement
4. Retention (At Risk / Save)
5. Win-back (4 tiers ending in Dormant → Archive)
6. Advocacy

Plus 2 cross-cutting intelligence layers: **CLV** ([[04-CLV-Model]]) and **NBP/NBO** ([[05-NBP-Model]] + [[07-NBO-Logic]]).

## What makes this defensible

- **Owner's expertise:** 20 years senior CLM at a bank, framework-architect level
- **Architecture:** Rules-based core (auditable, cheap, deterministic) — most "AI startups" are pure-LLM and brittle
- **Tool-agnostic:** sits above execution tools, doesn't compete with them
- **Banking-grade discipline:** dormancy archive, CLV-tiered budgeting, NBO, dynamic thresholds — features generic e-com tools lack

## Constraints

See [[15-Decisions-Log]] for the founder's situation and how it shapes product decisions:
- Full-time employed at bank → no public face, no LinkedIn
- IP separation from employer (use only public CLM frameworks)
- Async-only, self-serve only (no sales calls, demos)
- Solo build on evenings/weekends, 16–20 week timeline
- Friend's Shopify store as first design partner

## Build plan

See [[14-Build-Plan]] — 18–20 weeks of evening/weekend work to MVP.

## What's NOT in MVP

- Sending emails ourselves (push to Klaviyo etc. only — Phase 2 adds Postmark/SES)
- ML for NBO, price sensitivity, channel propensity, send-time (Phase 2)
- WhatsApp, mobile push, paid retargeting (Phase 2)
- Per-client custom ML training (Phase 3)
