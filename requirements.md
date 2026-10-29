

Requirements · MD
# HealthLens Requirements
 
**Status key:** `Done` = implemented in code. `Partial` = backend done, frontend not. `Not started` = no code. `Unverified` = code exists but has not been run or tested.
 
HealthLens is a remote patient-monitoring app. Patients log vital signs. A background worker checks those readings against clinical rules and an AI model, and creates alerts. Doctors see their patients, review alerts, and communicate back to patients.
 
---
 
## 1. System overview
 
| Component | Folder | Role | Status |
|---|---|---|---|
| Frontend | `frontend/` | React + Vite UI for patients and doctors | Mostly built. Runs on mock data unless configured otherwise |
| Backend API | `backend/` | Express + TypeScript REST API, Prisma, Kafka producer | Endpoints implemented. Unverified (not run) |
| Insight worker | `insight-worker/` | Consumes `vitals.logged`, applies rules, calls Gemini, creates alerts | Implemented. Unverified (not run) |
| Database | Supabase Postgres | Application data, accessed through Prisma | Schema and migrations exist |
| Auth | Supabase Auth | Passwords, sessions, tokens | Integrated |
| Event bus | Kafka (`docker-compose.yml`) | Carries `vitals.logged` events | Local container defined |
 
**Data flow in one line:** the patient submits a reading, the API saves it and publishes an event, the worker analyses it and writes alerts, and the doctor sees the alerts.
 
---
 
## 2. Roles
 
| Role | Can do | Cannot do |
|---|---|---|
| **Patient** | Log vitals, view own dashboard, trends, and log; view own alert history; view doctor feedback and follow-up instructions | See other patients; see private doctor notes |
| **Doctor** | View own roster; add, edit, and unassign patients; view patient detail; manage thresholds; review and update alerts; write feedback and notes | See patients not assigned to them |
 
Roles are stored in Supabase `app_metadata.role`. Users cannot change their own role. Unrecognised roles default to patient.
 
---
 
## 3. Functional requirements
 
### 3.1 Authentication
 
| ID | Requirement | Status |
|---|---|---|
| A-1 | Users sign in with email and password. The backend verifies credentials with Supabase and returns an access token and refresh token. | Done |
| A-2 | Protected endpoints require `Authorization: Bearer <token>`. Missing or invalid tokens return 401. | Done |
| A-3 | The frontend refreshes expired access tokens once, using the refresh token. If refresh fails, the user is sent to login. | Done (frontend `apiClient.ts`) |
| A-4 | A local `User` row is created on first login for a verified Supabase user. The role comes from `app_metadata` only. | Done |
| A-5 | If an email already exists locally under a different ID, the system refuses to link automatically and returns 403. | Done |
| A-6 | Doctors can self-register. Patients are created by a doctor, who receives a temporary password shown once. | Done |
| A-7 | Logout ends the session in the browser. The server does not revoke tokens. | Done, with known gap (see §6) |
| A-8 | Users can change their password, after verifying the current one. | Done |
 
**Open question:** who links an existing local account to a new Supabase login, and how? The code refuses automatic linking and points to "the seed script or an admin." No admin tool exists.
 
### 3.2 Patient: vitals and dashboard
 
| ID | Requirement | Priority | Status |
|---|---|---|---|
| P-1 | The dashboard shows each metric's latest real reading, with the date it was taken. Missing metrics show "—", never a default value. | P0 | Backend done. Frontend refresh not done |
| P-2 | Patients see their own submitted readings in the Log Vitals tab. The entry form is compact. | P2 | Not started |
| P-3 | Patients see follow-up instructions the doctor has set, with dates and details. | P0 | Backend done (`PatientFeedback`, `GET /patients/:id/feedback`). Frontend not done |
| P-4 | Patients see the doctor's condition-based feedback and notes. This is the broader form of P-3. | P0 | Backend done. Frontend not done |
| P-5 | Patients can log blood pressure, glucose, weight, and sleep. Each reading is saved even if only some fields are filled. | Core | Done (backend). Range validation see §6 |
| P-6 | Patients can view trends over 7, 30, and 90 days. | Core | Done (backend). Frontend unverified |
 
### 3.3 Patient: alerts and feedback visibility
 
| ID | Requirement | Status |
|---|---|---|
| PA-1 | Patients see their alert history. | Done (backend) |
| PA-2 | A doctor's alert note is visible to the patient only when the doctor marks it shared (`noteSharedWithPatient`). | Done |
| PA-3 | Follow-up requests on alerts are visible to the patient with their date and note. | Done (backend). Frontend partial |
 
### 3.4 Doctor: roster and search
 
| ID | Requirement | Priority | Status |
|---|---|---|---|
| D-1 | Search returns correct results for patients (name, email, phone, condition, or exact patient ID) and for alerts. | P1 | Backend patient search done. Frontend search and alert search not done |
| D-2 | Selecting an alert from the notifications bell opens the Alerts tab and highlights that alert. | P3 | Not started |
| D-3 | The patient ID is shown everywhere a patient appears, so the doctor can reference it. | P1 | Not started |
| D-4 | The doctor can add, edit, and unassign patients. Unassigning keeps the patient record. | Core | Done (backend) |
 
### 3.5 Doctor: patient detail and feedback
 
| ID | Requirement | Status |
|---|---|---|
| DP-1 | The patient detail view shows profile, alerts, vitals log, and feedback. | Done (backend). Frontend partial |
| DP-2 | The doctor can write feedback for a patient, optionally tied to one of the patient's conditions. | Done (backend). Frontend not done |
| DP-3 | The doctor can write follow-up instructions with an optional due date. | Done (backend). Frontend not done |
| DP-4 | The doctor can delete feedback they wrote for their own patients. | Done (backend) |
| DP-5 | The doctor can view and change a patient's alert thresholds. | Done (backend). Frontend unverified |
 
### 3.6 Doctor: alerts
 
| ID | Requirement | Status |
|---|---|---|
| AL-1 | The doctor sees a feed of alerts with status filters. | Done (backend) |
| AL-2 | The doctor can update an alert's status and add a clinical note. | Done (backend) |
| AL-3 | The doctor can send a follow-up request for an alert. | Done (backend) |
| AL-4 | Alert creation is idempotent. Reprocessing the same event does not create a duplicate. | Done (worker, `dedupeKey` unique constraint) |
 
### 3.7 Clinical intelligence (insight worker)
 
| ID | Requirement | Status |
|---|---|---|
| W-1 | Each `vitals.logged` event is checked against the patient's thresholds. Missing threshold rows fall back to standard defaults. | Done. Unverified |
| W-2 | Trend analysis looks at recent readings for sustained changes. | Done. Unverified |
| W-3 | Gemini is called for pattern analysis only when the trend check flags the patient and a cooldown has passed. | Done. Cooldown window to confirm |
| W-4 | The worker writes a `PatientInsight` record and recomputes the patient's risk status. | Done. Unverified |
| W-5 | Weekly summaries are generated on a schedule. | Done. Unverified |
| W-6 | If Gemini fails, the rule-based alert is still written. | To confirm |
| W-7 | Failed events are routed to a dead-letter topic. | Open. Retry policy not decided |
 
---
 
## 4. API contract
 
The frontend expects these shapes. The authoritative types are in `frontend/src/types/index.ts`.
 
All routes are mounted under `/api` (for example `/api/patients/...`). Root-level mounts exist as a fallback. **Decision:** remove the root-level mounts once the frontend is confirmed to use `/api` only, since they can collide with other services on the same host.
 
### Auth
 
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | No | Sign in, returns tokens and user |
| POST | `/api/auth/refresh` | No | Exchange refresh token |
| POST | `/api/auth/register-doctor` | No | Doctor self-registration |
| POST | `/api/auth/logout` | No | Acknowledges logout (no server action) |
| GET | `/api/auth/me` | Yes | Current user |
| PATCH | `/api/auth/password` | Yes | Change password |
 
### Patient (patient or assigned doctor)
 
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/patients/:id/dashboard` | Latest metric per type, week-over-week change, recent alerts, sparkline |
| POST | `/api/patients/:id/vitals` | Save a reading, publish event, return 201 |
| GET | `/api/patients/:id/vitals?range=7d\|30d\|90d` | Trend data |
| GET | `/api/patients/:id/vitals/log` | Paginated raw log |
| GET | `/api/patients/:id/feedback` | Doctor feedback and instructions, newest first |
| GET | `/api/patients/:id/alerts/history` | Alert history, filtered for the viewer |
| GET | `/api/patients/:id/summaries` | Weekly AI summaries |
| GET / PATCH | `/api/patients/:id/profile` | Profile |
 
`:id` may be a patient ID, a user ID, or the literal `me`.
 
### Doctor
 
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/doctor/overview` | Stats, urgent alerts, roster |
| GET | `/api/doctor/patients?search=&filter=` | Filtered roster. Search matches name, email, phone, condition, or patient ID |
| POST | `/api/doctor/patients` | Create patient and login |
| GET | `/api/doctor/patients/:id` | Patient detail (profile, alerts, vitals log, feedback) |
| PATCH | `/api/doctor/patients/:id` | Update patient |
| DELETE | `/api/doctor/patients/:id` | Unassign (keeps record) |
| GET / PUT | `/api/doctor/patients/:id/thresholds` | Read or update thresholds |
| POST | `/api/doctor/patients/:id/feedback` | Create feedback or instruction |
| DELETE | `/api/doctor/feedback/:fid` | Delete feedback |
| GET / PATCH | `/api/doctor/profile` | Doctor profile |
 
### Alerts
 
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/alerts` | Alert feed |
| PATCH | `/api/alerts/:id` | Update status and/or note and sharing |
| POST | `/api/alerts/:id/follow-up` | Request follow-up |
 
### Errors
 
Every non-2xx response has the body `{ "message": "..." }`. Status codes:
 
| Code | Meaning |
|---|---|
| 400 | Invalid input |
| 401 | Missing or invalid token |
| 403 | Authenticated but not allowed (for example, a patient requesting another patient's data) |
| 404 | Not found. Doctor routes also use this for patients outside their roster, so existence is not revealed |
| 409 | Conflict (for example, email already registered) |
| 503 | Auth service unavailable, retry |
| 500 | Internal error. Message is hidden |
 
---
 
## 5. Event contract
 
**Topic:** `vitals.logged`
**Key:** `patientId` (keeps one patient's readings in order within a partition)
**Value:**
 
```json
{
  "vitalId": "string",
  "patientId": "string",
  "recordedAt": "ISO 8601 timestamp"
}
```
 
The event is a claim-check: it carries identifiers only. The worker loads the reading and related data from the database.
 
**Publish failure:** the reading is still saved and the API still returns 201. A failed publish is logged and the reading is not analysed until something re-drives it. A catch-up sweep is optional and not built.
 
---
 
## 6. Non-functional requirements
 
### Security
 
| ID | Requirement | Status |
|---|---|---|
| S-1 | Patients can only access their own records. Doctors only access their assigned patients. | Done |
| S-2 | Role is trusted only from `app_metadata`. | Done |
| S-3 | Service-role key is server-only. | Done |
| S-4 | Row Level Security is enabled on all tables, with no policies. Prisma connects as table owner and is unaffected. Direct Supabase client access is blocked. | Done (`extras.sql`). Confirm intended |
| S-5 | Logout revokes server-side sessions. | Not done. Tokens remain valid until expiry |
| S-6 | Vitals values are range-checked in the API. | Not done. Database CHECK constraints in `extras.sql` are the only check, and they require that script to be applied |
| S-7 | Patient-side vitals submission is limited to the patient. Assigned doctors can currently also submit. | Decision needed |
 
### Data integrity
 
| ID | Requirement | Status |
|---|---|---|
| I-1 | Vitals validation is enforced by database CHECK constraints, so every writer is covered. | Defined in `extras.sql`. Must be applied manually. Verify |
| I-2 | A `PatientThreshold` row is optional. Absence means defaults apply. | Done |
| I-3 | Alerts are unique per `dedupeKey`. | Done |
| I-4 | Deleting a patient cascades to their vitals, alerts, insights, and feedback. Deleting a condition sets feedback's condition to null. | Done (schema) |
 
### Reliability
 
| ID | Requirement | Status |
|---|---|---|
| R-1 | A Kafka outage does not fail a reading submission. | Done |
| R-2 | Kafka producer connects lazily and fails fast (2 s connection timeout). | Done |
| R-3 | Auth errors from Supabase return 503 (retryable), not 401. | Done |
| R-4 | Async route handlers pass errors to the error handler. | Done |
 
### Performance
 
| ID | Requirement | Status |
|---|---|---|
| F-1 | Dashboard makes a bounded number of queries regardless of history length. | Done |
| F-2 | Token verification adds one Supabase call per request. | Known cost. Consider caching |
 
### Testing
 
| ID | Requirement | Status |
|---|---|---|
| T-1 | `app.ts` exports `createApp()` so tests can build the app without starting a server. | Done |
| T-2 | Automated tests (Vitest + supertest) cover auth, access control, and the dashboard. | Not started |
 
---
 
## 7. Configuration
 
**Backend (`backend/.env`):** `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT` (default 4000), `KAFKA_BROKER` (default `localhost:9092`).
 
**Frontend (`frontend/.env`):** `VITE_USE_MOCKS` (`true` uses mock data), `VITE_API_BASE_URL` (for example `http://localhost:4000/api`).
 
**Worker:** `DATABASE_URL`, `KAFKA_BROKER`, Gemini API key.
 
**Note:** `instruction.md` says the backend runs on port 3000. The code defaults to 4000. Use one value and update `VITE_API_BASE_URL` to match.
 
**Remove:** `JWT_SECRET` and `SUPABASE_JWT_SECRET` from `.env.example`. Nothing reads them.
 
---
 
## 8. Known gaps and open decisions
 
| # | Item | Decision needed |
|---|---|---|
| 1 | Who links existing local accounts to Supabase logins | Admin tool or seed-only process |
| 2 | Root-level route mounts | Remove (agreed, if frontend uses `/api` only) |
| 3 | Doctor submitting patient vitals | Allow, or restrict to patient |
| 4 | Server-side logout | Implement Supabase sign-out in the logout route |
| 5 | Dead-letter topic retry policy | Define retry count and DLQ handling |
| 6 | Catch-up sweep for unpublished events | Build or accept the gap |
| 7 | Vitals range validation in API | Add to route, matching DB constraints |
| 8 | Seed and reset scripts write bcrypt hashes that login never reads | Remove or align with Supabase |
| 9 | Dead file `middleware/requireRole.ts` imports missing `lib/jwt.ts` | Delete |
| 10 | `.gitkeep` placeholders in folders that now have code | Delete |
| 11 | Empty `modules/vitals/` and `modules/summaries/` folders | Delete (vitals routes live in `patients/`) |
| 12 | Insight-worker copy of schema | Sync with `sync-schema.js` after every schema change |
 
---
 
## 9. Out of scope (for now)
 
- Real-time push to the browser (the frontend polls on page load)
- Clinician-to-clinician messaging
- Native mobile apps
- Multi-clinic tenancy beyond the existing `clinicName` field
- Wearable device integration
---
 
## 10. Frontend work remaining
 
| Item | Depends on |
|---|---|
| Patient dashboard reads and displays new metrics; refresh on focus | P-1 backend (done) |
| Log Vitals shows submitted readings; compact form | P-2 |
| Patient feedback and instructions section | P-3, P-4 backend (done) |
| Doctor feedback form on patient detail | DP-2, DP-3 backend (done) |
| Doctor header search and alert search | D-1 backend (done) |
| Alert highlight from notifications bell | D-2 |
| Patient ID shown on all doctor-side patient views | D-3 |
| Remove mock fallback logic from service layer | After end-to-end testing |
 
Claude’s response was interrupted.
