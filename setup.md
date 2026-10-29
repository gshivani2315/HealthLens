# HealthLens — Developer Setup Guide

> Last updated: October 2026  
> Covers the multi-clinic / multi-doctor schema introduced in the October 2026 architectural update.

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org) |
| npm | 10+ | bundled with Node |
| PostgreSQL client (`psql`) | any | optional, for manual SQL inspection |
| Supabase account | — | [supabase.com](https://supabase.com) — free tier is enough |

---

## Repository layout

```
HealthLens/
├── backend/            # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma          # Single source of truth for the DB schema
│   │   ├── seed.ts                # Original base seed (legacy, kept for reference)
│   │   ├── seed-full.ts           # ✅ Full self-contained seed — use this
│   │   └── migrations/
│   │       └── 20261029190000_multi_clinic_multi_doctor/
│   │           └── migration.sql  # Idempotent schema migration + data backfill
│   ├── scripts/
│   │   └── migrate-db.ts          # One-shot migration runner (safe to re-run)
│   └── src/
│       ├── db/
│       │   └── migrateData.ts     # Runtime legacy-data sync (runs on server boot)
│       └── middleware/
│           └── accessGuard.ts     # Single access-guard — all doctor↔patient checks live here
├── frontend/           # React + Vite
├── insight-worker/     # Gemini AI background worker
├── changes.md          # Full architectural change log
└── setup.md            # ← you are here
```

---

## Step 1 — Clone & install

```bash
git clone <repo-url> HealthLens
cd HealthLens

# Install all three packages
cd backend        && npm install && cd ..
cd frontend       && npm install && cd ..
cd insight-worker && npm install && cd ..
```

---

## Step 2 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Choose a region close to you and set a strong database password.
3. Once provisioned, open **Project Settings → Database**.
4. Copy both connection strings:
   - **Connection pooling** URL (port `6543`) → used as `DATABASE_URL`
   - **Direct connection** URL (port `5432`) → used as `DIRECT_URL`

> **Why two URLs?**  
> Prisma uses the pooled URL for all runtime queries (via PgBouncer) and the direct URL for migrations, which require a real session connection.

---

## Step 4 — Apply the database schema

Run from the `backend/` directory:

```bash
cd backend

# 1. Push the Prisma schema to your Supabase database
#    (creates all tables, enums, and indexes)
npx prisma db push

# 2. Generate the Prisma client from the schema
npx prisma generate

# 3. Run the migration + data-backfill script
#    (idempotent — safe if the tables already exist)
npm run db:migrate
```

> **What `db:migrate` does**  
> Executes `migration.sql` statement by statement — every statement uses `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`. Then runs `syncLegacyAssignments()` to backfill any Clinic → ClinicMember → CareAssignment rows from legacy `doctorId` / `clinicName` columns. **No existing data is ever deleted.**

---

## Step 5 — Seed demo data

```bash
# Still inside backend/
npm run db:seed-full
```

This is a **fully self-contained seed** — it does not depend on any previous seed having run first. Re-running is safe (uses upsert everywhere).

### What it creates

| Table | Records |
|---|---|
| Doctor | Dr. Elena Ruiz, Dr. James Okafor |
| Patient | Marcus Bell, Aiko Tanaka, Priya Nair |
| Clinic | Meridian Family Health · Okafor Cardiology Centre · Austin Multi-Specialty |
| ClinicMember | 4 links |
| CareAssignment | 5 (including 1 historical ENDED) |
| Vital | 90 rows — 30 days × 3 patients, including `heartRate` |
| WeeklySummary | 12 rows — 4 weeks × 3 patients |
| Alert | 3 (UNREAD + ACKNOWLEDGED) |
| Notification | 5 |
| Message | 5 (two chat threads) |
| PatientInsight | 3 AI assessments |
| CareInvite | 3 invite codes |

---

## Step 6 — Start all services

Open three terminals:

```bash
# Terminal 1 — API
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev

# Terminal 3 — AI insight worker (optional)
cd insight-worker && npm run dev
```

| Service | URL |
|---|---|
| API | http://localhost:3001 |
| Frontend | http://localhost:5173 |
| Prisma Studio (DB browser) | run `npx prisma studio` from `backend/` → http://localhost:5555 |

---

## How invite codes work

A doctor generates a **CareInvite** code from their dashboard. They share it with a patient out-of-band (SMS, email, etc.). The patient enters the code during self-registration or from their Profile → "Connect to a Doctor" card. The system:

1. Validates the code (not expired, not already used, email matches if restricted).
2. Creates an `ACTIVE CareAssignment` linking the patient to the doctor at their clinic.
3. Marks the invite `ACCEPTED`.
4. Sends an in-app notification to both parties.

**Seeded invite codes:**

| Code | Doctor | Specialty | Email restriction | Valid for |
|---|---|---|---|---|
| `HL-RUIZ-OPEN` | Dr. Elena Ruiz | Primary Care | None (any patient) | 30 days |
| `HL-OKFR-2024` | Dr. James Okafor | Cardiology | `newpatient@example.com` only | 7 days |

To use: log in as a patient → Profile → "Connect to a Doctor" → enter code.  
To generate: log in as a doctor → Dashboard → "Issue Invite Code".

---

## Access control overview

Every doctor, patient, and alert route passes through a **single guard function**:

```ts
// backend/src/middleware/accessGuard.ts
hasActiveCareAssignment(doctorId, patientId): Promise<boolean>
```

- A doctor can access a patient **only if** an `ACTIVE CareAssignment` exists between them.
- Clinic membership alone grants nothing — two doctors in the same clinic cannot see each other's patients without an explicit assignment.
- This is the **only place this rule lives**, so it can never drift across routes.

---

## npm scripts reference (run from `backend/`)

| Script | What it does |
|---|---|
| `npm run dev` | Start API in watch mode |
| `npm run build` | Compile TypeScript to `dist/` |
| `npx prisma db push` | Push schema to DB (no migration history file) |
| `npx prisma generate` | Regenerate Prisma client types |
| `npx prisma studio` | Open visual DB browser at localhost:5555 |
| `npm run db:migrate` | Apply migration SQL + backfill legacy data |
| `npm run db:seed-full` | ✅ Seed all demo data (self-contained, use this) |
| `npm run db:seed-new` | Seed new-schema tables only (requires base seed) |
| `npm run seed` | Original base seed (legacy) |

---

## Troubleshooting

**`P1001: Can't reach database server`**  
→ Check `DATABASE_URL` and `DIRECT_URL` in `backend/.env`. For migrations, `DIRECT_URL` must point to port `5432`, not the pooled `6543`.

**`Environment variable not found: DATABASE_URL`**  
→ Ensure `backend/.env` exists. Seeds import `dotenv/config` at the top — make sure you're running from the `backend/` directory.

**Prisma client out of date after a schema change**  
→ Run `npx prisma generate` from `backend/`.

**`Base seed data not found` when running `db:seed-new`**  
→ Use `npm run db:seed-full` instead — it is fully self-contained.

**`duplicate key value violates unique constraint`**  
→ All seeds use upsert / `skipDuplicates: true`. If you still hit this, your DB may have stale rows with different IDs. On a fresh project only, you can reset with `npx prisma db push --force-reset` (⚠️ wipes all data) and re-seed.

