# HealthLens Insight Worker

Owner: Teammate 3

Standalone Node.js process. Consumes `vitals.logged` from Kafka,
runs trend analysis + rule-based severity detection, optionally calls
Gemini for a human-readable explanation, and stores alerts/summaries.

## Setup
npm install
npm run dev

## Structure
- src/consumer.ts        Kafka consumer entry point
- src/trend-analysis.ts  compute trend from recent readings
- src/rules.ts           deterministic severity classification (no AI)
- src/ai.ts              Gemini call - explains structured findings only
- src/summaries.ts       weekly summary generation
