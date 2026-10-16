import { PrismaClient } from '@prisma/client';
import { supabaseAdmin } from '../src/lib/supabase';

const prisma = new PrismaClient();
const EMAILS = [
  'doctor@healthlens.demo',
  'doctor2@healthlens.demo',
  'patient@healthlens.demo',
  'patient2@healthlens.demo',
];

async function main() {
  // 1. App DB. Deleting User cascades to Doctor/Patient and from there to
  //    vitals, alerts, conditions, thresholds, insights and weekly summaries.
  const { count } = await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
  console.log(`Deleted ${count} users from the app DB`);

  // 2. Supabase Auth
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email && EMAILS.includes(u.email.toLowerCase())) {
        await supabaseAdmin.auth.admin.deleteUser(u.id);
        console.log('Deleted auth user', u.email);
      }
    }
    if (data.users.length < 200) break;
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());