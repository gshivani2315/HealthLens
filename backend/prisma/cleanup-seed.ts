// backend/prisma/cleanup-seed.ts
// One-time cleanup: removes the demo doctor/patient accounts (and everything
// cascaded under them) from BOTH Postgres and Supabase Auth, so seed-week.ts
// can recreate them cleanly under the new Supabase-Auth-backed flow.
//
// Run from /backend:  npx tsx prisma/cleanup-seed.ts

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const prisma = new PrismaClient();
const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAILS = [
  'doctor@healthlens.demo',
  'doctor2@healthlens.demo',
  'patient@healthlens.demo',
  'patient2@healthlens.demo',
];

async function main() {
  // 1. Postgres — deleting User cascades to Doctor/Patient and everything under them
  //    (Vital, Alert, ChronicCondition, WeeklySummary, PatientThreshold, PatientInsight).
  const { count } = await prisma.user.deleteMany({ where: { email: { in: DEMO_EMAILS } } });
  console.log(`Postgres: deleted ${count} User row(s) (cascaded to all related data).`);

  // 2. Supabase Auth — in case any of these were ever created there (e.g. a partial
  //    earlier run), clean those up too so re-creation doesn't collide.
  const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;

  for (const email of DEMO_EMAILS) {
    const match = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      await supabaseAdmin.auth.admin.deleteUser(match.id);
      console.log(`Supabase Auth: deleted ${email} (${match.id})`);
    }
  }

  console.log('\nCleanup complete. Now run: npx tsx prisma/seed-week.ts');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());