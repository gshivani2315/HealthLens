/**
 * seed-full.ts  –  Complete, self-contained seed for HealthLens
 *
 * Creates ALL data from scratch: Users, Doctors, Patients, Clinics,
 * ClinicMembers, CareAssignments, CareInvites, Vitals (incl. heartRate),
 * Alerts, WeeklySummaries, PatientThresholds, Notifications, and Messages.
 *
 * ✅ Does NOT depend on seed.ts having run first.
 * ✅ Fully idempotent – safe to re-run, nothing is deleted.
 *
 * Run from /backend:
 *   npm run db:seed-full
 *
 * ── Demo credentials ────────────────────────────────────────────
 *  DOCTOR 1   doctor@healthlens.demo   / demo1234
 *  DOCTOR 2   doctor2@healthlens.demo  / demo1234
 *  PATIENT 1  patient@healthlens.demo  / demo1234   (Marcus Bell)
 *  PATIENT 2  aiko@healthlens.demo     / demo1234   (Aiko Tanaka)
 *  PATIENT 3  priya@healthlens.demo    / demo1234   (Priya Nair)
 * ────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
  AiRiskLevel,
  AssignmentStatus,
  GlucoseContext,
  InviteStatus,
  NotificationType,
  PrismaClient,
  Role,
} from '@prisma/client';

const prisma = new PrismaClient();

// ── tiny helpers ────────────────────────────────────────────────────────────

const DAY = 86_400_000;
const sin  = (i: number, amp: number) => Math.round(Math.sin(i * 12.9898) * amp);

function daysAgo(d: number, hourUtc = 8): Date {
  const dt = new Date(Date.now() - d * DAY);
  dt.setUTCHours(hourUtc, 0, 0, 0);
  return dt;
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  HealthLens – Full Seed\n');

  const hash = await bcrypt.hash('demo1234', 10);

  // ── 1. USERS & DOCTORS ────────────────────────────────────────────────────

  const dr1User = await prisma.user.upsert({
    where:   { email: 'doctor@healthlens.demo' },
    update:  { password: hash },
    create: {
      email:    'doctor@healthlens.demo',
      password: hash,
      name:     'Dr. Elena Ruiz',
      role:     Role.DOCTOR,
      doctor:   { create: { clinicName: 'Meridian Family Health', phone: '+1 (555) 019-2231' } },
    },
    include: { doctor: true },
  });
  const dr1 = dr1User.doctor!;

  const dr2User = await prisma.user.upsert({
    where:   { email: 'doctor2@healthlens.demo' },
    update:  { password: hash },
    create: {
      email:    'doctor2@healthlens.demo',
      password: hash,
      name:     'Dr. James Okafor',
      role:     Role.DOCTOR,
      doctor:   { create: { clinicName: 'Okafor Cardiology Centre', phone: '+1 (555) 812-0044' } },
    },
    include: { doctor: true },
  });
  const dr2 = dr2User.doctor!;

  console.log(`✅  Doctors: ${dr1User.email} | ${dr2User.email}`);

  // ── 2. CLINICS ────────────────────────────────────────────────────────────

  const clinicRuiz = await prisma.clinic.upsert({
    where:  { id: `clinic_${dr1.id}` },
    update: {},
    create: {
      id:      `clinic_${dr1.id}`,
      name:    'Meridian Family Health',
      phone:   '+1 (555) 019-2231',
      address: '12 Meridian Way, Suite 300, Austin TX 78701',
    },
  });

  const clinicOkafor = await prisma.clinic.upsert({
    where:  { id: `clinic_${dr2.id}` },
    update: {},
    create: {
      id:      `clinic_${dr2.id}`,
      name:    'Okafor Cardiology Centre',
      phone:   '+1 (555) 812-0044',
      address: '88 Heart Boulevard, Austin TX 78702',
    },
  });

  const clinicShared = await prisma.clinic.upsert({
    where:  { id: 'clinic_shared_01' },
    update: {},
    create: {
      id:      'clinic_shared_01',
      name:    'Austin Multi-Specialty Group',
      phone:   '+1 (555) 700-1234',
      address: '400 Congress Ave, Austin TX 78701',
    },
  });

  console.log(`✅  Clinics: ${clinicRuiz.name} | ${clinicOkafor.name} | ${clinicShared.name}`);

  // ── 3. CLINIC MEMBERS ─────────────────────────────────────────────────────

  await Promise.all([
    prisma.clinicMember.upsert({
      where:  { doctorId_clinicId: { doctorId: dr1.id, clinicId: clinicRuiz.id } },
      update: {},
      create: { doctorId: dr1.id, clinicId: clinicRuiz.id, role: 'PHYSICIAN' },
    }),
    prisma.clinicMember.upsert({
      where:  { doctorId_clinicId: { doctorId: dr2.id, clinicId: clinicOkafor.id } },
      update: {},
      create: { doctorId: dr2.id, clinicId: clinicOkafor.id, role: 'PHYSICIAN' },
    }),
    prisma.clinicMember.upsert({
      where:  { doctorId_clinicId: { doctorId: dr1.id, clinicId: clinicShared.id } },
      update: {},
      create: { doctorId: dr1.id, clinicId: clinicShared.id, role: 'SPECIALIST' },
    }),
    prisma.clinicMember.upsert({
      where:  { doctorId_clinicId: { doctorId: dr2.id, clinicId: clinicShared.id } },
      update: {},
      create: { doctorId: dr2.id, clinicId: clinicShared.id, role: 'SPECIALIST' },
    }),
  ]);

  console.log('✅  Clinic memberships set.');

  // ── 4. PATIENTS ───────────────────────────────────────────────────────────

  const patientDefs = [
    {
      email: 'patient@healthlens.demo',
      name:  'Marcus Bell',
      dob:   '1968-04-12',
      gender:'Male',
      phone: '+1 (555) 402-8871',
      cond:  'Hypertension Stage 1',
      risk:  'MODERATE' as const,
      // vitals baseline
      sysBp: 148, diaBp: 94, gluc: 118, wt: 88.4, sleep: 6.5, hr: 82,
      glucCtx: GlucoseContext.FASTING,
    },
    {
      email: 'aiko@healthlens.demo',
      name:  'Aiko Tanaka',
      dob:   '1961-08-22',
      gender:'Female',
      phone: '+1 (555) 203-9944',
      cond:  'Hypertension Stage 2',
      risk:  'CRITICAL' as const,
      sysBp: 162, diaBp: 104, gluc: 126, wt: 72.1, sleep: 6.8, hr: 75,
      glucCtx: GlucoseContext.POST_MEAL,
    },
    {
      email: 'priya@healthlens.demo',
      name:  'Priya Nair',
      dob:   '1981-03-14',
      gender:'Female',
      phone: '+1 (555) 304-1188',
      cond:  'Prediabetes',
      risk:  'NORMAL' as const,
      sysBp: 118, diaBp: 76, gluc: 101, wt: 64.2, sleep: 7.5, hr: 68,
      glucCtx: GlucoseContext.FASTING,
    },
  ];

  const createdPatients: { id: string; userId: string; def: typeof patientDefs[0] }[] = [];

  for (const p of patientDefs) {
    const u = await prisma.user.upsert({
      where:   { email: p.email },
      update:  { password: hash },
      create: {
        email:    p.email,
        password: hash,
        name:     p.name,
        role:     Role.PATIENT,
        patient: {
          create: {
            doctorId:         dr1.id,
            doctorAssignedAt: new Date('2024-11-03'),
            dateOfBirth:      new Date(p.dob),
            gender:           p.gender,
            phone:            p.phone,
            riskStatus:       p.risk,
            lastReadingAt:    daysAgo(1),
            conditions:       { create: [{ label: p.cond }] },
            threshold: {
              create: {
                systolicMax:        p.sysBp > 140 ? 160 : 140,
                diastolicMax:       p.diaBp > 90 ? 100 : 90,
                glucoseFastingMax:  130,
                glucoseFastingMin:  70,
                glucosePostMealMax: 180,
                heartRateMax:       120,
                heartRateMin:       50,
              },
            },
          },
        },
      },
      include: { patient: true },
    });

    const pat = u.patient!;
    createdPatients.push({ id: pat.id, userId: u.id, def: p });
    console.log(`✅  Patient: ${u.email} → id: ${pat.id}`);
  }

  // ── 5. VITALS (30 days, including heartRate) ──────────────────────────────

  for (const { id: patientId, def: p } of createdPatients) {
    const existing = await prisma.vital.count({ where: { patientId } });
    if (existing === 0) {
      const rows = Array.from({ length: 30 }, (_, idx) => {
        const i   = 30 - idx;
        const at  = daysAgo(i, 6);
        return {
          patientId,
          systolic:      p.sysBp + sin(i, 8),
          diastolic:     p.diaBp + sin(i + 1, 5),
          glucose:       p.gluc  + sin(i + 2, 10),
          glucoseContext: i % 2 === 0 ? GlucoseContext.FASTING : GlucoseContext.POST_MEAL,
          weightKg:      Math.round((p.wt + sin(i, 1) * 0.1) * 10) / 10,
          sleepHours:    Math.round((p.sleep + sin(i, 1) * 0.05) * 2) / 2,
          heartRate:     p.hr + sin(i + 3, 6),
          recordedAt:    at,
        };
      });
      await prisma.vital.createMany({ data: rows });
      await prisma.patient.update({
        where: { id: patientId },
        data:  { lastReadingAt: rows[rows.length - 1].recordedAt },
      });
      console.log(`   ↳ 30 vitals seeded for ${p.email}`);
    }
  }

  // ── 6. WEEKLY SUMMARIES ───────────────────────────────────────────────────

  const summaryTemplates = [
    {
      weekOffset: 0,
      trend: 'STABLE',
      narrative: (name: string, cond: string) =>
        `${name}'s readings remained consistent this week. ${cond} markers are being managed within expected parameters. Sleep quality shows gradual improvement.`,
      takeaways: ['Continue current medication schedule.', 'Maintain logging at the same time each morning.', 'Review diet log before next check-in.'],
    },
    {
      weekOffset: 1,
      trend: 'IMPROVING',
      narrative: (name: string, cond: string) =>
        `Notable improvement in ${name}'s ${cond.toLowerCase()} indicators compared to last week. Readings trending toward target range across the board.`,
      takeaways: ['Positive response to lifestyle modifications.', 'Keep sodium intake below 1500 mg/day.', 'Continue evening walks.'],
    },
    {
      weekOffset: 2,
      trend: 'STABLE',
      narrative: (name: string) =>
        `${name}'s vitals held steady. No critical spikes recorded. Heart rate variability within normal bounds throughout the week.`,
      takeaways: ['Stable pattern – no action required.', 'Hydration levels appear adequate.', 'Check in if any unusual symptoms arise.'],
    },
    {
      weekOffset: 3,
      trend: 'STABLE',
      narrative: (name: string) =>
        `Baseline period established for ${name}. Initial monitoring compliance is excellent. All primary indicators documented.`,
      takeaways: ['Baseline profile successfully initialized.', 'Maintain daily logging cadence.', 'First formal review scheduled.'],
    },
  ];

  for (const { id: patientId, def: p } of createdPatients) {
    for (const s of summaryTemplates) {
      const weekStart = daysAgo((s.weekOffset + 1) * 7, 12);
      const weekEnd   = daysAgo(s.weekOffset * 7, 12);
      await prisma.weeklySummary.upsert({
        where:  { patientId_weekStart: { patientId, weekStart } },
        update: {},
        create: {
          patientId,
          weekStart,
          weekEnd,
          narrative: typeof s.narrative === 'function'
            ? (s.narrative as Function)(p.name, p.cond)
            : s.narrative,
          takeaways: s.takeaways,
          trend:     s.trend,
        },
      });
    }
  }

  console.log('✅  Weekly summaries seeded.');

  // ── 7. ALERTS ─────────────────────────────────────────────────────────────

  // Marcus – BP threshold alert (UNREAD)
  const marcus  = createdPatients[0];
  const aiko    = createdPatients[1];

  await prisma.alert.upsert({
    where:  { dedupeKey: 'bp_thresh_marcus_seed_01' },
    update: {},
    create: {
      patientId:    marcus.id,
      type:         AlertType.THRESHOLD,
      severity:     AlertSeverity.CAUTION,
      status:       AlertStatus.UNREAD,
      rule:         'BP_THRESHOLD',
      triggerLabel: 'Threshold: Systolic > 160 mmHg',
      detail:       'Systolic reading of 162 mmHg detected on morning log.',
      metrics:      { systolic: 162, diastolic: 96 },
      dedupeKey:    'bp_thresh_marcus_seed_01',
      triggeredAt:  daysAgo(2, 7),
    },
  });

  // Marcus – AI pattern alert (ACKNOWLEDGED)
  await prisma.alert.upsert({
    where:  { dedupeKey: 'ai_pattern_marcus_seed_01' },
    update: {},
    create: {
      patientId:       marcus.id,
      type:            AlertType.AI_PATTERN,
      severity:        AlertSeverity.CRITICAL,
      status:          AlertStatus.ACKNOWLEDGED,
      rule:            'AI_PATTERN',
      triggerLabel:    'AI: Sustained hypertension pattern detected',
      detail:          'Systolic readings have remained above 155 mmHg for 5 consecutive days.',
      aiRationale:     'Analysis of 30-day trend indicates increasing baseline. Immediate clinical review recommended.',
      dedupeKey:       'ai_pattern_marcus_seed_01',
      acknowledgedAt:  daysAgo(1, 10),
      acknowledgedById: dr1.id,
      triggeredAt:     daysAgo(3, 8),
    },
  });

  // Aiko – Critical BP alert (UNREAD)
  await prisma.alert.upsert({
    where:  { dedupeKey: 'bp_thresh_aiko_seed_01' },
    update: {},
    create: {
      patientId:    aiko.id,
      type:         AlertType.THRESHOLD,
      severity:     AlertSeverity.CRITICAL,
      status:       AlertStatus.UNREAD,
      rule:         'BP_THRESHOLD',
      triggerLabel: 'Threshold: Systolic > 160 mmHg',
      detail:       'Systolic reading of 178 mmHg detected. Stage 2 critical threshold crossed.',
      metrics:      { systolic: 178, diastolic: 108 },
      dedupeKey:    'bp_thresh_aiko_seed_01',
      triggeredAt:  daysAgo(1, 6),
    },
  });

  console.log('✅  3 alerts seeded.');

  // ── 8. CARE ASSIGNMENTS ───────────────────────────────────────────────────

  const [marcusAssign, aikoAssign, priyaAssign, marcusCardio] = await Promise.all([
    // Marcus → Dr. Ruiz (Primary Care)
    prisma.careAssignment.upsert({
      where:  { id: `ca_${marcus.id}_${dr1.id}` },
      update: { status: AssignmentStatus.ACTIVE },
      create: {
        id:         `ca_${marcus.id}_${dr1.id}`,
        patientId:  marcus.id,
        doctorId:   dr1.id,
        clinicId:   clinicRuiz.id,
        specialty:  'Primary Care',
        status:     AssignmentStatus.ACTIVE,
        assignedAt: new Date('2024-11-03'),
      },
    }),
    // Aiko → Dr. Ruiz (Primary Care)
    prisma.careAssignment.upsert({
      where:  { id: `ca_${aiko.id}_${dr1.id}` },
      update: { status: AssignmentStatus.ACTIVE },
      create: {
        id:         `ca_${aiko.id}_${dr1.id}`,
        patientId:  aiko.id,
        doctorId:   dr1.id,
        clinicId:   clinicRuiz.id,
        specialty:  'Primary Care',
        status:     AssignmentStatus.ACTIVE,
        assignedAt: new Date('2024-11-03'),
      },
    }),
    // Priya → Dr. Ruiz (Endocrinology)
    prisma.careAssignment.upsert({
      where:  { id: `ca_${createdPatients[2].id}_${dr1.id}` },
      update: { status: AssignmentStatus.ACTIVE },
      create: {
        id:         `ca_${createdPatients[2].id}_${dr1.id}`,
        patientId:  createdPatients[2].id,
        doctorId:   dr1.id,
        clinicId:   clinicRuiz.id,
        specialty:  'Endocrinology',
        status:     AssignmentStatus.ACTIVE,
        assignedAt: new Date('2024-11-03'),
      },
    }),
    // Marcus → Dr. Okafor (Cardiology) – second doctor demo
    prisma.careAssignment.upsert({
      where:  { id: `ca_${marcus.id}_${dr2.id}` },
      update: { status: AssignmentStatus.ACTIVE },
      create: {
        id:         `ca_${marcus.id}_${dr2.id}`,
        patientId:  marcus.id,
        doctorId:   dr2.id,
        clinicId:   clinicOkafor.id,
        specialty:  'Cardiology',
        status:     AssignmentStatus.ACTIVE,
        assignedAt: daysAgo(14),
      },
    }),
  ]);

  // ENDED historical assignment for demo of past state
  await prisma.careAssignment.upsert({
    where:  { id: 'ca_hist_ended_demo' },
    update: {},
    create: {
      id:         'ca_hist_ended_demo',
      patientId:  marcus.id,
      doctorId:   dr1.id,
      clinicId:   clinicShared.id,
      specialty:  'Preventive Medicine',
      status:     AssignmentStatus.ENDED,
      assignedAt: daysAgo(90),
      endedAt:    daysAgo(30),
    },
  });

  console.log('✅  5 care assignments upserted.');

  // ── 9. CARE INVITES ───────────────────────────────────────────────────────

  await Promise.all([
    prisma.careInvite.upsert({
      where:  { code: 'HL-RUIZ-OPEN' },
      update: {},
      create: {
        code:      'HL-RUIZ-OPEN',
        doctorId:  dr1.id,
        clinicId:  clinicRuiz.id,
        specialty: 'Primary Care',
        status:    InviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 30 * DAY),
      },
    }),
    prisma.careInvite.upsert({
      where:  { code: 'HL-OKFR-2024' },
      update: {},
      create: {
        code:         'HL-OKFR-2024',
        doctorId:     dr2.id,
        clinicId:     clinicOkafor.id,
        specialty:    'Cardiology',
        patientEmail: 'newpatient@example.com',
        status:       InviteStatus.PENDING,
        expiresAt:    new Date(Date.now() + 7 * DAY),
      },
    }),
    prisma.careInvite.upsert({
      where:  { code: 'HL-HIST-ACPT' },
      update: {},
      create: {
        code:      'HL-HIST-ACPT',
        doctorId:  dr2.id,
        clinicId:  clinicOkafor.id,
        specialty: 'Cardiology',
        status:    InviteStatus.ACCEPTED,
        expiresAt: daysAgo(7),
      },
    }),
  ]);

  console.log('✅  3 care invites upserted.');

  // ── 10. NOTIFICATIONS ────────────────────────────────────────────────────

  const notifRows = [
    {
      userId:  dr1User.id,
      type:    NotificationType.CARE_ASSIGNMENT,
      title:   'New patient assigned',
      message: 'Marcus Bell has been added to your roster under Primary Care at Meridian Family Health.',
      read:    false,
      link:    `/doctor/patients/${marcus.id}`,
    },
    {
      userId:  dr1User.id,
      type:    NotificationType.CRITICAL_ALERT,
      title:   'Critical BP alert – Aiko Tanaka',
      message: 'Systolic reading of 178 mmHg recorded. Immediate review recommended.',
      read:    false,
      link:    `/doctor/patients/${aiko.id}`,
    },
    {
      userId:  dr2User.id,
      type:    NotificationType.CARE_ASSIGNMENT,
      title:   'New care assignment',
      message: 'Marcus Bell has been assigned to you under Cardiology.',
      read:    false,
      link:    `/doctor/patients/${marcus.id}`,
    },
    {
      userId:  marcus.userId,
      type:    NotificationType.CARE_ASSIGNMENT,
      title:   'Dr. Okafor added to your care team',
      message: 'Dr. James Okafor (Cardiology) has joined your care team at Okafor Cardiology Centre.',
      read:    false,
      link:    '/patient/profile',
    },
    {
      userId:  marcus.userId,
      type:    NotificationType.VISIT_REQUEST,
      title:   'Appointment confirmed',
      message: 'Dr. Elena Ruiz has confirmed your appointment for next Monday at 10 AM.',
      read:    true,
      link:    '/patient/profile',
    },
  ];

  const notifResult = await prisma.notification.createMany({
    data: notifRows,
    skipDuplicates: true,
  });

  console.log(`✅  ${notifResult.count} notifications created.`);

  // ── 11. MESSAGES (chat per CareAssignment) ───────────────────────────────

  const msgRows = [
    {
      assignmentId: marcusAssign.id,
      senderId:     dr1User.id,
      content:      "Hi Marcus, I've reviewed your latest readings. Your BP is trending higher this week — let's discuss at your next check-in.",
      read:         true,
    },
    {
      assignmentId: marcusAssign.id,
      senderId:     marcus.userId,
      content:      "Thanks Dr. Ruiz. I've been under extra stress at work. Could that be contributing?",
      read:         true,
    },
    {
      assignmentId: marcusAssign.id,
      senderId:     dr1User.id,
      content:      'Absolutely — stress is a significant factor. Try the breathing exercises and log your readings morning and evening this week.',
      read:         true,
    },
    {
      assignmentId: marcusAssign.id,
      senderId:     marcus.userId,
      content:      "Will do! Should I reduce sodium further as well?",
      read:         false, // unread by doctor
    },
    // Cardiology thread – Marcus ↔ Dr. Okafor
    {
      assignmentId: marcusCardio.id,
      senderId:     dr2User.id,
      content:      "Hello Marcus, I'm Dr. Okafor. I'll be monitoring your cardiovascular health alongside Dr. Ruiz. Please book your first cardiology review at your earliest convenience.",
      read:         false,
    },
  ];

  const msgResult = await prisma.message.createMany({
    data: msgRows,
    skipDuplicates: true,
  });

  console.log(`✅  ${msgResult.count} chat messages created.`);

  // ── 12. PATIENT INSIGHTS ─────────────────────────────────────────────────

  await prisma.patientInsight.upsert({
    where:  { patientId: marcus.id },
    update: {},
    create: {
      patientId:   marcus.id,
      narrative:   'Marcus Bell shows a persistent upward trend in systolic blood pressure over the last 30 days. Combined with irregular sleep patterns, clinical intervention within the next 14 days is recommended.',
      riskLevel:   AiRiskLevel.MODERATE,
      trend:       'WORSENING',
      stats:       { avgSystolic: 152, avgDiastolic: 96, avgHeartRate: 83, avgSleep: 6.3 },
      generatedAt: daysAgo(1),
    },
  });

  await prisma.patientInsight.upsert({
    where:  { patientId: aiko.id },
    update: {},
    create: {
      patientId:   aiko.id,
      narrative:   'Aiko Tanaka presents with Stage 2 hypertension indicators. Recent critical threshold breach warrants urgent follow-up. Current medication may need dosage adjustment.',
      riskLevel:   AiRiskLevel.HIGH,
      trend:       'WORSENING',
      stats:       { avgSystolic: 165, avgDiastolic: 106, avgHeartRate: 76, avgSleep: 6.8 },
      generatedAt: daysAgo(1),
    },
  });

  await prisma.patientInsight.upsert({
    where:  { patientId: createdPatients[2].id },
    update: {},
    create: {
      patientId:   createdPatients[2].id,
      narrative:   "Priya Nair's metabolic indicators are responding positively to lifestyle modifications. Fasting glucose trending toward normal range. Continued monitoring recommended.",
      riskLevel:   AiRiskLevel.LOW,
      trend:       'IMPROVING',
      stats:       { avgGlucose: 102, avgSystolic: 119, avgHeartRate: 68, avgSleep: 7.5 },
      generatedAt: daysAgo(1),
    },
  });

  console.log('✅  3 patient insights seeded.');

  // ── Done ─────────────────────────────────────────────────────────────────

  console.log('\n🎉  Full seed complete!\n');
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│              Demo Login Credentials                  │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log('│ DOCTOR 1  doctor@healthlens.demo   / demo1234        │');
  console.log('│ DOCTOR 2  doctor2@healthlens.demo  / demo1234        │');
  console.log('│ PATIENT 1 patient@healthlens.demo  / demo1234        │');
  console.log('│ PATIENT 2 aiko@healthlens.demo     / demo1234        │');
  console.log('│ PATIENT 3 priya@healthlens.demo    / demo1234        │');
  console.log('├─────────────────────────────────────────────────────┤');
  console.log('│ Invite codes: HL-RUIZ-OPEN  |  HL-OKFR-2024         │');
  console.log('└─────────────────────────────────────────────────────┘\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

