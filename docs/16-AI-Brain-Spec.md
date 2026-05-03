# 16 — AI Brain Spec

The "AI Brain" is the LLM layer in our 3-layer architecture (see [[01-Architecture]]). Important framing: **the LLM is not the strategist — it's the messenger and creative layer.** Rules + ML do strategy; LLM converts structured outputs into human-readable form.

## What the LLM does

| Task | Frequency | Cached? | Model |
|------|-----------|---------|-------|
| Brand voice extraction | Once on onboarding, quarterly refresh | Yes | Sonnet |
| Per-segment copy generation | Once per program activation | Yes (until segment changes) | Sonnet |
| NBP reasoning explanations | Per cross-sell campaign | Yes (per customer-product pair) | Sonnet |
| Monthly narrative report | Monthly per client | Yes (single use) | Opus |
| Anomaly explanation | When detected | Yes (per anomaly) | Sonnet |
| Q&A in dashboard | On user request | No | Sonnet |
| Email subject line variants | Per segment | Yes | Sonnet |
| Stage transition reasoning | Per customer state change (audit) | No (per request) | Haiku |

## What the LLM does NOT do

- ❌ Decide which segment a customer belongs to (rules)
- ❌ Calculate CLV / NBP / churn probability (ML)
- ❌ Determine stage transitions (rules with thresholds)
- ❌ Choose which offer to send (rules + NBO logic)
- ❌ Score customer eligibility (rules)

## Model selection guide

| Use case | Model | Why |
|----------|-------|-----|
| Routine copy generation | `claude-sonnet-4-6` | Good balance of cost + quality for creative writing |
| Monthly strategy narratives | `claude-opus-4-7` | Higher reasoning quality matters for executive reports |
| Quick categorization / tagging | `claude-haiku-4-5` | Fast + cheap for simple classification |
| Brand voice extraction | `claude-sonnet-4-6` | Reasoning + writing quality balanced |

Default: Sonnet 4.6. Upgrade to Opus only when explicitly justified by impact.

---

## Prompt 1: Brand Voice Extraction

**Triggered when:** Client connects website during onboarding, OR quarterly refresh.

**Input:** Crawled HTML/text from 5–10 pages (homepage, about, top product pages, pricing if applicable).

**System prompt:**

```
You are a brand voice analyst. Given the content from a 
business's public website, extract a structured Brand Profile 
that will be used to generate marketing copy in the brand's 
authentic voice.

Analyze:
1. Voice characteristics (tone, formality, vocabulary)
2. Target customer (demographics, psychographics, jobs-to-be-done)
3. Brand category and sub-category
4. Price tier (budget, mid-market, premium, luxury)
5. Key product claims and value propositions
6. Geographic focus
7. Top product categories and their relative emphasis
8. Voice samples (3-5 verbatim sentences from their copy 
   that capture their voice best)

Be specific and concrete. Avoid generic descriptors like 
"friendly" without supporting evidence. If a field is unclear 
from the content, set confidence to "low" and explain.

Output as JSON matching the schema provided.
```

**Output schema:**

```json
{
  "business_name": "string",
  "category": "string",
  "sub_category": "string",
  "target_customer": {
    "description": "string",
    "demographics": ["string"],
    "psychographics": ["string"],
    "jobs_to_be_done": ["string"]
  },
  "voice": {
    "tone": "string (1-3 adjectives)",
    "formality": "casual | conversational | professional | formal",
    "energy": "low | medium | high",
    "samples": ["string", "string", "string"]
  },
  "price_tier": "budget | mid-market | premium | luxury",
  "key_claims": ["string"],
  "geographic_focus": ["country codes"],
  "top_categories": [
    {"name": "string", "estimated_share_pct": number}
  ],
  "confidence": {
    "overall": "low | medium | high",
    "notes": "string"
  }
}
```

**Caching:** Store in `brand_profiles` table. Reuse across all subsequent generations until manually re-crawled.

---

## Prompt 2: Per-Segment Copy Generation

**Triggered when:** A program is generated for a specific segment.

**Input:**
- Brand profile (from Prompt 1)
- Segment definition (lifecycle stage, behavioral signals, CLV tier)
- Program type (Onboarding D21 NBP, Win-back Tier 3, etc.)
- Offer specifics (discount %, channel, timing) from NBO rules
- NBP recommendation (top product + reasoning)

**System prompt:**

```
You are a customer lifecycle copywriter for {{brand_name}}. 
Your job is to write email/SMS copy that matches the brand's 
authentic voice and drives the specific outcome of this 
campaign.

BRAND VOICE
{{brand_voice_section}}

SAMPLE BRAND SENTENCES (match this voice)
{{voice_samples}}

CUSTOMER SEGMENT
- Lifecycle stage: {{stage}}
- Segment definition: {{segment_description}}
- Why these customers are in this segment: {{stage_reasoning}}

PROGRAM
- Type: {{program_type}}
- Goal: {{program_goal}}
- Channel: {{channel}}
- Recommended offer: {{offer}}
- Recommended product: {{product_name}} ({{nbp_reasoning}})
- Expected expiration: {{urgency}}

CONSTRAINTS
- Subject lines: 30–50 characters max, no emoji unless brand uses them
- Email body: 80–150 words for B2C; 150–250 for B2B
- SMS: 160 characters max, urgent tone, single CTA
- Use {{first_name}} placeholder for personalization
- Match brand voice samples — same energy, vocabulary, sentence structure
- Do NOT use generic "marketing speak" ("Don't miss out!", "Limited time only!" etc.) 
  unless brand voice samples use that tone

OUTPUT
Provide 3 subject line variants and 1 email body. For SMS, 
provide 2 variants. Match brand voice precisely.
```

**Output schema:**

```json
{
  "channel": "email | sms",
  "subject_variants": ["string", "string", "string"],
  "preview_text": "string (50 chars max — for email)",
  "body": "string (HTML or plain text)",
  "cta_text": "string",
  "cta_link_placeholder": "string",
  "voice_match_confidence": 0.0
}
```

**Caching:** Cache per (segment_id, program_type, brand_profile_version). Regenerate only when segment definition or program type changes. **Critical for cost** — without caching, costs scale per customer.

---

## Prompt 3: NBP Reasoning Explanation

**Triggered when:** Customer detail view shows recommended NBP.

**Input:**
- Customer purchase history (last 10 purchases)
- NBP recommendation (top product + ML confidence score)
- Co-purchase data (what other customers bought after similar history)
- Brand profile

**System prompt:**

```
You explain product recommendations to merchants in plain English.

The system has recommended {{product_name}} for {{customer_email}} 
with {{confidence_pct}}% confidence.

Customer purchase history:
{{purchase_list}}

Why was this product recommended? Use the data below to explain 
in 2-3 sentences:
- Customer behavior signals: {{behavior_signals}}
- Co-purchase patterns: {{copurchase_data}}
- Customer lifecycle stage: {{stage}}

Be specific. Reference actual products and percentages where 
helpful. Avoid generic statements. If the recommendation is 
weak, say so honestly.
```

**Output:** Plain-text explanation, 50–150 words. Stored as part of program output.

---

## Prompt 4: Monthly Narrative Report

**Triggered when:** Monthly digest generation (1st of each month per client).

**Input:**
- Last month's program performance (from attribution engine)
- Stage transition rates (this month vs last)
- Anomalies detected
- Upcoming programs (queued for next month)
- Total ROI metrics

**System prompt:**

```
You are writing a monthly customer lifecycle performance 
narrative for the merchant. Tone: confident, data-driven, 
honest about what worked and what didn't.

DATA
{{full_metrics_json}}

STRUCTURE
1. Greeting + month context
2. ✅ What worked (top 2-3 wins, with specific dollar amounts)
3. ⚠️ What needs attention (1-2 issues, with specific recommendations)
4. 🎯 What's queued for next month
5. Total ROI line

CONSTRAINTS
- Plain English, no jargon
- Specific numbers, not vague ("3 customers worth $1,847", 
  not "several customers")
- Honest tone — if churn went up, say so + why
- 200-350 words total
- Reference programs by name where helpful
```

**Model:** Opus 4.7 (higher quality matters for executive-level reports).

---

## Prompt 5: Anomaly Explanation

**Triggered when:** Rules engine detects an anomaly (sudden spike in churn, segment growth >20%/week, etc.).

**Input:**
- Anomaly type + magnitude
- Recent customer behavior trends
- Recent program activity
- Brand profile

**System prompt:**

```
You explain unusual customer behavior patterns to merchants. 
Be a curious, hypothesis-generating partner — not alarmist.

ANOMALY DETECTED
Type: {{anomaly_type}}
Magnitude: {{magnitude}}
Time period: {{timeframe}}

CONTEXT
Recent trends: {{recent_data}}
Recent campaigns: {{campaigns}}
Recent product launches: {{launches}}
Industry seasonality: {{seasonality}}

Generate 2-3 plausible hypotheses for what's causing this. 
For each hypothesis:
- State it clearly
- Identify what would confirm/deny it
- Recommend one concrete next action

Don't speculate beyond the data. If no clear cause is visible, 
say so and suggest what to investigate.
```

**Output:** Markdown-formatted hypothesis list, 200-300 words.

---

## Prompt 6: Q&A (open-ended)

**Triggered when:** User asks a question in dashboard chat.

**Input:**
- User question
- Available client data (segments, scores, trends)
- Available product capabilities (what we can recommend they do)

**System prompt:**

```
You are a customer lifecycle expert helping a merchant 
understand and improve their customer base.

Their question: {{user_question}}

Available data about their business:
{{relevant_data_extracts}}

Their available actions:
{{capabilities_list}}

Guidelines:
- Answer directly using their actual data
- Cite specific numbers when relevant
- Recommend concrete next actions if appropriate
- Don't fabricate data — if you don't have it, say so
- If question is outside scope (e.g., legal advice), say so
- 150-300 words typical

Match the brand voice in tone (informal vs formal):
{{brand_voice_brief}}
```

---

## Prompt 7: Email Subject Line Variants

**Triggered when:** Generating subject variants for A/B testing.

This is a sub-prompt of #2 but specialized:

```
Generate 5 subject line variants for this email:

Email body: {{body_excerpt}}
Brand voice: {{voice_sample}}
Goal: {{goal}}
Customer segment: {{segment}}

Constraints:
- 30–50 chars each
- Different angles (curiosity, benefit, urgency, social proof, personal)
- Match brand voice precisely
- One should NOT use any "marketing tricks" — pure plain language
- Avoid spam-trigger words: FREE, !!!, ALL CAPS

For each: state which angle and why it'd resonate with this segment.
```

---

## Prompt 8: Stage Transition Audit (explainability)

**Triggered when:** User clicks "Why is this customer in this stage?"

**Input:**
- Customer ID + recent behavior
- Stage transition rules that fired
- ML scores at time of transition

**System prompt:**

```
Explain in 2-3 sentences why {{customer}} is currently in stage 
"{{stage}}".

Triggering events:
{{transition_log}}

ML scores at transition:
{{scores}}

Reference specific behavior dates and signals. Avoid jargon.
```

**Model:** Haiku 4.5 (simple, fast, cheap — runs often).

---

## Caching strategy

```
PROMPT TYPE          CACHE KEY                              TTL
Brand voice          brand_profile_id                        Quarterly
Copy gen             segment_id + program_type + voice_hash  Until segment changes
NBP reasoning        customer_id + product_id                7 days
Monthly narrative    client_id + month                       Single use
Anomaly explanation  anomaly_id                              Until anomaly resolves
Q&A                  No cache (per-request)                  N/A
Subject variants     program_id + variant_count              Until program edited
Transition audit     customer_id + transition_id             7 days
```

**Why aggressive caching:** without it, costs scale per-customer. With it, costs scale per-segment (orders of magnitude cheaper).

## Cost monitoring

Per call:
- Track tokens in/out
- Tag with prompt_type
- Aggregate per client per month

Alerting:
- Per-client monthly spend > 2× expected → review
- Total monthly spend > budget → trigger review
- Hit cache hit rate < 70% → investigate (something's invalidating cache too aggressively)

## Phase 2 LLM expansions

| Capability | When |
|------------|------|
| Multilingual support (auto-detect customer language) | International clients |
| Voice/audio narrative reports | Premium tier feature |
| Image generation (email banners) | Phase 2 |
| Customer service ticket categorization | Once Intercom/Gorgias integrated |
| Review sentiment analysis | Once review platform integrations live |
| Continuous-learning rule suggestions ("AI proposing rules") | Phase 3 (meta-AI) |

## Implementation note

Each prompt should live in:
- `lib/llm/prompts/{name}.ts` — prompt template
- `lib/llm/schemas/{name}.ts` — Zod schema for output validation
- `lib/llm/run-{name}.ts` — orchestrator (cache check → call → validate → store)

Prompt versioning: each prompt has a version number. When updated, cache invalidates automatically. Important for iterating on prompts without re-running all customers.
