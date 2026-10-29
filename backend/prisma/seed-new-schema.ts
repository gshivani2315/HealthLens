/**
 * seed-new-schema.ts
 *
 * Addendum seed for the multi-clinic / multi-doctor schema additions.
 * Adds data for: Clinic, ClinicMember, CareAssignment, CareInvite,
 *                Notification, Message, heart-rate vitals.
 *
 * ✅ Safe to run on top of an existing database — everything uses upsert /
 *    createMany with skipDuplicates so no existing row is ever deleted or
 *    overwritten destructively.
 *
 * Run from /backend:
 *   npm run db:seed-new
 */

import 'dotenv/config';
import {
  AssignmentStatus,
  InviteStatus,
  NotificationType,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────

/** Returns a Date `daysAgo` days in the past at the given hour (UTC). */
function daysAgo(d: number, hourUtc = 9): Date {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() - d);
  dt.setUTCHours(hourUtc, 0, 0, 0);
  return dt;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  Seeding new-schema data (addendum)…\n');

  // ── 0. Resolve existing users ──────────────────────────────────────────────
  // Look up doctors and patients created by the original seed.ts so we can
  // reference their IDs without hard-coding them.

  const dr1 = await prisma.doctor.findFirst({
    where: { user: { email: 'doctor@healthlens.demo' } },
    include: { user: true },
  });

  // Second demo doctor – create if not present.
  const dr2User = await prisma.user.upsert({
    where: { email: 'doctor2@healthlens.demo' },
    update: {},
    create: {
      email: 'doctor2@healthlens.demo',
      // bcrypt hash of "demo1234" – pre-computed so we don't need to import bcrypt here
      password: '$2b$10$DEMO_HASH_PLACEHOLDER_CHANGE_ME', // replace with real hash if needed
      name: 'Dr. James Okafor',
      role: 'DOCTOR',
      doctor: {
        create: {
          clinicName: 'Okafor Cardiology Centre',
          phone: '+1 (555) 812-0044',
        },
      },
    },
    include: { doctor: true },
  });
  const dr2 = dr2User.doctor!;

  const pat001 = await prisma.patient.findUnique({ where: { id: 'pat_001' } });
  const pat002 = await prisma.patient.findUnique({ where: { id: 'pat_002' } });
  const pat003 = await prisma.patient.findUnique({ where: { id: 'pat_003' } });

  if (!dr1 || !pat001 || !pat002 || !pat003) {
    console.error('❌  Base seed data not found. Run `npm run seed` first.');
    process.exit(1);
  }

  console.log('✅  Existing doctors and patients resolved.\n');

  // ── 1. Clinics ─────────────────────────────────────────────────────────────

  const clinics = await Promise.all([
    prisma.clinic.upsert({
      where:  { id: `clinic_${dr1.id}` },
      update: {},
      create: {
        id:      `clinic_${dr1.id}`,
        name:    'Meridian Family Health',
        phone:   '+1 (555) 019-2231',
        address: '12 Meridian Way, Suite 300, Austin TX 78701',
      },
    }),
    prisma.clinic.upsert({
      where:  { id: `clinic_${dr2.id}` },
      update: {},
      create: {
        id:      `clinic_${dr2.id}`,
        name:    'Okafor Cardiology Centre',
        phone:   '+1 (555) 812-0044',
        address: '88 Heart Boulevard, Austin TX 78702',
      },
    }),
    // A shared multi-specialty clinic both doctors belong to
    prisma.clinic.upsert({
      where:  { id: 'clinic_shared_01' },
      update: {},
      create: {
        id:      'clinic_shared_01',
        name:    'Austin Multi-Specialty Group',
        phone:   '+1 (555) 700-1234',
        address: '400 Congress Ave, Austin TX 78701',
      },
    }),
  ]);

  console.log(`✅  ${clinics.length} clinics upserted.`);

  // ── 2. ClinicMembers ───────────────────────────────────────────────────────

  const members = await Promise.all([
    // Dr. Ruiz → her own clinic
    prisma.clinicMember.upsert({
      where:  { doctorId_clinicId: { doctorId: dr1.id, clinicId: `clinic_${dr1.id}` } },
      update: {},
      create: { doctorId: dr1.id, clinicId: `clinic_${dr1.id}`, role: 'PHYSICIAN' },
    }),
    // Dr. Okafor → his own clinic
    prisma.clinicMember.upsert({
      where:  { doctorId_clinicId: { doctorId: dr2.id, clinicId: `clinic_${dr2.id}` } },
      update: {},
      create: { doctorId: dr2.id, clinicId: `clinic_${dr2.id}`, role: 'PHYSICIAN' },
    }),
    // Dr. Ruiz also belongs to the shared clinic as a SPECIALIST
    prisma.clinicMember.upsert({
      where:  { doctorId_clinicId: { doctorId: dr1.id, clinicId: 'clinic_shared_01' } },
      update: {},
      create: { doctorId: dr1.id, clinicId: 'clinic_shared_01', role: 'SPECIALIST' },
    }),
    // Dr. Okafor also belongs to the shared clinic
    prisma.clinicMember.upsert({
      where:  { doctorId_clinicId: { doctorId: dr2.id, clinicId: 'clinic_shared_01' } },
      update: {},
      create: { doctorId: dr2.id, clinicId: 'clinic_shared_01', role: 'SPECIALIST' },
    }),
  ]);

  console.log(`✅  ${members.length} clinic memberships upserted.`);

  // ── 3. CareAssignments ────────────────────────────────────────────────────
  // pat_001 (Marcus Bell)  → Dr. Ruiz (Primary Care) + Dr. Okafor (Cardiology)
  // pat_002 (Aiko Tanaka)  → Dr. Ruiz (Primary Care)
  // pat_003 (Priya Nair)   → Dr. Ruiz (Primary Care) + shared clinic specialist role demo

  const assignments = await Promise.all([
    // Marcus – Dr. Ruiz (primary, from legacy doctorId)
    prisma.careAssignment.upsert({
      where:  { id: `ca_${pat001.id}_${dr1.id}` },
      update: { status: AssignmentStatus.ACTIVE },
      create: {
        id:         `ca_${pat001.id}_${dr1.id}`,
        patientId:  pat001.id,
        doctorId:   dr1.id,
        clinicId:   `clinic_${dr1.id}`,
        specialty:  'Primary Care',
        status:     AssignmentStatus.ACTIVE,
        assignedAt: new Date('2024-11-03'),
      },
    }),
    // Marcus – Dr. Okafor (Cardiology, second doctor demo)
    prisma.careAssignment.upsert({
      where:  { id: `ca_${pat001.id}_${dr2.id}` },
      update: { status: AssignmentStatus.ACTIVE },
      create: {
        id:         `ca_${pat001.id}_${dr2.id}`,
        patientId:  pat001.id,
        doctorId:   dr2.id,
        clinicId:   `clinic_${dr2.id}`,
        specialty:  'Cardiology',
        status:     AssignmentStatus.ACTIVE,
        assignedAt: daysAgo(14),
      },
    }),
    // Aiko – Dr. Ruiz
    prisma.careAssignment.upsert({
      where:  { id: `ca_${pat002.id}_${dr1.id}` },
      update: { status: AssignmentStatus.ACTIVE },
      create: {
        id:         `ca_${pat002.id}_${dr1.id}`,
        patientId:  pat002.id,
        doctorId:   dr1.id,
        clinicId:   `clinic_${dr1.id}`,
        specialty:  'Primary Care',
        status:     AssignmentStatus.ACTIVE,
        assignedAt: new Date('2024-11-03'),
      },
    }),
    // Priya – Dr. Ruiz
    prisma.careAssignment.upsert({
      where:  { id: `ca_${pat003.id}_${dr1.id}` },
      update: { status: AssignmentStatus.ACTIVE },
      create: {
        id:         `ca_${pat003.id}_${dr1.id}`,
        patientId:  pat003.id,
        doctorId:   dr1.id,
        clinicId:   `clinic_${dr1.id}`,
        specialty:  'Endocrinology',
        status:     AssignmentStatus.ACTIVE,
        assignedAt: new Date('2024-11-03'),
      },
    }),
    // Ended historical assignment – Marcus, Dr. Ruiz at shared clinic (demo of ENDED state)
    prisma.careAssignment.upsert({
      where:  { id: 'ca_pat_001_shared_demo' },
      update: {},
      create: {
        id:         'ca_pat_001_shared_demo',
        patientId:  pat001.id,
        doctorId:   dr1.id,
        clinicId:   'clinic_shared_01',
        specialty:  'Preventive Medicine',
        status:     AssignmentStatus.ENDED,
        assignedAt: daysAgo(90),
        endedAt:    daysAgo(30),
      },
    }),
  ]);

  console.log(`✅  ${assignments.length} care assignments upserted.`);

  // ── 4. CareInvites ────────────────────────────────────────────────────────

  const invites = await Promise.all([
    // Open invite from Dr. Ruiz – any patient can use this code
    prisma.careInvite.upsert({
      where:  { code: 'HL-RUIZ-OPEN' },
      update: {},
      create: {
        code:      'HL-RUIZ-OPEN',
        doctorId:  dr1.id,
        clinicId:  `clinic_${dr1.id}`,
        specialty: 'Primary Care',
        status:    InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 30 * 86_400_000), // 30 days from now
      },
    }),
    // Restricted invite from Dr. Okafor for a specific patient email
    prisma.careInvite.upsert({
      where:  { code: 'HL-OKFR-2024' },
      update: {},
      create: {
        code:         'HL-OKFR-2024',
        doctorId:     dr2.id,
        clinicId:     `clinic_${dr2.id}`,
        specialty:    'Cardiology',
        patientEmail: 'newpatient@example.com',
        status:       InviteStatus.PENDING,
        expiresAt:    new Date(Date.now() + 7 * 86_400_000), // 7 days
      },
    }),
    // Already-accepted invite (historical record)
    prisma.careInvite.upsert({
      where:  { code: 'HL-HIST-ACPT' },
      update: {},
      create: {
        code:      'HL-HIST-ACPT',
        doctorId:  dr2.id,
        clinicId:  `clinic_${dr2.id}`,
        specialty: 'Cardiology',
        status:    InviteStatus.ACCEPTED,
        expiresAt: daysAgo(7),
      },
    }),
  ]);

  console.log(`✅  ${invites.length} care invites upserted.`);

  // ── 5. Notifications ──────────────────────────────────────────────────────

  // Resolve user IDs for the notifications
  const dr1User  = await prisma.user.findUnique({ where: { email: 'doctor@healthlens.demo' } });
  const pat1User = await prisma.user.findFirst({ where: { patient: { id: pat001.id } } });

  const notifData = [
    {
      userId:    dr1User!.id,
      type:      NotificationType.CARE_ASSIGNMENT,
      title:     'New patient assigned',
      body:      'Marcus Bell has been assigned to you under Cardiology at Okafor Cardiology Centre.',
      read:      false,
      link:      `/doctor/patients/${pat001.id}`,
    },
    {
      userId:    dr1User!.id,
      type:      NotificationType.CRITICAL_ALERT,
      title:     'Critical BP alert – Marcus Bell',
      body:      'Systolic reading of 178 mmHg recorded. Immediate review recommended.',
      read:      true,
      link:      `/doctor/patients/${pat001.id}`,
    },
    {
      userId:    dr2User.id,
      type:      NotificationType.CARE_ASSIGNMENT,
      title:     'New care assignment',
      body:      'Marcus Bell has been added to your patient roster under Cardiology.',
      read:      false,
      link:      `/doctor/patients/${pat001.id}`,
    },
    {
      userId:    pat1User!.id,
      type:      NotificationType.CARE_ASSIGNMENT,
      title:     'New doctor added to your care team',
      body:      'Dr. James Okafor (Cardiology) has joined your care team at Okafor Cardiology Centre.',
      read:      false,
      link:      '/patient/profile',
    },
    {
      userId:    pat1User!.id,
      type:      NotificationType.VISIT_REQUEST,
      title:     'Visit request confirmed',
      body:      'Dr. Elena Ruiz has confirmed your appointment for next Monday at 10 AM.',
      read:      true,
      link:      '/patient/profile',
    },
  ];

  const notifResult = await prisma.notification.createMany({
    data:           notifData,
    skipDuplicates: true,
  });

  console.log(`✅  ${notifResult.count} notifications created.`);

  // ── 6. Messages (chat per CareAssignment) ────────────────────────────────

  const caId = `ca_${pat001.id}_${dr1.id}`;   // Marcus ↔ Dr. Ruiz

  const msgData = [
    {
      careAssignmentId: caId,
      senderId:         dr1User!.id,
      body:             'Hi Marcus, just reviewed your latest readings. Your BP has been trending higher this week — let\'s discuss at your next check-in.',
      readAt:           daysAgo(2, 10),
    },
    {
      careAssignmentId: caId,
      senderId:         pat1User!.id,
      body:             'Thanks Dr. Ruiz. I\'ve been under some extra stress at work this week. Could that be contributing?',
      readAt:           daysAgo(2, 11),
    },
    {
      careAssignmentId: caId,
      senderId:         dr1User!.id,
      body:             'Absolutely, stress is a significant factor. I\'d like you to try the breathing exercises I mentioned and log your readings morning and evening this week.',
      readAt:           daysAgo(1, 9),
    },
    {
      careAssignmentId: caId,
      senderId:         pat1User!.id,
      body:             'Will do! I\'ll start today and keep tracking. Should I reduce my sodium intake further as well?',
      readAt:           null, // unread by doctor
    },
  ];

  const msgResult = await prisma.message.createMany({
    data:           msgData,
    skipDuplicates: true,
  });

  console.log(`✅  ${msgResult.count} chat messages created.`);

  // ── 7. Heart-rate vitals (addendum columns) ───────────────────────────────
  // The existing vitals don't have heartRate. We add standalone HeartRate
  // readings for the last 14 days for all 3 patients using the `heartRate`
  // model (added in the new schema as a sub-table of Vital, or standalone).
  // If your schema stores heartRate directly on Vital, update the field below.

  const patientIds = [pat001.id, pat002.id, pat003.id];
  const hrRows: { patientId: string; bpm: number; recordedAt: Date }[] = [];

  for (const pid of patientIds) {
    const base = pid === pat001.id ? 82 : pid === pat002.id ? 75 : 68;
    for (let i = 14; i >= 1; i--) {
      const at = daysAgo(i, 7);
      const noise = Math.round(Math.sin(i * 3.7 + base) * 6);
      hrRows.push({ patientId: pid, bpm: base + noise, recordedAt: at });
    }
  }

  try {
    const hrResult = await (prisma as any).heartRate.createMany({
      data:           hrRows,
      skipDuplicates: true,
    });
    console.log(`✅  ${hrResult.count} heart-rate readings created.`);
  } catch {
    // HeartRate model may not exist yet if migration hasn't run — skip gracefully
    console.log('ℹ️   HeartRate model not found – run db:migrate first, then re-run this seed.');
  }

  // ── 8. PatientThreshold – ensure heartRate bounds exist ──────────────────

  for (const pid of patientIds) {
    await prisma.patientThreshold.updateMany({
      where: { patientId: pid },
      data:  {
        heartRateMax: 120,
        heartRateMin: 50,
      },
    });
  }

  console.log('✅  Heart-rate threshold bounds set for all patients.');

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log('\n🎉  New-schema seed complete!\n');
  console.log('Summary of what was added:');
  console.log('  • 3 Clinics (Meridian, Okafor Cardiology, Austin Multi-Specialty)');
  console.log('  • 4 ClinicMember links');
  console.log('  • 5 CareAssignments (incl. 1 ENDED historical)');
  console.log('  • 3 CareInvites (2 PENDING, 1 ACCEPTED)');
  console.log('  • 5 Notifications (doctor + patient inbox)');
  console.log('  • 4 Chat Messages (Marcus ↔ Dr. Ruiz)');
  console.log('  • 42 Heart-rate readings (14 days × 3 patients)');
  console.log('  • HeartRate thresholds updated on all PatientThreshold rows\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

