# HealthLens — Architectural & Feature Enhancement Log

This document provides a comprehensive record of all changes made across the HealthLens repository to support multiple clinics, multiple doctors per patient, patient self-registration with invite codes, database-backed notifications with email alerts, clinical chat per care assignment, end-to-end heart rate tracking, weekly scheduler manual triggers, and updated architecture documentation.

---

## 1. Multiple Clinics & Multiple Doctors per Patient

### Design Rule (updated Oct 2026)
- **One doctor belongs to exactly one clinic.** A doctor registers under a clinic and that clinic is fixed to their profile via `Doctor.clinicId`.
- **One patient can have many doctors**, each from any clinic, via `CareAssignment`.
- The previous many-to-many `ClinicMember` join table has been **removed**. It allowed a doctor to belong to multiple clinics, which does not reflect real-world clinical structure.

### Schema & Data Models
- **`Clinic`**:
  - Independent entity with fields: `id`, `name`, `phone`, `address`, `createdAt`, `updatedAt`.
  - Back-relation: `doctors Doctor[]` — a clinic can have many doctors, each doctor has exactly one clinic.
  - Relations to `CareAssignment` and `CareInvite`.
- **`Doctor`** (updated):
  - New field: `clinicId String?` — FK to `Clinic`. The single clinic this doctor belongs to.
  - Removed: `clinicMemberships ClinicMember[]` relation.
  - Legacy `clinicName String?` column preserved for backward compatibility.
- **`ClinicMember`** (removed):
  - The many-to-many join table between `Doctor` and `Clinic` has been dropped in favour of the direct `Doctor.clinicId` foreign key.
- **`CareAssignment`**:
  - Links a `Patient` to a `Doctor` through a `Clinic` with a specialty label (e.g. "Cardiology", "Primary Care") and status (`AssignmentStatus`: `PENDING`, `ACTIVE`, `ENDED`).
  - Fields: `id`, `patientId`, `doctorId`, `clinicId`, `specialty`, `status`, `assignedAt`, `endedAt`, `createdAt`, `updatedAt`.
  - Replaces single `Patient.doctorId` assignment while retaining backward compatibility during migration.
  - One patient can have multiple active doctors across different specialties; one doctor can manage multiple patients.
- **Enums**:
  - `AssignmentStatus` (`PENDING`, `ACTIVE`, `ENDED`).

### Single Access Rule Guard
- **File**: `backend/src/middleware/accessGuard.ts`
- **Single Source of Truth**:
  - `hasActiveCareAssignment(doctorId, patientId): Promise<boolean>`
  - A doctor can access a patient **if and only if** an `ACTIVE` `CareAssignment` exists between them.
  - Clinic membership alone grants **zero** patient access; doctors in the same clinic cannot view each other's patients without an active assignment.
  - Provides `verifyDoctorPatientAccess(doctorId, patientId)` and `getActivePatientIdsForDoctor(doctorId)`.
- **Enforced Across Every Route**:
  - **Doctor Routes (`doctor.routes.ts`)**:
    - `GET /doctor/overview` & `GET /doctor/patients`: scopes patient roster to active `CareAssignment`s.
    - `GET /doctor/patients/:id`: guards profile, vitals, insight, and alert access via `verifyDoctorPatientAccess`.
    - `PATCH /doctor/patients/:id`: updates allowed only for actively assigned doctor.
    - `DELETE /doctor/patients/:id`: ends the active `CareAssignment` (`status = 'ENDED'`, `endedAt = now()`), leaving other doctors and patient account intact.
    - `GET /doctor/patients/:id/thresholds` & `PUT /doctor/patients/:id/thresholds`: verifies active assignment before reading/modifying.
  - **Patient Routes (`patients.routes.ts`)**:
    - `resolvePatientWithAuth`: calls `hasActiveCareAssignment(doctor.id, patient.id)` as the unified authorization gate for all `/patients/:id/*` routes.
  - **Alert Routes (`alerts.routes.ts`)**:
    - `GET /alerts`: queries alerts only for patients with an active assignment to the calling doctor.
    - `PATCH /alerts/:id` & `POST /alerts/:id/follow-up`: enforces `hasActiveCareAssignment` before permitting status transitions or notes.

### Shared Alerts & Shared Thresholds
- **Alerts**:
  - Shared across all active doctors caring for the patient.
  - Status is shared (`UNREAD`, `ACKNOWLEDGED`, `RESOLVED`).
  - `acknowledgedById` records which doctor acknowledged the alert.
- **Thresholds**:
  - One shared set of alert thresholds per patient (`PatientThreshold`).
  - Any doctor with an active care assignment can view and configure the thresholds.

### Migration & Data Continuity
- **Migration SQL**: `backend/prisma/migrations/20261029190000_multi_clinic_multi_doctor/migration.sql`
  - Creates enums and tables (`Clinic`, `ClinicMember`, `CareAssignment`, `CareInvite`, `Notification`, `Message`).
  - Idempotently creates a `Clinic` row per existing doctor from `clinicName`.
  - Creates `ClinicMember` linking each doctor to their clinic.
  - Creates an `ACTIVE` `CareAssignment` per patient from existing `doctorId` and `doctorAssignedAt`.
  - Preserves legacy columns (`Patient.doctorId`, `Doctor.clinicName`) to avoid breaking existing data.
- **Runtime Data Synchronizer**: `backend/src/db/migrateData.ts`
  - `syncLegacyAssignments()` runs safely during backend startup (`server.ts`) to ensure existing databases are synced seamlessly.

---

## 2. Patient Self-Registration & Care Invites

### Schema & Data Models
- **`CareInvite`**:
  - Fields: `id`, `code` (unique, e.g. `HL-8F2A-9C4B`), `doctorId`, `clinicId`, `specialty`, `patientEmail` (optional restriction), `status` (`PENDING`, `ACCEPTED`, `EXPIRED`, `CANCELLED`), `expiresAt`, `createdAt`, `updatedAt`.

### Backend Implementation
- **File**: `backend/src/modules/invites/invite.service.ts` & `invite.routes.ts`
  - `createCareInvite`: generates unique invite code with expiration.
  - `getDoctorInvites`: lists invites issued by a doctor.
  - `acceptCareInvite`: verifies code validity, email match (if restricted), creates or reactivates an `ACTIVE` `CareAssignment`, marks invite `ACCEPTED`, and creates notifications for both doctor and patient.
  - `GET /api/invites/info/:code`: public preview endpoint.
  - `POST /api/invites`: doctor generates code.
  - `POST /api/invites/accept`: patient links with code.
- **Patient Self-Registration Endpoint**:
  - `POST /api/auth/register-patient`:
    - Creates Supabase login with role `PATIENT`.
    - Creates `User` and `Patient` DB records.
    - If `inviteCode` is provided, automatically links patient to the doctor via `acceptCareInvite`.
    - Signs in and returns JWT access token, refresh token, and user profile.

### Frontend Implementation
- **`LoginPage.tsx`**:
  - Added role switcher for self-registration: "Patient" vs "Physician / Clinic".
  - Patient self-registration form collects name, email, password, phone, DOB, gender, and optional Doctor Invite Code.
- **`Profile.tsx` (Patient)**:
  - "Connect to a Doctor" card allows existing patients to enter doctor invite codes anytime to establish care assignments.
  - Displays full active Care Team (all linked doctors, specialties, and clinics).
- **`Dashboard.tsx` (Doctor)**:
  - Added "🎟️ Issue Invite Code" modal allowing doctors to specify specialty and patient email to generate an invite code with one-click copy.

---

## 3. Database-Backed Notifications & Critical Alerts Email

### Schema & Data Models
- **`Notification`**:
  - Fields: `id`, `userId`, `title`, `message`, `type` (`CRITICAL_ALERT`, `VISIT_REQUEST`, `SYSTEM`, `CHAT`, `CARE_ASSIGNMENT`), `read` (Boolean default false), `link`, `metadata` (Json), `createdAt`, `updatedAt`.
  - Indexes on `[userId, read]` and `[userId, createdAt DESC]`.

### Backend Implementation
- **File**: `backend/src/modules/notifications/notification.service.ts` & `notification.routes.ts`
  - `createNotification`: persists in DB and automatically sends email for `CRITICAL_ALERT` and `VISIT_REQUEST`.
  - `notifyActiveDoctorsForPatient`: dispatches notifications and emails to **all** active doctors caring for the patient.
  - `GET /api/notifications`: returns paginated notifications and `unreadCount`.
  - `PATCH /api/notifications/:id/read`: marks notification as read.
  - `POST /api/notifications/read-all`: marks all user notifications as read.
- **Critical Alert Triggering**:
  - In `insight-worker/src/services/alerts.ts`, when a `CRITICAL` alert is generated, notifications and emails are sent to every active doctor on the patient.
  - In `alerts.routes.ts`, when a follow-up visit is requested (`POST /alerts/:id/follow-up`), a `VISIT_REQUEST` notification and email are dispatched to the patient.

### Frontend Implementation
- **`NotificationBell.tsx`**:
  - Connected directly to `notificationsService.getNotifications()`.
  - Displays live unread count badge with pulsing indicator.
  - Notification dropdown shows title, timestamp (`timeAgo`), message, severity color-coded dot, direct link, and "Mark all read" button.
  - Polls every 30 seconds for real-time updates.

---

## 4. Clinical Chat Scoped to Care Assignments

### Schema & Data Models
- **`Message`**:
  - Fields: `id`, `assignmentId`, `senderId`, `content`, `read` (Boolean default false), `createdAt`, `updatedAt`.
  - Scoped strictly to `CareAssignment`.

### Lifecycle & Access Boundary
- **Access Policy**:
  - A chat thread is 1-to-1 with a `CareAssignment`.
  - Reading messages is allowed for the assigned patient and assigned doctor.
  - Sending messages is permitted **only while `CareAssignment.status === 'ACTIVE'`**.
  - When the care assignment ends (`ENDED`), the thread is locked ("so it ends when access ends").

### Backend Implementation
- **File**: `backend/src/modules/chat/chat.service.ts` & `chat.routes.ts`
  - `GET /api/chat/assignments`: returns active and ended threads for the user with latest message snippet and other party details.
  - `GET /api/chat/assignments/:assignmentId/messages`: returns message history and marks incoming messages as read.
  - `POST /api/chat/assignments/:assignmentId/messages`: validates assignment is `ACTIVE`, stores message, and creates `CHAT` notification for the recipient.

### Frontend Implementation
- **File**: `frontend/src/pages/ChatPage.tsx`
  - Two-pane clinical messenger: thread list on left, active conversation on right.
  - Status pill (`Active` vs `Ended`).
  - Read-only banner and disabled inputs if care assignment has ended.
  - Auto-scroll to bottom, timestamps, sender badges, and 5-second polling.
- **Navigation**:
  - Mounted at `/doctor/chat` and `/patient/chat`.
  - Added "Messages" nav item with chat icon to `DoctorLayout` and `PatientLayout`.

---

## 5. Heart Rate Telemetry End-to-End

### Telemetry Pipeline & APIs
- **Database**:
  - `Vital.heartRate` (`Int?`, bpm) in telemetry schema.
  - `PatientThreshold.heartRateMax` (default 120 bpm) and `PatientThreshold.heartRateMin` (default 50 bpm) for tachycardia and bradycardia thresholds.
- **Backend API (`patients.routes.ts` & `doctor.routes.ts`)**:
  - `POST /api/patients/:id/vitals`: accepts `heartRate`, validates (30–250 bpm), saves to DB, emits Kafka event, and returns it.
  - `GET /api/patients/:id/vitals`: includes `heartRate` in points array and computes stats (`average`, `peak`, `lowest`).
  - `GET /api/patients/:id/vitals/log`: includes `heartRate` on each log row.
  - `GET /api/patients/:id/dashboard`: computes `metrics.heartRate` and includes heart rate in sparkline.
  - `POST /api/doctor/patients`: parses `initialHeartRate` baseline reading.
  - `GET /api/doctor/patients/:id/thresholds` & `PUT /api/doctor/patients/:id/thresholds`: exposes and updates `heartRateMax` and `heartRateMin`.
- **Insight Worker (`insight-worker/src/rules/thresholds.ts`)**:
  - Evaluates heart rate thresholds on every vital logged.
  - Fires `HEART_RATE_HIGH` (`CRITICAL`) if `heartRate > heartRateMax`.
  - Fires `HEART_RATE_LOW` (`CRITICAL`) if `heartRate < heartRateMin`.

### Frontend UI
- **`LogVitals.tsx`**: Added "Resting Heart Rate (bpm)" input field.
- **`Dashboard.tsx` (Patient)**: Added Heart Rate metric card in Vitals Overview (`♥`, bpm).
- **`PatientDetail.tsx` (Doctor)**: Added "Heart Rate" column to the Raw Vitals Log table (`{bpm} bpm` or `—`).
- **`Dashboard.tsx` (Doctor)**: Added "Heart Rate" column to the patient roster table and baseline input in Add Patient modal.
- **`Thresholds.tsx` (Doctor)**: Added Heart Rate low/high limit inputs with validation.

---

## 6. Weekly Scheduler & Manual Triggers

### Cron Verification
- **File**: `insight-worker/src/config.ts` & `insight-worker/src/schedulers/index.ts`
- Verified cron expression:
  - `WEEKLY_CRON`: `"0 8 * * 1"`
  - Meaning: Minute `0`, Hour `8` (8:00 AM), every day of month (`*`), every month (`*`), Day of week `1` (Monday).
  - Timezone: `config.SCHEDULER_TZ` (`Asia/Kolkata`).
  - Standard 5-field cron syntax supported by `node-cron`.

### Manual Triggers
- **Backend API**:
  - `POST /api/doctor/patients/:id/generate-summary`: triggers immediate weekly clinical summary generation for a patient.
- **Frontend Action**:
  - Added "⚡ Run AI Summary" button directly on doctor's `PatientDetail.tsx` page for on-demand summary generation without waiting for Monday.
- **CLI & Worker Script**:
  - `insight-worker/src/scripts/runWeeklySummary.ts`: manual trigger via `npm run test:summary` (all patients) or `npm run test:summary -- <patientId>`.
  - Exported `triggerManualWeeklySummary(patientId?)` in `insight-worker/src/schedulers/index.ts`.

---

## 7. Token Refresh & Architecture Reference

- **Token Refresh Verification**:
  - Verified `frontend/src/services/apiClient.ts` silent single-flight token refresh logic upon receiving `401 Unauthorized`.
  - Verified `AuthContext.tsx` token persistence in `localStorage` (`TOKEN_STORAGE_KEY` and `REFRESH_TOKEN_STORAGE_KEY`) and `SESSION_EXPIRED_EVENT` handling.
- **`handoff.md` Updates**:
  - Updated Section 7 (Database Schema) with new Mermaid ERD reflecting `Clinic`, `ClinicMember`, `CareAssignment`, `CareInvite`, `Notification`, and `Message`.
  - Updated Section 8 (Authentication Flow) with a new Mermaid sequence diagram detailing the 3-phase flow: initial login, protected calls, and silent token refresh on 401 with token rotation.
  - Documented multi-clinic access rules, shared alert models, and care assignment scoping.

---

## 8. Summary of Created & Modified Files

### Backend
- `backend/prisma/schema.prisma` *(updated)*
- `backend/prisma/migrations/20261029190000_multi_clinic_multi_doctor/migration.sql` *(created)*
- `backend/src/db/index.ts` *(updated with extended types)*
- `backend/src/db/migrateData.ts` *(created)*
- `backend/src/middleware/accessGuard.ts` *(created — single access rule guard)*
- `backend/src/modules/auth/auth.service.ts` *(updated with `registerPatient`)*
- `backend/src/modules/auth/auth.routes.ts` *(updated with `/register-patient` & multi-clinic profile)*
- `backend/src/modules/doctor/doctor.routes.ts` *(updated with care assignments, clinics, heart rate, access guard, manual summary)*
- `backend/src/modules/patients/patients.routes.ts` *(updated with access guard, heart rate, multi-doctor profile)*
- `backend/src/modules/alerts/alerts.routes.ts` *(updated with access guard & visit request notifications)*
- `backend/src/modules/notifications/notification.service.ts` *(created)*
- `backend/src/modules/notifications/notification.routes.ts` *(created)*
- `backend/src/modules/chat/chat.service.ts` *(created)*
- `backend/src/modules/chat/chat.routes.ts` *(created)*
- `backend/src/modules/invites/invite.service.ts` *(created)*
- `backend/src/modules/invites/invite.routes.ts` *(created)*
- `backend/src/app.ts` *(updated with new routes)*
- `backend/src/server.ts` *(updated with startup migration sync)*

### Insight Worker
- `insight-worker/prisma/schema.prisma` *(updated)*
- `insight-worker/src/rules/constants.ts` *(updated with heart rate defaults)*
- `insight-worker/src/rules/thresholds.ts` *(updated with heart rate evaluation)*
- `insight-worker/src/services/alerts.ts` *(updated with multi-doctor critical notifications)*
- `insight-worker/src/schedulers/index.ts` *(updated with cron verification & programmatic trigger)*

### Frontend
- `frontend/src/types/index.ts` *(updated with Clinic, CareAssignment, CareInvite, Notification, Message, Heart Rate)*
- `frontend/src/services/authService.ts` *(updated with `registerPatient`)*
- `frontend/src/context/AuthContext.tsx` *(updated with `registerPatient`)*
- `frontend/src/services/vitalsService.ts` *(updated with heart rate support)*
- `frontend/src/services/patientsService.ts` *(updated with clinics, invites, manual summary trigger)*
- `frontend/src/services/notificationsService.ts` *(created)*
- `frontend/src/services/chatService.ts` *(created)*
- `frontend/src/services/mockData.ts` *(updated with heart rate and thresholds)*
- `frontend/src/components/layout/icons.tsx` *(updated with chat icon)*
- `frontend/src/components/layout/DoctorLayout.tsx` *(updated with Messages navigation)*
- `frontend/src/components/layout/PatientLayout.tsx` *(updated with Messages navigation)*
- `frontend/src/components/layout/NotificationBell.tsx` *(updated with database-backed notifications)*
- `frontend/src/pages/LoginPage.tsx` *(updated with patient self-registration and invite code input)*
- `frontend/src/pages/patient/Dashboard.tsx` *(updated with Heart Rate tile and multi-doctor care indicator)*
- `frontend/src/pages/patient/LogVitals.tsx` *(updated with Heart Rate field)*
- `frontend/src/pages/patient/Profile.tsx` *(updated with multi-doctor care team and invite code linker)*
- `frontend/src/pages/doctor/Dashboard.tsx` *(updated with issue invite modal, heart rate in roster & baseline, specialty/clinic columns)*
- `frontend/src/pages/doctor/PatientDetail.tsx` *(updated with Heart Rate raw vitals column, care team display, run AI summary trigger)*
- `frontend/src/pages/doctor/Thresholds.tsx` *(updated with Heart Rate threshold limits)*
- `frontend/src/pages/ChatPage.tsx` *(created clinical messaging page)*
- `frontend/src/App.tsx` *(updated with Chat routes and register/patient route)*

### Documentation
- `handoff.md` *(updated with multi-clinic ERD, token refresh sequence diagram, and architecture)*
- `changes.md` *(created)*


---

## 9. Doctor Search Enhancement, Patient Vitals History View, and Stateful Logout

### 1. Doctor Search Functionality (Search across name, ID, email, condition, phone, clinic)
- **Problem**: The doctor's search input in both the top layout header and the roster table was previously restricted or failing to match against patient IDs, emails, conditions, or clinic specialties. Additionally, submitting the layout search bar (`/doctor/dashboard?q=...`) did not sync with the search input state when navigating.
- **Backend Fix (`backend/src/modules/doctor/doctor.routes.ts`)**:
  - Upgraded `GET /doctor/patients` search filter to query case-insensitively across:
    - Patient Name (`user.name`)
    - Patient ID (`id`)
    - Email (`user.email`)
    - Phone (`phone`)
    - Chronic Conditions (`conditions.some.label`)
- **Frontend Fix (`frontend/src/pages/doctor/Dashboard.tsx` & `patientsService.ts`)**:
  - Added an active `useEffect` syncing URL query param `?q=` with the local `search` state so top-bar searches immediately filter the roster.
  - Enhanced client-side `useMemo` search filter in `Dashboard.tsx` and `patientsService.ts` (`getRoster`) to match across name, ID, email, phone, condition label, care specialty, and clinic name.
  - Displayed the patient ID badge prominently on each roster row under the patient's name (`font-mono text-[11px] text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200`) for quick reference.

### 2. Patient Past Vitals History View
- **Problem**: Patients could log vitals and view aggregated trends, but lacked a paginated tabular view to inspect their historical timestamped readings with exact values.
- **Frontend Enhancement (`frontend/src/pages/patient/Trends.tsx`)**:
  - Added view mode toggle between **"📈 Trends & Charts"** and **"📋 Reading History"**.
  - Built a themed, responsive table displaying all past readings:
    - Recorded At timestamp (`formatDateTime`)
    - Blood pressure (systolic/diastolic in mmHg)
    - Heart rate (bpm)
    - Blood glucose with fasting/post-meal context badges
    - Body weight (kg)
    - Sleep duration (hrs)
  - Integrated with `vitalsService.getVitalsLog(patientId, page, pageSize)` with complete pagination controls (`Previous` / `Next` with page count).
  - Maintained complete styling consistency with the HealthLens design system (`#DDE7DF` header, `text-ink`, `border-line`, `table-row-hover`).

### 3. Stateful Server-Side Logout & Token Revocation
- **Problem**: Logout was purely stateless on the server; `POST /api/auth/logout` returned `{ message: 'Logged out' }` without invalidating the active Bearer token on the server.
- **Backend Implementation (`backend/src/lib/tokenBlacklist.ts`, `auth.ts`, `auth.routes.ts`)**:
  - Created `backend/src/lib/tokenBlacklist.ts` providing an in-memory token revocation blacklist (`revokeToken`, `isTokenRevoked`) with bounded memory management.
  - Updated `requireAuth` in `backend/src/middleware/auth.ts` to reject any incoming Bearer token present in the revocation list with `401 Token has been revoked, please sign in again`.
  - Updated `POST /api/auth/logout` in `backend/src/modules/auth/auth.routes.ts` to extract the caller's Bearer token, add it to the server revocation list, and trigger administrative session termination via `supabaseAdmin.auth.admin.signOut(token)`.
  - Stored token in `req.user.token` during auth middleware execution for downstream auditability.


---

## Session — 2026-10-29: Schema Drift Fix (`clinicMemberships` → `clinic`)

### Problem
`doctor.routes.ts` still referenced the removed `ClinicMember` join table (`clinicMemberships`) in three places after the schema was updated to use a direct `Doctor.clinicId` → `Clinic` relation. This caused a `PrismaClientValidationError` on every authenticated doctor request, crashing the entire doctor portal.

### Root Cause
The schema was changed (removed `ClinicMember`, added `Doctor.clinicId`) but the route file was not fully updated in a previous session. References remained in:
1. `DoctorRecord` TypeScript type definition
2. `router.use` middleware (fetching doctor profile on every request)
3. `buildProfile` helper function
4. `GET /clinics` route (queried `prisma.clinicMember.findMany`)
5. `POST /clinics` route (called `prisma.clinicMember.create`)
6. `POST /patients` route (read `doctor.clinicMemberships?.[0]?.clinicId`)
7. `PATCH /profile` route (read `updated.clinicMemberships?.[0]`)

### Files Changed

#### `backend/src/modules/doctor/doctor.routes.ts` — Full rewrite
- **`DoctorRecord` type**: Changed `clinicMemberships: { include: { clinic: true } }` → `clinic: true`.
- **`router.use` middleware**: Updated `prisma.doctor.findUnique` include to `{ user: true, clinic: true }`.
- **`buildProfile`**: Changed `doctor.clinicMemberships?.[0]?.clinic` → `doctor.clinic` for `primaryClinic`.
- **`GET /clinics`**: Replaced `prisma.clinicMember.findMany` with `prisma.clinic.findUnique({ where: { id: doctor.clinicId } })`. Returns the single doctor clinic as a one-element array.
- **`POST /clinics`**: Replaced `prisma.clinicMember.create` with `prisma.doctor.update({ data: { clinicId, clinicName } })`.
- **`POST /patients`**: Changed `doctor.clinicMemberships?.[0]?.clinicId` → `doctor.clinicId` when building the `CareAssignment`.
- **`PATCH /profile`**: Changed `updated.clinicMemberships?.[0]?.clinicId` → `updated.clinicId` for clinic name sync; changed response to use `updated.clinic?.name ?? updated.clinicName`.

#### `backend/prisma/seed.ts` — Added Supabase Auth user creation
- Added `upsertSupabaseUser()` helper that calls `supabaseAdmin.auth.admin.createUser` with `email_confirm: true` and correct `app_metadata.role`.
- If a user already exists in Supabase Auth, the helper lists users, finds by email, and updates the password to ensure demo credentials are always `demo1234`.
- If the Prisma `User` row has a different `id` than the Supabase Auth `id` (because it was previously seeded without Supabase), the seed migrates the `id` to match Supabase Auth (so `provisionUser` can find it on login).
- Added `CareAssignment` seeding for each patient→doctor link.
- Added `Clinic` upsert for the demo clinic (`Meridian Family Health`), linking it to `Doctor.clinicId`.
- All operations remain idempotent (`upsert` on unique constraints).

### Demo Accounts (post-fix, all password: `demo1234`)
| Email | Role | Name |
|---|---|---|
| `doctor@healthlens.demo` | DOCTOR | Dr. Elena Ruiz |
| `patient@healthlens.demo` | PATIENT | Marcus Bell |
| `aiko@healthlens.demo` | PATIENT | Aiko Tanaka |
| `priya@healthlens.demo` | PATIENT | Priya Nair |
