# HealthLens

Remote monitoring for chronic conditions. Patients log daily vitals, an insight worker flags problems and writes plain-language weekly summaries, and doctors get a dashboard of their patients ranked by risk.

## Contents

- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Email setup (EmailJS)](#email-setup-emailjs)
- [Demo accounts](#demo-accounts)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [API overview](#api-overview)
- [Alert rules](#alert-rules)
- [Access control and invites](#access-control-and-invites)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

## How it works

1. A patient submits vitals. The backend saves them and publishes a `vitals.logged` event to Kafka.
2. The insight worker checks the reading against that patient's thresholds and raises alerts.
3. If a multi-week trend looks concerning, it asks Gemini for a clinical summary. Only aggregated stats are sent, never names, emails or birth dates.
4. Doctors see alerts, risk status and AI insights. Patients see their own trends and weekly summaries.

Threshold rules run first and never depend on the AI, so a dangerous reading still alerts if Gemini is down.

| Part | Tech | Port |
|---|---|---|
| `frontend/` | React 18, Vite, Tailwind CSS, Recharts | 5173 |
| `backend/` | Express, TypeScript, Prisma | 4000 |
| `insight-worker/` | KafkaJS, Prisma, Google Gemini (Flash 2.0) | n/a |
| Messaging | Apache Kafka | 9092 |

## Architecture

### System overview

```mermaid
flowchart LR
    FE["Frontend<br/>React + Vite<br/>localhost:5173"]
    BE["Backend API<br/>Express + Prisma<br/>localhost:4000"]
    IW["Insight Worker<br/>KafkaJS + Gemini"]
    DB["Supabase Postgres<br/>shared schema"]
    SUPA["Supabase Auth<br/>identity provider"]
    KAFKA["Apache Kafka<br/>vitals.logged topic"]
    GEMINI["Google Gemini API<br/>Flash 2.0"]

    FE -->|"REST /api/*<br/>Bearer JWT"| BE
    BE -->|"Prisma ORM"| DB
    BE -->|"Admin REST API"| SUPA
    SUPA -->|"JWT validation"| BE
    BE -->|"Publish event"| KAFKA
    KAFKA -->|"Consume event"| IW
    IW -->|"Prisma ORM"| DB
    IW -->|"generateContent"| GEMINI
```

### Insight worker pipeline

Runs every time a patient submits a reading.

```mermaid
flowchart TD
    A["POST /patients/:id/vitals"] -->|"Kafka publish<br/>vitals.logged"| B["Kafka topic<br/>vitals.logged<br/>3 partitions"]
    B --> C["insight-worker consumes<br/>withRetries x3"]
    C --> D["1. Load vital + patient<br/>+ threshold from DB"]
    D --> E["2. evaluateThresholds()<br/>deterministic rules"]
    E -->|"Hit"| F["createAlertOnce()<br/>dedupeKey idempotent"]
    E --> G["3. analyzeBpTrend()<br/>shouldAskAi()"]
    G -->|"No flag"| H["recomputeRisk()<br/>Done"]
    G -->|"Flagged"| I["4. AI cooldown check<br/>PatientInsight.generatedAt"]
    I -->|"Cooling + no critical"| H
    I -->|"Proceed"| J["5. buildClinicalPayload()<br/>anonymised aggregates only"]
    J --> K["Gemini Flash 2.0<br/>structured JSON output"]
    K --> L["Upsert PatientInsight<br/>narrative, riskLevel, trend"]
    L -->|"riskLevel=HIGH<br/>no critical threshold hit<br/>no recent AI alert"| M["createAlertOnce()<br/>AI_PATTERN alert"]
    L --> N["recomputeRisk()<br/>update Patient.riskStatus"]
    F --> N
```

Kafka delivers at least once, so every alert carries a unique `dedupeKey` and `createAlertOnce()` is safe to retry. The AI call is rate-limited by `AI_COOLDOWN_HOURS`, and an `AI_PATTERN` alert is only raised if there hasn't been a similar one in the last 3 days.

### Authentication and token refresh

```mermaid
sequenceDiagram
    participant FE as Frontend (apiClient.ts)
    participant BE as Backend API
    participant SUPA as Supabase Auth

    Note over FE,SUPA: 1. Login
    FE->>BE: POST /auth/login { email, password }
    BE->>SUPA: POST /auth/v1/token?grant_type=password (anon key)
    SUPA-->>BE: { access_token, refresh_token, user }
    BE->>BE: Find or create User row in Prisma DB
    BE-->>FE: { token, refreshToken, user }
    FE->>FE: Save tokens to localStorage

    Note over FE,SUPA: 2. Protected API calls
    FE->>BE: GET /any-protected-route (Bearer access_token)
    BE->>SUPA: GET /auth/v1/user (Bearer token, anon key)
    SUPA-->>BE: { id, email, app_metadata: { role } }
    BE->>BE: Find User in Prisma DB, set req.user
    BE-->>FE: 200 OK

    Note over FE,SUPA: 3. Silent refresh on 401
    FE->>BE: GET /patients/:id/vitals (expired token)
    BE-->>FE: 401 Unauthorized
    FE->>FE: Intercept 401 (single-flight refresh)
    FE->>BE: POST /auth/refresh { refreshToken }
    BE->>SUPA: POST /auth/v1/token?grant_type=refresh_token
    SUPA-->>BE: { access_token, refresh_token }
    BE-->>FE: { token, refreshToken }
    FE->>FE: Rotate tokens in localStorage
    FE->>BE: Retry original request
    BE-->>FE: 200 OK
```

- Supabase access tokens last about an hour. Concurrent 401s share one in-flight refresh, because Supabase rotates refresh tokens on use and a second refresh with the old token would fail.
- If the refresh fails (for example the session was revoked), the app clears credentials and redirects to `/login`.
- A user's role (`DOCTOR` or `PATIENT`) lives in Supabase `app_metadata`, which users cannot edit themselves, unlike `user_metadata`.

### Database schema

Hosted on Supabase Postgres and managed with Prisma from `backend/prisma/schema.prisma`. The insight worker keeps a mirror copy of the schema for the shared database.

<details>
<summary>Show the full ER diagram</summary>

```mermaid
erDiagram
    User {
        String id PK
        String email UK
        String password
        String name
        Role role
        DateTime createdAt
        DateTime updatedAt
    }
    Clinic {
        String id PK
        String name
        String phone
        String address
        DateTime createdAt
        DateTime updatedAt
    }
    Doctor {
        String id PK
        String userId FK
        String clinicId FK
        String clinicName
        String phone
        DateTime createdAt
        DateTime updatedAt
    }
    CareAssignment {
        String id PK
        String patientId FK
        String doctorId FK
        String clinicId FK
        String specialty
        AssignmentStatus status
        DateTime assignedAt
        DateTime endedAt
        DateTime createdAt
        DateTime updatedAt
    }
    CareInvite {
        String id PK
        String code UK
        String doctorId FK
        String clinicId FK
        String specialty
        String patientEmail
        InviteStatus status
        DateTime expiresAt
        DateTime createdAt
        DateTime updatedAt
    }
    Patient {
        String id PK
        String userId FK
        String doctorId FK
        DateTime doctorAssignedAt
        DateTime dateOfBirth
        String gender
        String phone
        RiskStatus riskStatus
        DateTime lastReadingAt
        DateTime createdAt
        DateTime updatedAt
    }
    ChronicCondition {
        String id PK
        String patientId FK
        String label
        DateTime createdAt
    }
    Vital {
        String id PK
        String patientId FK
        Int systolic
        Int diastolic
        Float glucose
        GlucoseContext glucoseContext
        Float weightKg
        Float sleepHours
        Int heartRate
        DateTime recordedAt
        DateTime createdAt
    }
    PatientThreshold {
        String patientId PK_FK
        Int systolicMax
        Int diastolicMax
        Int glucoseFastingMax
        Int glucoseFastingMin
        Int glucosePostMealMax
        Float weightDeltaKg
        Int weightDeltaDays
        Int heartRateMax
        Int heartRateMin
        DateTime updatedAt
    }
    Alert {
        String id PK
        String patientId FK
        String acknowledgedById FK
        AlertType type
        AlertSeverity severity
        AlertStatus status
        String rule
        String triggerLabel
        String detail
        String aiRationale
        Json metrics
        String vitalId
        String dedupeKey UK
        String clinicalNote
        Boolean noteSharedWithPatient
        DateTime followUpRequestedAt
        String followUpNote
        DateTime triggeredAt
        DateTime acknowledgedAt
        DateTime resolvedAt
        DateTime createdAt
        DateTime updatedAt
    }
    Notification {
        String id PK
        String userId FK
        String title
        String message
        NotificationType type
        Boolean read
        String link
        Json metadata
        DateTime createdAt
        DateTime updatedAt
    }
    Message {
        String id PK
        String assignmentId FK
        String senderId FK
        String content
        Boolean read
        DateTime createdAt
        DateTime updatedAt
    }
    PatientInsight {
        String patientId PK_FK
        String narrative
        AiRiskLevel riskLevel
        String trend
        Json stats
        DateTime generatedAt
        DateTime updatedAt
    }
    WeeklySummary {
        String id PK
        String patientId FK
        DateTime weekStart
        DateTime weekEnd
        String narrative
        String[] takeaways
        String trend
        Json stats
        String model
        DateTime generatedAt
    }

    User ||--o| Doctor : "has"
    User ||--o| Patient : "is"
    Doctor }o--|| Clinic : "belongs to (one clinic)"
    Doctor ||--o{ CareAssignment : "supervises"
    Patient ||--o{ CareAssignment : "has"
    Clinic ||--o{ CareAssignment : "houses"
    Doctor ||--o{ CareInvite : "issues"
    CareAssignment ||--o{ Message : "contains"
    User ||--o{ Notification : "receives"
    User ||--o{ Message : "sends"
    Patient ||--o{ ChronicCondition : "has"
    Patient ||--o{ Vital : "logs"
    Patient ||--o| PatientThreshold : "has"
    Patient ||--o{ Alert : "receives"
    Patient ||--o| PatientInsight : "has"
    Patient ||--o{ WeeklySummary : "has"
    Doctor ||--o{ Alert : "acknowledges"
```

</details>

Key design decisions:

- **One doctor, one clinic.** A doctor belongs to exactly one clinic through `Doctor.clinicId`.
- **Multi-doctor care.** A patient can have several active doctors across specialties. Each `CareAssignment` links a patient to a doctor with a specialty label.
- **Shared alerts and thresholds.** Alerts are shared across all active doctors for a patient, and thresholds are set once per patient.
- **Chat per assignment.** Message threads belong to a `CareAssignment` and lock when it ends.
- **Nullable vitals.** Every measurement on `Vital` is optional, so a patient can log only blood pressure or only glucose.
- **Threshold fallback.** Missing `PatientThreshold` rows fall back to clinical-guideline defaults.

## Getting started

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 LTS | npm 10+ comes with it |
| Docker | any | Runs Kafka |
| Supabase account | n/a | Free tier is enough |
| Gemini API key | n/a | For the insight worker |
| EmailJS account | n/a | See [Email setup](#email-setup-emailjs) |
| `psql` | any | Optional, for inspecting the database |

### 1. Install

```bash
git clone <repo-url> HealthLens
cd HealthLens

cd backend        && npm install && cd ..
cd frontend       && npm install && cd ..
cd insight-worker && npm install && cd ..
```

### 2. Create a Supabase project

1. Go to supabase.com and create a **New project**. Pick a nearby region and set a strong database password.
2. Open **Project Settings → Database** and copy both connection strings:
   - **Connection pooling** (port `6543`) is your `DATABASE_URL`.
   - **Direct connection** (port `5432`) is your `DIRECT_URL`.
3. Open **Project Settings → API** and copy the project URL, the `anon` key and the `service_role` key.

Prisma uses the pooled URL for runtime queries and the direct URL for migrations, which need a real session connection.

### 3. Configure environment

Copy each `.env.example` to `.env` and fill it in. Every variable is listed in [Environment variables](#environment-variables).

### 4. Apply the database schema

From `backend/`:

```bash
npx prisma db push      # create tables, enums and indexes
npx prisma generate     # generate the Prisma client
npm run db:migrate      # apply migration.sql and backfill legacy data
```

`db:migrate` is idempotent. Every statement uses `IF NOT EXISTS` or `ON CONFLICT DO NOTHING`, then `syncLegacyAssignments()` backfills clinic and care-assignment rows from the legacy `doctorId` and `clinicName` columns. No existing data is deleted.

### 5. Seed demo data

```bash
npm run db:seed-full
```

The seed is self-contained and safe to re-run, since it upserts everywhere. It creates:

| Table | Records |
|---|---|
| Doctor | Dr. Elena Ruiz, Dr. James Okafor |
| Patient | Marcus Bell, Aiko Tanaka, Priya Nair |
| Clinic | Meridian Family Health, Okafor Cardiology Centre, Austin Multi-Specialty |
| CareAssignment | 5, including 1 historical ended one |
| Vital | 90 rows (30 days x 3 patients, with heart rate) |
| WeeklySummary | 12 rows (4 weeks x 3 patients) |
| Alert, Notification, Message, PatientInsight, CareInvite | A handful each, enough to fill every screen |

### 6. Start everything

```bash
docker compose up -d                 # Kafka, from the repo root

cd backend && npm run dev            # API
cd frontend && npm run dev           # UI at http://localhost:5173
cd insight-worker && npm run dev     # AI worker (optional)
```

To browse the database, run `npx prisma studio` from `backend/` and open http://localhost:5555.

## Environment variables

Never commit `.env` files. The Supabase service-role key and the EmailJS private key bypass normal access rules, so keep them on the server only.

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase pooled Postgres URL (port 6543, `?pgbouncer=true`). Used for runtime queries. |
| `DIRECT_URL` | Yes | Direct Postgres URL (port 5432). Used by Prisma for migrations and `db push`. |
| `SUPABASE_URL` | Yes | Supabase project URL. |
| `SUPABASE_ANON_KEY` | Yes | Public anon key. Used for password login and token validation. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Secret service-role key. Used to create users through the Admin API. Never expose it to the browser. |
| `EMAILJS_SERVICE_ID` | For email | EmailJS service ID. |
| `EMAILJS_TEMPLATE_ID` | For email | EmailJS template ID. |
| `EMAILJS_PUBLIC_KEY` | For email | EmailJS public key (sent as `user_id`). |
| `EMAILJS_PRIVATE_KEY` | For email | EmailJS private key (sent as `accessToken`). Server only. |
| `PORT` | No | API port. Default `4000`. |
| `KAFKA_BROKER` | No | Kafka broker address. Default `localhost:9092`. |
| `SUPABASE_JWT_SECRET` | No | Kept for reference. Not used by the middleware. |
| `JWT_SECRET` | No | Legacy fallback. Not used for auth. |

### `insight-worker/.env`

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Same pooled URL as the backend, since both share one database. |
| `DIRECT_URL` | Yes | Same direct URL as the backend. |
| `KAFKA_BROKER` | Yes | Kafka broker address. Must match the backend. Default `localhost:9092`. |
| `GEMINI_API_KEY` | Yes | Google Gemini API key. |
| `AI_COOLDOWN_HOURS` | No | Minimum hours between AI analyses for one patient. Default `6`. |

### `frontend/.env`

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | No | Backend URL. Default `http://localhost:4000/api`. Must match the backend `PORT`. |
| `VITE_USE_MOCKS` | No | `false` talks to the real API. Omit it or set `true` to use in-memory mock data, which is handy for UI-only work. |

Vite only exposes variables that start with `VITE_`, and anything it exposes ends up in the browser bundle. Never put secrets in the frontend `.env`.

### Example

```bash
# backend/.env
DATABASE_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.xxxx:PASSWORD@aws-0-region.pooler.supabase.com:5432/postgres"
SUPABASE_URL="https://xxxx.supabase.co"
SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
EMAILJS_SERVICE_ID="service_xxx"
EMAILJS_TEMPLATE_ID="template_xxx"
EMAILJS_PUBLIC_KEY="..."
EMAILJS_PRIVATE_KEY="..."
PORT=4000
KAFKA_BROKER="localhost:9092"

# frontend/.env
VITE_API_BASE_URL="http://localhost:4000/api"
VITE_USE_MOCKS="false"
```

## Email setup (EmailJS)

HealthLens sends transactional email (for example critical alerts and visit requests) through [EmailJS](https://www.emailjs.com).

### 1. Create the service

1. In the EmailJS dashboard, open **Email Services** and add your provider (Gmail works).
2. If you use Gmail, **tick every permission box** on Google's consent screen, especially the one allowing EmailJS to send email on your behalf. If you skip it, sends fail with `Request had insufficient authentication scopes` (HTTP 412). To fix that, click **Reconnect** on the service and approve everything.
3. Use **Send Test Email** on the service page to confirm it works.

### 2. Create the template

Open **Email Templates** and create a template that uses these variables:

| Variable | Used for |
|---|---|
| `{{to_email}}` | Recipient. Put this in the template's **To Email** field. |
| `{{to_name}}` | Recipient's name |
| `{{doctor_name}}` | Sending doctor |
| `{{reply_to}}` | Reply-to address |
| `{{clinic_name}}` | Clinic name |
| `{{subject_line}}` | Email subject |
| `{{headline}}` | Heading in the email body |
| `{{body_text}}` | Main message |
| `{{portal_url}}` | Link back to the app |

### 3. Allow server-side calls

The backend calls EmailJS from Node, so in **Account → Security** enable **Allow EmailJS API for non-browser applications**. Then add the four `EMAILJS_*` variables to `backend/.env`.

### 4. Smoke test

```bash
curl -s -w '\nHTTP %{http_code}\n' -X POST https://api.emailjs.com/api/v1.0/email/send \
  -H 'Content-Type: application/json' -d '{
    "service_id": "service_xxx",
    "template_id": "template_xxx",
    "user_id": "PUBLIC_KEY",
    "accessToken": "PRIVATE_KEY",
    "template_params": {
      "to_email": "you@example.com", "to_name": "Test", "doctor_name": "Dr. Test",
      "reply_to": "doctor@example.com", "clinic_name": "Test Clinic",
      "subject_line": "EmailJS smoke test", "headline": "Smoke test",
      "body_text": "If you can read this, EmailJS works.", "portal_url": "http://localhost:5173"
    }
  }'
```

A `200` only means EmailJS accepted the request, not that the email was delivered. If nothing arrives:

- Check that the template's **To Email** field is `{{to_email}}`.
- Look in spam and Promotions, and in the sending Gmail account's **Sent** folder.
- Check **Email History** in the EmailJS dashboard. If your request isn't listed, the IDs and keys come from a different account.
- Make sure the template actually uses `{{subject_line}}` and `{{body_text}}`.
- Try a different recipient address to rule out inbox filtering.

## Demo accounts

After seeding, the demo accounts use the password `demo1234`.

| Role | Email |
|---|---|
| Doctor (General Practice) | `doctor@healthlens.demo` |
| Doctor (Cardiology) | `doctor2@healthlens.demo` |
| Patients | `patient@healthlens.demo`, `patient2@healthlens.demo`, `patient3@healthlens.demo` |

If you add custom accounts to a seed file, the script prints every login in a table when it finishes.

## Scripts

Run these from `backend/`.

| Script | What it does |
|---|---|
| `npm run dev` | Start the API in watch mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npx prisma db push` | Push the schema to the database (no migration history) |
| `npx prisma generate` | Regenerate the Prisma client |
| `npx prisma studio` | Open the visual database browser |
| `npm run db:migrate` | Apply migration SQL and backfill legacy data |
| `npm run db:seed-full` | Seed all demo data (self-contained, use this one) |
| `npm run db:seed-new` | Seed only the new-schema tables (needs the base seed first) |
| `npm run seed` | Original base seed (legacy) |

## Project structure

```
HealthLens/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        Database schema (source of truth)
│   │   ├── seed-full.ts         Full demo seed
│   │   └── migrations/          Idempotent migration SQL
│   ├── scripts/migrate-db.ts    One-shot migration runner
│   └── src/
│       ├── server.ts, app.ts    Entry point and Express setup
│       ├── config.ts            Env loading
│       ├── db/                  Prisma client and legacy-data sync
│       ├── kafka/producer.ts    vitals.logged publisher
│       ├── lib/                 Supabase clients and helpers
│       ├── middleware/          auth, accessGuard, errorHandler
│       └── modules/             auth, doctor, patients, alerts
├── frontend/
│   └── src/
│       ├── pages/               doctor/ and patient/ views
│       ├── components/          layout, charts, ui
│       ├── services/            API layer (with mock-data toggle)
│       ├── context/             Auth and toast providers
│       └── types/index.ts       Shared API types
└── insight-worker/
    └── src/
        ├── ai/                  Gemini wrapper, prompts, schemas
        ├── rules/               Thresholds and trend checks
        ├── services/            Analyzer, alerts, weekly summaries
        └── schedulers/          Weekly summary cron
```

## API overview

Base URL `http://localhost:4000/api`, authenticated with `Authorization: Bearer <access token>`. Errors come back as `{ "message": "..." }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/register-doctor`; `GET /auth/me`; `PATCH /auth/password` |
| Doctor | `GET /doctor/overview`, `/doctor/patients`; `POST /doctor/patients`; `GET/PATCH/DELETE /doctor/patients/:id`; `GET/PUT /doctor/patients/:id/thresholds` |
| Patients | `GET /patients/:id/profile`, `/dashboard`, `/vitals`, `/vitals/log`, `/summaries`, `/alerts/history`; `POST /patients/:id/vitals` |
| Alerts | `GET /alerts`; `PATCH /alerts/:id`; `POST /alerts/:id/follow-up` |

For `/patients/:id`, `:id` can also be `me`. When a doctor creates a patient, the API returns a one-time `temporaryPassword` so the patient can log in straight away.

## Alert rules

| Rule | Fires when | Severity |
|---|---|---|
| `BP_THRESHOLD` | Systolic or diastolic above the patient's max | Critical |
| `GLUCOSE_LOW` | Glucose below the fasting minimum | Critical |
| `GLUCOSE_VERY_HIGH` | Glucose at or above 400 mg/dL | Critical |
| `GLUCOSE_FASTING_HIGH` | Fasting glucose above the max | Caution |
| `GLUCOSE_POST_MEAL_HIGH` | Post-meal glucose above the max | Caution |
| `WEIGHT_DELTA` | Weight change beyond the limit within the set window | Caution |

Doctors can tune thresholds per patient. Defaults follow standard clinical guidelines.

## Access control and invites

Every doctor, patient and alert route goes through one guard in `backend/src/middleware/accessGuard.ts`:

```ts
hasActiveCareAssignment(doctorId, patientId): Promise<boolean>
```

A doctor can reach a patient only if an `ACTIVE` `CareAssignment` exists between them. Clinic membership alone grants nothing, so two doctors in the same clinic can't see each other's patients without an explicit assignment. Patients can only reach their own data.

**Invite codes.** A doctor generates a `CareInvite` code from their dashboard and shares it with a patient. The patient enters it during sign-up or under Profile → "Connect to a Doctor". The system then:

1. Checks the code is unexpired, unused and, if restricted, matches the patient's email.
2. Creates an `ACTIVE` `CareAssignment` between the patient and the doctor.
3. Marks the invite `ACCEPTED`.
4. Sends an in-app notification to both people.
