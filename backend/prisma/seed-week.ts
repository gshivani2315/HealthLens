// backend/prisma/seed-week.ts
// Idempotent "API test" seed: 2 doctors, 2 patients — created in BOTH Supabase Auth and
// Postgres — plus 7 days of vitals for patient 1.
// Run from /backend:  npx tsx prisma/seed-week.ts
//
// NOTE: this writes straight to Postgres and does NOT publish Kafka events,
// so the insight-worker will not react to it. See TESTING.md / the Kafka section
// in your setup notes for how to trigger that path separately.

import { PrismaClient, Role, RiskStatus, GlucoseContext } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const prisma = new PrismaClient();
const supabaseAdmin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'demo1234';

// Deterministic RNG so reruns produce the same shape of data.
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

// Finds an existing Supabase Auth user by email, or creates one. Returns the Supabase user id,
// which becomes our Prisma User.id too, so the two systems stay in lockstep.
async function ensureSupabaseUser(
  email: string,
  name: string,
  role: 'DOCTOR' | 'PATIENT',
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) throw listErr;
  const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) return found.id;

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name, role, ...metadata },
  });
  if (error || !data.user) throw error ?? new Error(`Failed to create Supabase user for ${email}`);
  return data.user.id;
}

async function upsertUserRow(id: string, email: string, name: string, role: Role) {
  return prisma.user.upsert({
    where: { id },
    update: { name, role, email },
    create: { id, email, name, role, password: 'SUPABASE_MANAGED_AUTH' },
  });
}

async function upsertDoctor(email: string, name: string, clinicName: string, phone: string) {
  const supaId = await ensureSupabaseUser(email, name, 'DOCTOR', { clinicName, phone });
  await upsertUserRow(supaId, email, name, Role.DOCTOR);
  return prisma.doctor.upsert({
    where: { userId: supaId },
    update: { clinicName, phone },
    create: { userId: supaId, clinicName, phone },
  });
}

async function upsertPatient(
  email: string, name: string, doctorId: string,
  extra: { dateOfBirth: Date; gender: string; phone: string; conditions: string[] },
) {
  const supaId = await ensureSupabaseUser(email, name, 'PATIENT');
  await upsertUserRow(supaId, email, name, Role.PATIENT);
  const patient = await prisma.patient.upsert({
    where: { userId: supaId },
    update: { doctorId },
    create: {
      userId: supaId, doctorId, doctorAssignedAt: new Date(),
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
  // ── Doctors ──
  const doc1 = await upsertDoctor('doctor@healthlens.demo', 'Dr. Meera Rao', 'HealthLens Clinic', '+91-44-5550-0101');
  const doc2 = await upsertDoctor('doctor2@healthlens.demo', 'Dr. Arun Iyer', 'Riverside Care', '+91-44-5550-0202');

  // ── Patients ──
  // patient1 -> doc1 (main test subject), patient2 -> doc2 (use it to verify 403 / tenant isolation)
  const p1 = await upsertPatient('patient@healthlens.demo', 'Marcus Bell', doc1.id, {
    dateOfBirth: new Date('1968-04-12'), gender: 'male', phone: '+1-555-0101',
    conditions: ['Hypertension Stage 1', 'Type 2 Diabetes'],
  });
  const p2 = await upsertPatient('patient2@healthlens.demo', 'Aiko Tanaka', doc2.id, {
    dateOfBirth: new Date('1975-09-30'), gender: 'female', phone: '+81-555-0202',
    conditions: ['Prediabetes'],
  });

  // ── 7 days of vitals for patient1 (idempotent: wipe + recreate) ──
  await prisma.vital.deleteMany({ where: { patientId: p1.id } });

  const rows: any[] = [];
  for (let d = 6; d >= 0; d--) {
    const progress = (6 - d) / 6; // 0 -> 1 across the week
    // Systolic creeps up ~138 -> ~152: below the 160/100 threshold, but a visible upward trend.
    const sys = Math.round(jitter(138 + progress * 14, 3));
    const dia = Math.round(jitter(86 + progress * 8, 2));

    // Morning submission: BP + HR + weight + sleep + fasting glucose (07:30 IST = 02:00 UTC)
    rows.push({
      patientId: p1.id,
      systolic: sys, diastolic: dia,
      heartRate: Math.round(jitter(74, 4)),
      weightKg: Number(jitter(84.0 + progress * 0.8, 0.2).toFixed(1)),
      sleepHours: Number(jitter(6.8 - progress * 0.8, 0.4).toFixed(1)),
      glucose: Math.round(jitter(112 + progress * 10, 5)),
      glucoseContext: GlucoseContext.FASTING,
      recordedAt: atUtc(d, 2, 0),
    });
    // Evening submission: BP + post-meal glucose (20:00 IST = 14:30 UTC)
    rows.push({
      patientId: p1.id,
      systolic: Math.round(jitter(sys + 4, 3)), diastolic: Math.round(jitter(dia + 2, 2)),
      glucose: Math.round(jitter(150 + progress * 15, 8)),
      glucoseContext: GlucoseContext.POST_MEAL,
      recordedAt: atUtc(d, 14, 30),
    });
  }
  await prisma.vital.createMany({ data: rows });

  // ── 3 days for patient2 ──
  await prisma.vital.deleteMany({ where: { patientId: p2.id } });
  const rows2 = [2, 1, 0].map((d) => ({
    patientId: p2.id,
    systolic: Math.round(jitter(118, 4)), diastolic: Math.round(jitter(76, 3)),
    glucose: Math.round(jitter(98, 5)), glucoseContext: GlucoseContext.FASTING,
    weightKg: Number(jitter(62, 0.3).toFixed(1)), sleepHours: Number(jitter(7.4, 0.3).toFixed(1)),
    heartRate: Math.round(jitter(68, 3)), recordedAt: atUtc(d, 2, 0),
  }));
  await prisma.vital.createMany({ data: rows2 });

  // ── Roster-maintained fields (normally set by the API/worker) ──
  await prisma.patient.update({ where: { id: p1.id }, data: { riskStatus: RiskStatus.MODERATE, lastReadingAt: atUtc(0, 14, 30) } });
  await prisma.patient.update({ where: { id: p2.id }, data: { riskStatus: RiskStatus.NORMAL, lastReadingAt: atUtc(0, 2, 0) } });

  // ── One weekly summary for patient1 (weekStart stored at 12:00Z per schema comment) ──
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

  console.log('\n✅ Seed complete. Password for all accounts:', PASSWORD);
  console.log('   (Each account now also exists in Supabase → Authentication → Users.)\n');
  console.log('Doctor 1  :', 'doctor@healthlens.demo', ' doctorId =', doc1.id);
  console.log('Doctor 2  :', 'doctor2@healthlens.demo', ' doctorId =', doc2.id);
  console.log('Patient 1 :', 'patient@healthlens.demo', ' patientId =', p1.id, '(assigned to Doctor 1)');
  console.log('Patient 2 :', 'patient2@healthlens.demo', ' patientId =', p2.id, '(assigned to Doctor 2)');
  console.log('Latest patient1 vitalId (use in Kafka manual test):', latest?.id, '\n');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());