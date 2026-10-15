# HealthLens — Developer & AI Agent Handoff Packet

Welcome to **HealthLens**! This handoff document is tailored for incoming teammates and AI agents to get completely up to speed on the system architecture, file layout, data contracts, and workflows across the entire platform.

---

## 1. High-Level Architecture

HealthLens is a remote patient-monitoring and clinical intelligence application organized into three primary layers:

```
┌────────────────────────────────────────────────────────┐
│                    INTERACTION                         │
│   frontend/ (Vite + React 18 + Tailwind + Recharts)    │
│   • Patient Portal: Daily vitals logging, trend charts │
│   • Doctor Portal: Patient roster, triage & alerts     │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP (REST + Bearer JWT)
                            ▼
┌────────────────────────────────────────────────────────┐
│                    APPLICATION                         │
│      backend/ (Node.js + Express + Prisma ORM)         │
│   • Auth (Supabase Auth / JWT + bcrypt fallback)       │
│   • PostgreSQL / Supabase storage & ownership guards   │
│   • Publishes 'vitals.logged' events to Kafka          │
└───────────────────────────┬────────────────────────────┘
                            │ Event Stream (Kafka topic: vitals.logged)
                            ▼
┌────────────────────────────────────────────────────────┐
│                    INTELLIGENCE                        │
│        insight-worker/ (Node.js Background Daemon)     │
│   • Consumes vitals.logged events (FIFO per patient)   │
│   • Clinical rule evaluation (hard bounds & trends)    │
│   • Google Gemini API calls (narratives & insights)    │
│   • Writes Alerts & WeeklySummaries back to Postgres   │
└────────────────────────────────────────────────────────┘
```

---

## 2. Repository File Layout

```
healthlens/
├── docker-compose.yml              # Local Kafka container (apache/kafka:3.9.0 on :9092)
├── README.md                       # High-level repo summary
├── handoff.md                      # This handoff packet
│
├── frontend/                       # Client SPA
│   ├── package.json                # React 18, Vite 5, Recharts 2, Tailwind 3
│   ├── vite.config.ts              # Alias @ -> src, port 5173
│   ├── tailwind.config.js          # Custom theme: ink, paper, teal, brick, amber, moss
│   └── src/
│       ├── main.tsx                # App root & BrowserRouter mount
│       ├── App.tsx                 # Route tree & ProtectedRoute role gating
│       ├── types/index.ts          # Unified TypeScript domain interfaces
│       ├── context/
│       │   ├── AuthContext.tsx     # Session management (login, registerDoctor, logout)
│       │   └── ToastContext.tsx    # Toast notification system
│       ├── routes/
│       │   └── ProtectedRoute.tsx  # Role-based route guard ('patient' | 'doctor')
│       ├── services/
│       │   ├── apiClient.ts        # Unified fetch wrapper with USE_MOCKS switch
│       │   ├── mockData.ts         # In-memory realistic seed generators
│       │   ├── authService.ts      # Auth network calls
│       │   ├── vitalsService.ts    # Telemetry and logging calls
│       │   ├── patientsService.ts  # Patient profile & roster calls
│       │   ├── doctorService.ts    # Doctor overview calls
│       │   ├── alertsService.ts    # Alert console actions
│       │   └── thresholdsService.ts# Threshold get/save calls
│       ├── pages/
│       │   ├── LoginPage.tsx       # Sign In & Doctor Registration toggle tabs
│       │   ├── patient/            # Dashboard, LogVitals, Trends, Insights, Profile
│       │   └── doctor/             # Dashboard, PatientDetail, Alerts, Thresholds
│       └── components/             # Reusable UI, layout & chart components
│
├── backend/                        # REST API Application
│   ├── package.json                # Express 4, Prisma 6, bcrypt, kafkajs, jsonwebtoken
│   ├── tsconfig.json               # ES2020, commonjs, dist output
│   ├── prisma/
│   │   ├── schema.prisma           # Postgres/Supabase database schema
│   │   └── seed.ts                 # Database seed (doctor@healthlens.demo, Marcus Bell, etc.)
│   └── src/
│       ├── server.ts               # HTTP server entrypoint
│       ├── app.ts                  # Express app setup, CORS, JSON body, route mounting
│       ├── config.ts               # Env parsing (PORT, JWT_SECRET, SUPABASE_*, KAFKA_BROKER)
│       ├── db/index.ts             # Prisma client singleton
│       ├── kafka/
│       │   └── producer.ts         # Kafka producer & publishVitalLoggedEvent() helper
│       ├── lib/
│       │   └── jwt.ts              # Token signing & Supabase/custom JWT verification
│       ├── middleware/
│       │   ├── auth.ts             # requireAuth (with auto-provisioning) & requireRole
│       │   └── errorHandler.ts     # Global JSON error formatter
│       └── modules/
│           ├── auth/               # /api/auth (login, register-doctor, me, logout)
│           ├── patients/           # /api/patients (profile, dashboard, vitals, logs)
│           ├── doctor/             # /api/doctor (overview, roster, detail, thresholds)
│           └── alerts/             # /api/alerts (list, status patch, follow-up)
│
└── insight-worker/                 # Intelligence Daemon
    ├── package.json                # @google/genai, kafkajs, node-cron, zod, prisma
    ├── scripts/sync-schema.js      # Copies schema.prisma from backend -> worker
    └── src/
        ├── index.ts                # Kafka consumer loop & scheduler starter
        ├── config.ts               # Worker env config (KAFKA_BROKER, GEMINI_API_KEY, etc.)
        ├── events.ts               # Zod contract for vitals.logged
        ├── db.ts                   # Worker Prisma client singleton
        ├── schedulers/             # node-cron weekly summary cron job
        ├── services/
        │   └── analyzer.ts         # Fetches vital by ID, evaluates rules, triggers Gemini
        └── ai/                     # Google Gemini integration & prompts
```

---

## 3. Tech Stack & Dependencies

| Component | Framework / Library | Role |
|---|---|---|
| **Frontend** | React 18, Vite 5, Tailwind CSS | SPA with responsive mobile + desktop views |
| **Charting** | Recharts 2 | BP lines, glucose scatter, dual-axis weight/sleep |
| **Backend API** | Node.js, Express 4, TypeScript | Modular REST API server (port 4000) |
| **Database & ORM** | PostgreSQL (Supabase), Prisma 6 | Relational persistence, connection pooling |
| **Message Broker** | Apache Kafka 3.9 (KRaft mode) | Asynchronous telemetry pipeline (port 9092) |
| **Worker AI** | `@google/genai` (Gemini 2.5 Flash) | Weekly narrative generation & trend analysis |
| **Auth** | Supabase Auth + JWT / bcrypt | Dual-mode bearer token verification |

---

## 4. Key Implementation Details

### A. Authentication & Supabase Integration
* **Dual Auth Handling (`backend/src/lib/jwt.ts` & `auth.service.ts`)**:
  * If `SUPABASE_URL` and `SUPABASE_JWT_SECRET` are present, tokens issued by Supabase Auth are decoded and verified directly.
  * Roles (`DOCTOR` vs `PATIENT`) are extracted from token metadata (`app_metadata.role` or `user_metadata.role`).
  * If the user was verified in Supabase Auth but does not exist in the Prisma Postgres table yet, `backend/src/middleware/auth.ts` **auto-provisions** their `User` and `Patient`/`Doctor` record automatically on the first authenticated request.
  * If Supabase is offline or not configured, standard bcrypt-hashed local database authentication handles user sessions.
* **Role Casing Normalization**:
  * In Database: Enum `Role` is uppercase (`Role.DOCTOR`, `Role.PATIENT`).
  * In API Responses: Serialized to lowercase (`"doctor"`, `"patient"`), aligning 1:1 with frontend `types/index.ts` (`AuthUser.role`).

### B. Doctor Registration & Role Guards
* **Doctor Registration**:
  * Endpoint: `POST /api/auth/register-doctor` (alias `/api/auth/register`).
  * Creates doctor user + linked `Doctor` profile (with `clinicName` and `phone`) in one transaction.
  * Frontend UI: Accessible directly via the toggle tab in `frontend/src/pages/LoginPage.tsx`.
* **Role Guarding (`requireRole`)**:
  * Routes under `/api/doctor/*` and `/api/alerts/*` are strictly guarded by `requireRole('DOCTOR')`.
  * Regular patients attempting to call doctor management routes receive `403 Forbidden`.

### C. Ownership & Tenant Isolation
* **Doctor Roster**:
  * `GET /api/doctor/overview` and `GET /api/doctor/patients` automatically resolve the requesting doctor ID from `req.user.sub` / `req.user.dbUserId` and filter queries using `where: { doctorId: doctor.id }`.
  * A doctor only ever views patients assigned to them.
* **Patient Telemetry (`/api/patients/:id/*`)**:
  * Handlers check that `req.user` is either the patient themselves (`userId === patient.userId`) OR the patient's assigned physician (`doctorId === doctor.id`). Unauthorized requests return `403 Forbidden`.
  * Supports `:id = 'me'` to automatically resolve the calling user's patient profile.

### D. Event-Driven Telemetry Pipeline (Kafka)
* When a patient submits a reading via `POST /api/patients/:id/vitals`:
  1. Record is inserted into the `Vital` table in PostgreSQL.
  2. Patient's `lastReadingAt` timestamp is updated.
  3. `publishVitalLoggedEvent()` publishes a thin claim-check event to Kafka topic `vitals.logged`:
     ```json
     {
       "vitalId": "cuid...",
       "patientId": "pat_001",
       "recordedAt": "2026-10-15T12:00:00.000Z"
     }
     ```
  4. **Partition Key**: The message key is set to `patientId`. Kafka ensures that all events for a single patient land in the same partition, guaranteeing strict FIFO order of readings for trend processing.
* The `insight-worker` consumer:
  1. Validates the event with Zod (`vitalsLoggedSchema`).
  2. Re-reads the fresh `Vital` row from PostgreSQL.
  3. Checks hard cutoffs from `PatientThreshold`.
  4. Triggers AI trend analysis with cooldown throttling (`AI_COOLDOWN_HOURS = 12`).
  5. Inserts an `Alert` with `@unique` constraint on `dedupeKey` to ensure idempotency.

---

## 5. API Reference & Contract Matrix

All endpoints are mounted with both `/api/` (matching frontend `VITE_API_BASE_URL`) and direct paths:

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | Public | Any | Sign in with email/password; returns `{ token, user }` |
| `POST` | `/api/auth/register-doctor` | Public | Any | Register a new physician account & clinic profile |
| `GET` | `/api/auth/me` | Bearer | Any | Hydrate current user profile |
| `POST` | `/api/auth/logout` | Optional | Any | Stateless session invalidation |
| `GET` | `/api/patients/:id/dashboard` | Bearer | Owner / Doc | Aggregated dashboard, 7-day metric deltas, sparkline |
| `POST` | `/api/patients/:id/vitals` | Bearer | Owner / Doc | Submit vital readings & emit Kafka event |
| `GET` | `/api/patients/:id/vitals` | Bearer | Owner / Doc | Trend queries (`range=7d\|30d\|90d`, `filter=bp\|glucose...`) |
| `GET` | `/api/patients/:id/vitals/log` | Bearer | Owner / Doc | Paginated raw vitals log table (`page`, `pageSize`) |
| `GET` | `/api/patients/:id/profile` | Bearer | Owner / Doc | Fetch patient demographics, conditions & doctor info |
| `PATCH` | `/api/patients/:id/profile` | Bearer | Owner / Doc | Update phone, gender, name |
| `GET` | `/api/patients/:id/summaries` | Bearer | Owner / Doc | Fetch AI weekly summaries |
| `GET` | `/api/patients/:id/alerts/history` | Bearer | Owner / Doc | Fetch patient alert history |
| `GET` | `/api/doctor/overview` | Bearer | DOCTOR | Doctor dashboard KPI counts, urgent alert queue, roster |
| `GET` | `/api/doctor/patients` | Bearer | DOCTOR | Filtered roster (`search=`, `filter=all\|critical\|needs_review`) |
| `GET` | `/api/doctor/patients/:id` | Bearer | DOCTOR | Deep-dive patient telemetry, Gemini narrative, history |
| `GET` | `/api/doctor/patients/:id/thresholds` | Bearer | DOCTOR | Get patient threshold configuration |
| `PUT` | `/api/doctor/patients/:id/thresholds` | Bearer | DOCTOR | Upsert patient threshold configuration |
| `GET` | `/api/alerts` | Bearer | DOCTOR | Alert management feed (`status=`, `type=`) |
| `PATCH` | `/api/alerts/:id` | Bearer | DOCTOR | Update alert status (`acknowledged`, `resolved`) & note |
| `POST` | `/api/alerts/:id/follow-up` | Bearer | DOCTOR | Trigger patient reminder / follow-up action |

---

## 6. Environment Configurations

### Backend (`backend/.env`)
```env
PORT=4000
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres"
JWT_SECRET="your-jwt-secret-or-supabase-jwt-secret"

# Optional Supabase Auth integration:
SUPABASE_URL="https://[PROJECT_ID].supabase.co"
SUPABASE_JWT_SECRET="your-supabase-jwt-secret"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-service-role-key"

# Kafka broker:
KAFKA_BROKER=localhost:9092
```

### Insight Worker (`insight-worker/.env`)
```env
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_ID].supabase.co:6543/postgres?pgbouncer=true"
KAFKA_BROKER="localhost:9092"
KAFKA_TOPIC="vitals.logged"
KAFKA_DLQ_TOPIC="vitals.logged.dlq"
KAFKA_GROUP_ID="healthlens-insight-group"
GEMINI_API_KEY="your-google-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
AI_COOLDOWN_HOURS=12
ENABLE_SCHEDULER="true"
```

### Frontend (`frontend/.env` or `frontend/.env.local`)
```env
# Toggle between local mock generator and live Express API:
VITE_USE_MOCKS=false
VITE_API_BASE_URL=http://localhost:4000/api
```

---

## 7. Local Development Quickstart

Follow these steps to run the complete stack locally:

### 1. Start Local Infrastructure (Kafka)
In root directory:
```bash
docker compose up -d
```
*Spins up Apache Kafka on `localhost:9092`.*

### 2. Seed Database
In `backend/`:
```bash
npm run seed
```
*Seeds default doctor (`doctor@healthlens.demo`) and linked patients (`patient@healthlens.demo`, `aiko@healthlens.demo`, `priya@healthlens.demo`), with hashed passwords `demo1234` and 30 days of baseline readings.*

### 3. Start Backend
In `backend/`:
```bash
npm run dev
```
*Express API starts on `http://localhost:4000`.*

### 4. Start Insight Worker
In `insight-worker/`:
```bash
npm run dev
```
*Worker connects to Kafka topic `vitals.logged` and starts background schedulers.*

### 5. Start Frontend
In `frontend/`:
```bash
npm run dev
```
*Client starts on `http://localhost:5173`.*

---

## 8. Demo Credentials & Test Scenarios

### Demo Credentials
* **Doctor**: `doctor@healthlens.demo` / `demo1234`
* **Patient**: `patient@healthlens.demo` / `demo1234`

### E2E Flow to Verify
1. Sign in as **Patient** (`patient@healthlens.demo`).
2. Navigate to **Log Vitals**, enter readings (e.g. Systolic `175`, Diastolic `105`), and submit.
3. Observe backend log: record saved to PostgreSQL and event published to Kafka `vitals.logged`.
4. Observe insight-worker log: event consumed, rule triggered, threshold breached, and new `Alert` stored in DB.
5. Sign in as **Doctor** (`doctor@healthlens.demo`).
6. Observe **Doctor Dashboard** and **Alert Console**: critical flag appears in real-time, ready for one-click acknowledgment and clinical note entry.

