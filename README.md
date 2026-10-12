# HealthLens

HealthLens is a remote patient-monitoring app with three parts in this repo:

```
/frontend   React + Vite + TypeScript UI (patient & doctor views)
/backend    Express/Node API + Prisma schema (source of truth for the DB)
/insight    Kafka consumer + Gemini AI worker ("the insight layer")
```

Architecture, one line each:

```
Patient logs vitals (frontend)
      → backend API validates + saves to Postgres (Supabase)
      → backend publishes a `vitals.logged` Kafka event
      → insight-worker runs threshold rules + trend detection
      → insight-worker calls Gemini when something looks worth reviewing
      → alerts / AI insights / weekly summaries written back to the DB
      → frontend (patient + doctor dashboards) read them back out
```

This doc gets all three running locally. Read it top to bottom once; after that, each section stands alone.

---

## 0. Prerequisites

Install once:

- **Node.js v20+** — `node -v`
- **Docker Desktop** (for local Kafka) — `docker --version` and `docker compose version`. See [Checking Docker is installed](#appendix-checking-docker) below if unsure.
- **A Supabase project** (shared Postgres database for backend + insight). Ask a teammate for an invite to the existing project, or create a new one at supabase.com — either way you need its connection strings (step 2).
- **A Google Gemini API key** — console for `@google/genai`. Needed only to run `insight/`.
- **Git** access to this repo.

You do **not** need Docker for Postgres — the database lives in Supabase, not in a container. Docker is only used for Kafka.

---

## 1. Clone and get your bearings

```bash
git clone <repo-url>
cd <repo-name>
ls
# backend/  frontend/  insight/  docker-compose.yml
```

`docker-compose.yml` lives at the repo root and starts Kafka only:

```yaml
services:
  kafka:
    image: apache/kafka:3.9.0
    container_name: healthlens-kafka
    ports:
      - "9092:9092"
    restart: unless-stopped
```

---

## 2. Database (Supabase + Prisma) — do this first

`backend/prisma/schema.prisma` is the **single source of truth** for the database. Both `backend` and `insight` read from the same Postgres database and the same generated Prisma client, so this step unblocks both.

### 2.1 Get your connection strings

In Supabase: **Project → Connect**. You need two URLs:

- **Transaction pooler** (port `6543`) → this is `DATABASE_URL`. Used by short-lived requests (the API).
- **Session pooler** (port `5432`) → this is `DIRECT_URL`. Used for migrations, and also by `insight` (a long-running process).

### 2.2 Configure `backend/.env`

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

- If your DB password has special characters (`@ # / %` etc.), URL-encode them (`@` → `%40`), or the connection will fail with an auth error.
- Don't keep the `[ ]` brackets Supabase's template shows — those are placeholders.

### 2.3 Install Prisma and run the migration

```bash
cd backend
npm install
npx prisma migrate dev --name init_healthlens
```

This creates every table (`User`, `Patient`, `Doctor`, `Vital`, `Alert`, `PatientThreshold`, `PatientInsight`, `WeeklySummary`, `ChronicCondition`) in Supabase and generates the Prisma client.

**If migrate dev complains about a previous failed migration**, run:
```bash
npx prisma migrate resolve --rolled-back <migration-name>
npx prisma migrate dev --name init_healthlens
```

**If you ever want a totally clean slate** (drops and recreates every table — only do this on a dev database you're fine wiping):
```bash
npx prisma migrate reset
```

### 2.4 Run the SQL extras

Open **Supabase → SQL Editor**, paste the contents of `backend/prisma/extras.sql`, and run it. This adds:
- `CHECK` constraints on `Vital` (sane ranges, at least one reading present, BP is a pair).
- Row-Level Security enabled on every table (Prisma connects as `postgres` and bypasses RLS, but this keeps Supabase's auto-generated REST API from exposing patient data).

### 2.5 Verify

In **Supabase → Table Editor** you should see all the tables listed above, empty for now.

---

## 3. Backend (`/backend`)

```bash
cd backend
npm install
```

`.env` (same file as step 2.2 — add these alongside `DATABASE_URL` / `DIRECT_URL`):

```env
PORT=4000
JWT_SECRET=<any random string for local dev>
KAFKA_BROKER=localhost:9092
KAFKA_TOPIC=vitals.logged
```

Start Kafka first (needed before the backend can publish events):

```bash
cd ..               # repo root, where docker-compose.yml lives
docker compose up -d
docker ps            # confirm "healthlens-kafka" is running on 9092
```

Then run the backend:

```bash
cd backend
npm run dev
```

> The backend's job per the architecture: validate incoming vitals, write a `Vital` row to Postgres, then publish `{ vitalId, patientId, recordedAt }` to the `vitals.logged` Kafka topic — no readings in the event payload itself, just enough for the worker to look the row up.

---

## 4. Frontend (`/frontend`)

```bash
cd frontend
npm install
```

`.env` (create if it doesn't exist):

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_USE_MOCKS=false
```

- `VITE_USE_MOCKS=true` runs the UI entirely on in-memory mock data (`src/services/mockData.ts`) with no backend needed — useful for pure frontend work.
- `VITE_USE_MOCKS=false` calls the real backend at `VITE_API_BASE_URL`.

Run it:

```bash
npm run dev
```

Demo logins (only work against mocks, or once the backend has matching seeded users):
- Patient: `patient@healthlens.demo` / `demo1234`
- Doctor: `doctor@healthlens.demo` / `demo1234`

---

## 5. Insight worker (`/insight`) — the AI layer

This is the Kafka consumer that runs clinical rules and calls Gemini. It needs Kafka (step 3) and the database (step 2) already set up.

```bash
cd insight
npm install kafkajs @google/genai node-cron @prisma/client@6 dotenv zod
npm install -D typescript tsx prisma@6 @types/node
```

`.env`:

```env
KAFKA_BROKER=localhost:9092
KAFKA_GROUP_ID=healthlens-insight-group
KAFKA_TOPIC=vitals.logged
KAFKA_DLQ_TOPIC=vitals.logged.dlq

# Long-running process → use the SESSION pooler (5432), not the pgbouncer one
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"

GEMINI_API_KEY=<your key>
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=15000
AI_COOLDOWN_HOURS=12

ENABLE_SCHEDULER=true
SCHEDULER_TZ=Asia/Kolkata
WEEKLY_CRON=0 8 * * 1
```

Sync the schema from `backend/` and generate the client:

```bash
npm run db:sync
npm run typecheck
```

Seed three demo patients with 30 days of history (stable, critical, and slow-rising BP patterns):

```bash
npm run seed
```

Run the worker:

```bash
npm run dev
```

You should see:
```
🚀 Insight Worker listening on "vitals.logged" (group healthlens-insight-group)
[Scheduler]: weekly summaries "0 8 * * 1" (Asia/Kolkata); hourly risk recompute
```

### Test it end-to-end

In a second terminal, still in `insight/`:

```bash
npm run publish:event -- patient_stable 118 78     # normal reading → no alert
npm run publish:event -- patient_critical 172 105  # CRITICAL threshold alert + AI rationale
npm run publish:event -- patient_rising 150 94     # under 160/100, but AI_PATTERN alert on trend
npm run test:summary -- patient_rising             # generate a weekly summary on demand
```

Watch the first terminal's logs, and check **Supabase → Table Editor → Alert / PatientInsight / WeeklySummary** to see the rows land.

---

## 6. Run order, every day

```bash
# 1. Kafka (repo root)
docker compose up -d

# 2. three separate terminals:
cd backend && npm run dev
cd insight && npm run dev
cd frontend && npm run dev
```

Stop Kafka when you're done: `docker compose down` (from the repo root).

---

## 7. What each folder owns

| Folder | Owns | Doesn't touch |
|---|---|---|
| `frontend` | UI, routing, charts, forms | Never talks to Postgres or Kafka directly — only `VITE_API_BASE_URL` |
| `backend` | Auth, REST API, writing `Vital` rows, publishing Kafka events | Never calls Gemini |
| `insight` | Consuming Kafka, threshold rules, trend detection, Gemini calls, writing `Alert` / `PatientInsight` / `WeeklySummary` | Never serves HTTP to the frontend directly |

The Prisma schema is owned by `backend/prisma/schema.prisma`. `insight` copies it via `npm run db:sync` — **never edit `insight/prisma/schema.prisma` directly**, it gets overwritten.

---

## 8. Common errors

| Error | Fix |
|---|---|
| `Environment variable not found: DIRECT_URL` | Add `DIRECT_URL` to `backend/.env` (step 2.2) |
| `Cannot connect to the Docker daemon` | Open Docker Desktop and wait for "Engine running" |
| Worker connects but nothing happens when you publish an event | Check `KAFKA_TOPIC` matches in both `backend/.env` and `insight/.env` |
| Migration says a prior one is in a failed state | `npx prisma migrate resolve --rolled-back <name>`, then retry |
| Gemini calls fail/timeout | Check `GEMINI_API_KEY` is set and valid; worker logs the error but keeps deterministic alerts intact either way |
| Frontend shows nothing / network errors | Check `VITE_USE_MOCKS` and `VITE_API_BASE_URL`, and that `backend` is actually running |

---

## Appendix: Checking Docker is installed {#appendix-checking-docker}

```bash
docker --version          # confirms it's installed
docker info                # confirms the engine is actually running
docker compose version     # confirms Compose is available
```

If `docker info` errors with "Cannot connect to the Docker daemon," Docker Desktop isn't open — launch it and wait for "Engine running" before retrying.
