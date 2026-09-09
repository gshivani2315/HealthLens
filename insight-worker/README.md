# HealthLens — Intelligence Layer (`insight-worker`)

The `insight-worker` is an independent daemon that consumes patient vitals events, applies clinical rules, and generates AI-powered insights and alerts using Google Gemini.

## Overview

HealthLens follows an **Interaction → Application → Intelligence** architecture:

1. **Interaction** (`frontend`) — React UI where patients log daily vitals (BP, Glucose, Weight, Sleep).
2. **Application** (`backend`) — Express/Node API validates and stores readings in TimescaleDB, then publishes a `vitals.logged` event to Kafka and returns `201 Created` immediately.
3. **Intelligence** (`insight-worker`, this repo) — Consumes Kafka events, runs deterministic clinical rule checks, pulls historical telemetry, queries Gemini for pattern analysis, and writes alerts/summaries.

```
[Patient UI] → [Backend API] → [TimescaleDB]
                     │
              (vitals.logged)
                     ▼
              [Apache Kafka]
                     │
                     ▼
            [Insight Worker]
          ┌──────────┴──────────┐
   (Deterministic Rules)   (Google Gemini API)
                     │
                     ▼
         [Alerts & Summaries → PostgreSQL / Redis]
```

## Tech Stack

| Technology | Purpose |
|---|---|
| Apache Kafka | Decouples backend from compute-heavy analytics |
| Node.js + TypeScript | Async event processing & scheduled jobs |
| KafkaJS | Kafka client (topics, partitions, consumer groups) |
| TimescaleDB / Postgres | Time-series storage, fast 30/90-day queries |
| Google Gemini API (`gemini-2.5-flash`) | Trend analysis, anomaly detection, risk scoring |
| node-cron | Weekly summary scheduling (Mondays 8:00 AM) |
| Redis *(optional)* | Caches AI insights to avoid redundant LLM calls |

## How It Works

### Real-Time Pipeline (event-driven)

1. Backend publishes a `vitals.logged` event on each new reading:
```json
   {
     "patientId": "pt_1024",
     "vitalType": "BP",
     "systolic": 165,
     "diastolic": 102,
     "timestamp": "2026-09-09T10:15:00Z"
   }
```
2. Worker checks deterministic thresholds first:
   - BP Systolic ≥ 160 or Diastolic ≥ 100 → Critical Alert
   - Glucose (fasting) > 180 mg/dL or < 70 mg/dL → Critical Alert
3. Worker fetches 30 days of history from TimescaleDB for baseline/trend context.
4. If thresholds are breached, or a trend heuristic fires (e.g. 5+ consecutive elevated readings), the timeline is sent to Gemini for pattern analysis.
5. If Gemini returns `riskLevel: HIGH`, or a deterministic rule was breached, an alert is written to the `alerts` table and surfaced on the Doctor Dashboard.

### Weekly Roll-Up Pipeline (scheduled)

- Runs every Monday at 08:00 AM.
- Aggregates the prior 7 days of logs per patient.
- Asks Gemini to generate a clear, non-jargon summary (email + dashboard card).

## Setup

### Prerequisites

- Docker Desktop
- Node.js v20+
- A Google Gemini API key

### 1. Start Kafka + TimescaleDB

`docker-compose.yml`:

```yaml
version: '3.8'

services:
  kafka:
    image: bitnami/kafka:latest
    container_name: healthlens-kafka
    ports:
      - "9092:9092"
    environment:
      - KAFKA_CFG_NODE_ID=1
      - KAFKA_CFG_PROCESS_ROLES=broker,controller
      - KAFKA_CFG_CONTROLLER_QUORUM_VOTERS=1@kafka:9093
      - KAFKA_CFG_LISTENERS=PLAINTEXT://:9092,CONTROLLER://:9093
      - KAFKA_CFG_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092
      - KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      - KAFKA_CFG_CONTROLLER_LISTENER_NAMES=CONTROLLER
      - KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE=true

  timescaledb:
    image: timescale/timescaledb:latest-pg16
    container_name: healthlens-db
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=healthlens
      - POSTGRES_PASSWORD=healthlens_secret
      - POSTGRES_DB=healthlens_db
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

```bash
docker compose up -d
```

### 2. Configure environment variables

`insight-worker/.env`:

```env
PORT=5002
KAFKA_BROKER=localhost:9092
KAFKA_GROUP_ID=healthlens-insight-group
DATABASE_URL=postgresql://healthlens:healthlens_secret@localhost:5432/healthlens_db
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

### 3. Install dependencies

```bash
cd insight-worker
npm install kafkajs @google/genai node-cron pg dotenv
npm install -D typescript @types/node @types/pg tsx
```

### 4. Run the worker

`src/index.ts` should initialize the Kafka consumer and start the scheduler:

```typescript
import { Kafka } from 'kafkajs';
import dotenv from 'dotenv';
import { processVitalReading } from './services/analyzer';
import { startWeeklyScheduler } from './schedulers/weeklySummary';

dotenv.config();

const kafka = new Kafka({
  clientId: 'insight-worker',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092']
});

const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID || 'healthlens-insight-group' });

async function start() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'vitals.logged', fromBeginning: false });

  console.log('🚀 Insight Worker listening for Kafka events on "vitals.logged"...');

  startWeeklyScheduler();

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const vitalData = JSON.parse(message.value.toString());
      await processVitalReading(vitalData);
    }
  });
}

start().catch(console.error);
```

Run in dev mode:

```bash
npx tsx src/index.ts
```

## Testing

### Scenario 1 — Normal reading (no alert)

Send:

```json
{
  "patientId": "patient_01",
  "vitalType": "BP",
  "systolic": 118,
  "diastolic": 78,
  "timestamp": "2026-09-09T11:00:00Z"
}
```

Expected log:

```
[Received Event]: Vitals for patient_01
[Deterministic Check]: Passed. Values within normal range.
[Trend Evaluation]: Baseline stable. No alert created.
```

### Scenario 2 — Critical threshold breach (BP > 160/100)

Send:

```json
{
  "patientId": "patient_01",
  "vitalType": "BP",
  "systolic": 172,
  "diastolic": 105,
  "timestamp": "2026-09-09T11:05:00Z"
}
```

Expected:
- Deterministic rule fires immediately (Systolic ≥ 160).
- Worker calls Gemini with 30-day telemetry for rationale.
- Alert row inserted:

```sql
SELECT * FROM alerts WHERE patient_id = 'patient_01' ORDER BY created_at DESC LIMIT 1;
```

- `status: CRITICAL`, `type: THRESHOLD_EXCEEDED`, `message`: Gemini clinical summary.

### Scenario 3 — AI pattern detection (gradual deterioration)

1. Seed TimescaleDB with 14 days of steadily rising readings (e.g. Systolic 122 → 148).
2. Submit a new reading of `150/94 mmHg` (below the hard 160 cutoff).

Expected:
- Deterministic rule passes.
- Moving average detects a 14-day continuous ascent.
- Gemini returns `riskLevel: "HIGH"` with a rationale, e.g. describing a continuous rise across rolling averages.
- Alert persisted with `type: AI_PATTERN_ALERT`.

### Scenario 4 — Manual trigger of weekly summary

To test summary generation without waiting for Monday:

```bash
npm run test:summary
```

This runs an ad-hoc aggregation of the past 7 days for a mock patient through `generateWeeklySummary()`. Check console output for structured JSON containing:

- `overallTrend`
- `bloodPressureStatus`
- `lifestyleTip`