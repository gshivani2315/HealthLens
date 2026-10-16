// backend/prisma/seed-week.ts   (replaces my earlier version)
// Test seed for Supabase-only auth: creates REAL Supabase logins, then the matching rows in our DB
// using the Supabase user id as User.id. Safe to re-run.
//
// Run from /backend:  npx tsx prisma/seed-week.ts
// Does NOT publish Kafka events (the worker won't react to seeded data). See TESTING.md.

import { PrismaClient, Role, RiskStatus, GlucoseContext } from '@prisma/client';
import { supabaseAdmin } from '../src/lib/supabase';

const prisma = new PrismaClient();
const PASSWORD = 'demo1234';

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const jitter = (base: number, spread: number) => base + (rnd() - 0.5) * 2 * spread;

function atUtc(daysAgo: number, hour: number, minute: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

/** Creates the Supabase Auth user (role in app_metadata), or finds + resets it if it already exists. */
async function ensureAuthUser(email: string, name: string, role: 'DOCTOR' | 'PATIENT'): Promise<string> {
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { name },
  });
  if (created.data.user) return created.data.user.id;

  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      await supabaseAdmin.auth.admin.updateUserById(found.id, {
        password: PASSWORD,
        email_confirm: true,
        app_metadata: { ...(found.app_metadata ?? {}), role },
      });
      return found.id;
    }
    if (data.users.length < 200) break;
  }
  throw new Error(`Could not create or find Supabase user ${email}: ${created.error?.message}`);
}

/** Makes our User row's id equal the Supabase id, relinking a row seeded earlier under a different id. */
async function syncUser(id: string, email: string, name: string, role: Role) {
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail && byEmail.id !== id) {
    // Doctor.userId / Patient.userId are ON UPDATE CASCADE (Prisma's default), so their data follows the id change.
    await prisma.user.update({ where: { id: byEmail.id }, data: { id } });
  }
  return prisma.user.upsert({
    where: { id },
    update: { name, role },
    create: { id, email, name, role, password: 'SUPABASE_MANAGED_AUTH' },
  });
}

async function upsertDoctor(email: string, name: string, clinicName: string, phone: string) {
  const id = await ensureAuthUser(email, name, 'DOCTOR');
  const user = await syncUser(id, email, name, Role.DOCTOR);
  return prisma.doctor.upsert({
    where: { userId: user.id },
    update: { clinicName, phone },
    create: { userId: user.id, clinicName, phone },
  });
}

async function upsertPatient(
  email: string, name: string, doctorId: string,
  extra: { dateOfBirth: Date; gender: string; phone: string; conditions: string[] },
) {
  const id = await ensureAuthUser(email, name, 'PATIENT');
  const user = await syncUser(id, email, name, Role.PATIENT);
  const patient = await prisma.patient.upsert({
    where: { userId: user.id },
    update: { doctorId, dateOfBirth: extra.dateOfBirth, gender: extra.gender, phone: extra.phone },
    create: {
      userId: user.id, doctorId, doctorAssignedAt: new Date(),
      dateOfBirth: extra.dateOfBirth, gender: extra.gender, phone: extra.phone,
    },
  });
  await prisma.chronicCondition.deleteMany({ where: { patientId: patient.id } });
  await prisma.chronicCondition.createMany({
    data: extra.conditions.map((label) => ({ patientId: patient.id, label })),
  });
  await prisma.patientThreshold.upsert({
    where: { patientId: patient.id }, update: {}, create: { patientId: patient.id },
  });
  return patient;
}

async function main() {
  const doc1 = await upsertDoctor('doctor@healthlens.demo', 'Dr. Meera Rao', 'HealthLens Clinic', '+91-44-5550-0101');
  const doc2 = await upsertDoctor('doctor2@healthlens.demo', 'Dr. Arun Iyer', 'Riverside Care', '+91-44-5550-0202');

  const p1 = await upsertPatient('patient@healthlens.demo', 'Marcus Bell', doc1.id, {
    dateOfBirth: new Date('1968-04-12'), gender: 'Male', phone: '+1-555-0101',
    conditions: ['Hypertension Stage 1', 'Type 2 Diabetes'],
  });
  const p2 = await upsertPatient('patient2@healthlens.demo', 'Aiko Tanaka', doc2.id, {
    dateOfBirth: new Date('1975-09-30'), gender: 'Female', phone: '+81-555-0202',
    conditions: ['Prediabetes'],
  });

  // ── 7 days of vitals for patient 1 ──
  await prisma.vital.deleteMany({ where: { patientId: p1.id } });
  const rows: any[] = [];
  for (let d = 6; d >= 0; d--) {
    const progress = (6 - d) / 6;
    const sys = Math.round(jitter(138 + progress * 14, 3));
    const dia = Math.round(jitter(86 + progress * 8, 2));
    rows.push({
      patientId: p1.id, systolic: sys, diastolic: dia, heartRate: Math.round(jitter(74, 4)),
      weightKg: Number(jitter(84.0 + progress * 0.8, 0.2).toFixed(1)),
      sleepHours: Number(jitter(6.8 - progress * 0.8, 0.4).toFixed(1)),
      glucose: Math.round(jitter(112 + progress * 10, 5)), glucoseContext: GlucoseContext.FASTING,
      recordedAt: atUtc(d, 2, 0),
    });
    rows.push({
      patientId: p1.id,
      systolic: Math.round(jitter(sys + 4, 3)), diastolic: Math.round(jitter(dia + 2, 2)),
      glucose: Math.round(jitter(150 + progress * 15, 8)), glucoseContext: GlucoseContext.POST_MEAL,
      recordedAt: atUtc(d, 14, 30),
    });
  }
  await prisma.vital.createMany({ data: rows });

  // ── 3 days for patient 2 ──
  await prisma.vital.deleteMany({ where: { patientId: p2.id } });
  await prisma.vital.createMany({
    data: [2, 1, 0].map((d) => ({
      patientId: p2.id,
      systolic: Math.round(jitter(118, 4)), diastolic: Math.round(jitter(76, 3)),
      glucose: Math.round(jitter(98, 5)), glucoseContext: GlucoseContext.FASTING,
      weightKg: Number(jitter(62, 0.3).toFixed(1)), sleepHours: Number(jitter(7.4, 0.3).toFixed(1)),
      heartRate: Math.round(jitter(68, 3)), recordedAt: atUtc(d, 2, 0),
    })),
  });

  await prisma.patient.update({ where: { id: p1.id }, data: { riskStatus: RiskStatus.MODERATE, lastReadingAt: atUtc(0, 14, 30) } });
  await prisma.patient.update({ where: { id: p2.id }, data: { riskStatus: RiskStatus.NORMAL, lastReadingAt: atUtc(0, 2, 0) } });

  const weekStart = new Date(); weekStart.setUTCDate(weekStart.getUTCDate() - 7); weekStart.setUTCHours(12, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  await prisma.weeklySummary.upsert({
    where: { patientId_weekStart: { patientId: p1.id, weekStart } },
    update: {},
    create: {
      patientId: p1.id, weekStart, weekEnd,
      narrative: 'Blood pressure drifted upward across the week while sleep shortened slightly. Glucose stayed within range.',
      takeaways: ['Systolic BP trending up', 'Sleep dipped below 6.5h late in the week', 'Fasting glucose stable'],
      trend: 'WORSENING', model: 'seed', stats: { avgSystolic: 145, avgGlucoseFasting: 117 },
    },
  });

  const latest = await prisma.vital.findFirst({ where: { patientId: p1.id }, orderBy: { recordedAt: 'desc' } });

  console.log('\n✅ Seed complete. These are REAL Supabase logins. Password for all:', PASSWORD);
  console.log('Doctor 1  : doctor@healthlens.demo    doctorId =', doc1.id);
  console.log('Doctor 2  : doctor2@healthlens.demo   doctorId =', doc2.id);
  console.log('Patient 1 : patient@healthlens.demo   patientId =', p1.id, '(Doctor 1)');
  console.log('Patient 2 : patient2@healthlens.demo  patientId =', p2.id, '(Doctor 2)');
  console.log('Latest patient1 vitalId (for manual Kafka tests):', latest?.id, '\n');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());