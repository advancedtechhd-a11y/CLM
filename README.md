# Lifecycle SaaS (working name: lifecycle-dev)

AI + ML powered Customer Lifecycle Management platform for e-commerce, SaaS, and course creators. Built on banking-grade strategic frameworks.

## Status

🚧 **Pre-MVP** — spec phase. Started 2026-05-04.

## Quick orientation

The full project specification lives in `docs/` as a markdown vault — open it in Obsidian:
1. Launch Obsidian
2. Click "Open folder as vault"
3. Select `C:\Users\Gamer1\lifecycle-dev\docs\`
4. Start with [[00-Overview]]

## What this is

A self-serve SaaS that:
- Connects to a merchant's Stripe / Shopify / CSV
- Runs banking-grade customer lifecycle analysis (segmentation, CLV, churn, NBP, NBO)
- Generates a complete lifecycle program: segments, journeys, copy, offers
- Pushes the strategy to the merchant's existing execution tool (Klaviyo, Customer.io, etc.)

## Architecture (3 layers)

```
LAYER 3: LLM         → creative + explanations (brand voice, copy, narrative)
LAYER 2: ML MODELS   → CLV (BG-NBD), NBP (collab filtering), Churn (BG-NBD/LightGBM)
LAYER 1: RULES       → segmentation, stage logic, NBO, eligibility (the IP)
```

See [[01-Architecture]] for full detail.

## Folder structure

```
lifecycle-dev/
├── README.md           ← this file
├── CLAUDE.md           ← project-specific Claude Code instructions
├── .gitignore
├── docs/               ← Obsidian vault — full spec
├── src/                ← code (when build starts)
├── tests/              ← tests
├── scripts/            ← utility scripts
└── .claude/            ← Claude Code project config
```

## Constraints (read before contributing)

- Owner is full-time employed at a bank → no public face, no LinkedIn, async-only
- Target market: e-commerce, SaaS, course creators (NOT banks while owner employed)
- IP separation: build only from public CLM frameworks + general expertise, never employer documents
- Pure self-serve product; no high-touch sales

See [[15-Decisions-Log]] for why.
