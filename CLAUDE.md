# Lifecycle SaaS — Claude Code Project Instructions

## Project context
AI + ML Customer Lifecycle Management SaaS for e-commerce, SaaS, course creators. Pre-MVP, in spec phase.

Full spec lives in `docs/` (Obsidian vault). Read [[00-Overview]] first.

## Owner / context
- Senior bank manager, 20 years CLM experience (banking)
- Middle East-based expat, 10-year property-linked visa (stable)
- Building solo on evenings/weekends
- Goal: build SaaS, validate with friend's Shopify store, apply to YC, eventual exit

## Hard rules

### IP separation
- NEVER use the owner's employer (bank) internal documents, formulas, calibrations
- Use ONLY public industry frameworks (academic CRM literature, McKinsey/BCG/Bain public material)
- Owner's general expertise (head-knowledge) is portable; specific employer docs are not
- Target market is e-com / SaaS / course creators — NOT banks while owner employed

### Architecture (locked decisions)
- 3-layer: Rules engine → ML models → LLM
- Rules layer is the strategic core (deterministic, auditable)
- ML models in MVP: CLV (BG-NBD + Gamma-Gamma), NBP (collaborative filtering), Churn (BG-NBD/LightGBM)
- LLM is creative/explanation layer only (brand voice, copy, narrative)
- NO LLM-driven strategy decisions (cost + reliability + auditability)

### Engineering rules
- Files under 500 lines
- Many small files > few large files
- High cohesion, low coupling
- Read files before editing
- Validate at system boundaries
- Never commit secrets, .env files

## Tech stack (planned)
- Frontend: Next.js 14
- Backend: Next.js API routes + Inngest/Trigger.dev for background jobs
- Database: Supabase (Postgres)
- Auth: Supabase Auth
- ML: Python services (lifetimes, lightgbm, implicit) — separate microservice or batch jobs
- LLM: Anthropic API (Claude Sonnet for routine, Opus for strategy)
- Email/SMS: Postmark + Twilio (Phase 2 send-it-ourselves)
- Hosting: Vercel + Railway (for Python ML)

## Ruflo integration
This project uses Ruflo (claude-flow) for swarm coordination during build:
- Spawn specialized agents (architect, coder, tester) for parallel work
- Use `memory_store` / `memory_search` for cross-session context
- Use `hooks_route` for task routing

When working on multi-file features, prefer swarm patterns over solo coder.

## Common commands

```bash
# When build starts:
npm run dev                # Next.js dev server
npm test                   # Run tests
npm run lint
npm run typecheck

# Ruflo:
npx @claude-flow/cli@latest swarm init --v3-mode
npx @claude-flow/cli@latest memory search --query ""
```

## Session start checklist
1. Read [[00-Overview]] in docs/
2. Read [[15-Decisions-Log]] for recent context
3. Check `git status` if repo initialized
4. Ask user what to work on
