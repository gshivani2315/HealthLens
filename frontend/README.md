# HealthLens — Frontend

React + TypeScript frontend for HealthLens, a remote patient-monitoring app with
a patient side (log vitals, view trends, read AI summaries) and a doctor side
(patient roster, alerts, thresholds). This package is **frontend only** — it
runs entirely on mock data out of the box, so it can be developed and demoed
before the backend exists.

## Stack

- React 18 + TypeScript + Vite
- React Router v6
- Tailwind CSS
- Recharts (blood pressure / glucose / weight / sleep charts)
- date-fns

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Open the printed local URL. On the login screen, use one of the demo buttons
("Use patient login" / "Use doctor login") to sign in — mock credentials are
`patient@healthlens.demo` / `doctor@healthlens.demo`, password `demo1234`.

## Project structure

```
src/
  types/          Shared TypeScript interfaces — the data contract with the backend
  services/       All network calls go through here (see "Connecting the real API" below)
  context/        Auth state, toast notifications
  components/
    layout/       Sidebar, mobile bottom tab bar, top bar, nav icons
    ui/           Buttons, cards, badges, modal, stat strip, spinner
    charts/       Recharts wrappers for BP, glucose, weight/sleep
  pages/
    patient/      Dashboard, Log Vitals, Trends, Insights, Profile
    doctor/       Dashboard (roster + urgent alerts), Patient Detail, Alerts console, Thresholds
  routes/         Role-based protected routes
```

## How the mock data layer works

Every page calls a function in `src/services/*.ts` — never `fetch` directly.
Each service function checks the `USE_MOCKS` flag (from `VITE_USE_MOCKS` in
`.env`):

- **`VITE_USE_MOCKS=true`** (default): returns realistic generated data from
  `src/services/mockData.ts` after a short simulated delay. Good for building
  and demoing the UI standalone.
- **`VITE_USE_MOCKS=false`**: calls `VITE_API_BASE_URL` instead, using the
  `apiClient` in `src/services/apiClient.ts`, which attaches
  `Authorization: Bearer <token>` automatically once a user is logged in.

## Connecting the real backend

Nothing in the components needs to change. Once the backend is up:

1. Set `VITE_API_BASE_URL` in `.env` to point at it.
2. Set `VITE_USE_MOCKS=false`.
3. Make sure your endpoints match the contract below (also documented as a
   comment at the top of each file in `src/services/`).

Expected error shape for any non-2xx response: `{ "message": string }`.

### Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| POST | `/auth/logout` | — | 204 |

`user` is `{ id, role: "patient" | "doctor", name, email }`.

### Patient — vitals & dashboard

| Method | Path | Notes |
|---|---|---|
| GET | `/patients/:id/dashboard` | Returns `DashboardSnapshot` — today's metrics, AI insight banner, 7-day sparkline |
| POST | `/patients/:id/vitals` | Body is a `VitalsSubmission`; returns the created `VitalsEntry` |
| GET | `/patients/:id/vitals?range=7d\|30d\|90d&filter=all\|bp\|glucose\|weight\|sleep` | Returns `{ points: TrendPoint[], stats: {...} }` for the Trends page |
| GET | `/patients/:id/vitals/log?page=&pageSize=` | Paginated raw log, used by the doctor's patient detail view |

### Patient — profile

| Method | Path | Notes |
|---|---|---|
| GET | `/patients/:id/profile` | Returns `PatientProfile` |
| PATCH | `/patients/:id/profile` | Partial update |

### Insights

| Method | Path | Notes |
|---|---|---|
| GET | `/patients/:id/summaries` | Weekly Gemini-generated summaries |
| GET | `/patients/:id/alerts/history` | Full alert history for that patient |

### Doctor

| Method | Path | Notes |
|---|---|---|
| GET | `/doctor/overview` | Stats bar + urgent alerts + roster, for the doctor dashboard |
| GET | `/doctor/patients?search=&filter=all\|critical\|needs_review` | Roster table, filterable |
| GET | `/doctor/patients/:id` | Full `PatientDetail` — profile, AI clinical insight, alert history, vitals log |
| GET | `/doctor/patients/:id/thresholds` | Returns `ThresholdConfig` |
| PUT | `/doctor/patients/:id/thresholds` | Save new thresholds |

### Alerts

| Method | Path | Notes |
|---|---|---|
| GET | `/alerts?status=&type=` | Alert Management Console feed |
| PATCH | `/alerts/:id` | Body `{ status, clinicalNote? }` |
| POST | `/alerts/:id/follow-up` | Sends a follow-up reminder to the patient |

All the shapes referenced above (`DashboardSnapshot`, `TrendPoint`,
`VitalsEntry`, `PatientProfile`, `PatientDetail`, `DoctorOverview`,
`AlertItem`, `WeeklySummary`, `ThresholdConfig`, etc.) are defined in
`src/types/index.ts` — that file is the single source of truth for the JSON
shapes the backend needs to return.

## Notes for whoever builds the backend

- Auth is a simple bearer token; there's no refresh-token flow wired up yet.
- IDs used by the mock data (`pat_001`, `doc_001`, etc.) are arbitrary strings
  — the frontend doesn't assume any particular ID format.
- Timestamps are expected as ISO 8601 strings throughout.
- The demo/mock users' `id` fields (`pat_001` for the patient, `doc_001` for
  the doctor) double as the patient/doctor IDs used in the vitals and roster
  endpoints — i.e. after login, `user.id` is what gets passed as `:id` in the
  patient-scoped routes.
