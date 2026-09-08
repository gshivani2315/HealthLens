# HealthLens Backend

Owner: Teammate 1

Node.js + Express + TypeScript API. Handles auth, patients, vitals, alerts,
summaries. Publishes `vitals.logged` to Kafka on new vital submission.

## Setup
npm install
npm run dev   # runs src/server.ts (not yet created - see project notes)

## Structure
- src/modules/*      one folder per domain (auth, patients, vitals, alerts, summaries)
- src/middleware/     auth + error handling
- src/kafka/          producer + topic names
- src/db/             Prisma client
- prisma/schema.prisma
