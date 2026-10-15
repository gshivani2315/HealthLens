import bcrypt from 'bcrypt';
import { GlucoseContext, Role } from '@prisma/client';
import { prisma } from '../src/db';

const DAY = 86_400_000;
const noise = (seed: number, amp: number) => Math.sin(seed * 12.9898) * amp;

async function main() {
  console.log('🌱 Seeding database...');

  const hashedPassword = await bcrypt.hash('demo1234', 10);

  // 1. Doctor
  const doctorUser = await prisma.user.upsert({
    where: { email: 'doctor@healthlens.demo' },
    update: { password: hashedPassword },
    create: {
      email: 'doctor@healthlens.demo',
      password: hashedPassword,
      name: 'Dr. Elena Ruiz',
      role: Role.DOCTOR,
      doctor: {
        create: {
          clinicName: 'Meridian Family Health',
          phone: '+1 (555) 019-2231',
        },
      },
    },
    include: { doctor: true },
  });

  const doctorId = doctorUser.doctor!.id;
  console.log(`✅ Doctor ready: ${doctorUser.email} (id: ${doctorId})`);

  // 2. Patients linked to this Doctor
  const patients = [
    {
      id: 'pat_001',
      email: 'patient@healthlens.demo',
      name: 'Marcus Bell',
      gender: 'Male',
      dob: '1968-04-12',
      condition: 'Hypertension Stage 1',
      phone: '+1 (555) 402-8871',
      summaries: [
        {
          weekOffset: 0,
          narrative:
            "Your blood pressure has remained slightly elevated this week, averaging 148/94. Sleep improved by about 1 hour compared to last week — that's a good sign for the days ahead.",
          takeaways: [
            'Discuss the recent systolic rise with Dr. Ruiz at your next check-in.',
            'Continue prioritizing consistent bedtime schedules.',
            'Maintain lower dietary sodium intake on weekdays.',
          ],
          trend: 'STABLE',
        },
        {
          weekOffset: 1,
          narrative:
            'Blood glucose levels improved by 6% compared to the prior week. Blood pressure stayed roughly flat. Weight is trending down slowly and steadily.',
          takeaways: [
            'Meal timing consistency is showing positive impact on fasting numbers.',
            'Keep logging readings at the same morning hour every day.',
          ],
          trend: 'IMPROVING',
        },
        {
          weekOffset: 2,
          narrative:
            'Steady progress noted across all cardiovascular metrics. Systolic readings hovered around 144 mmHg with no critical spikes.',
          takeaways: [
            'Daily walking routine is helping baseline resting heart rate.',
            'Continue limiting caffeine intake after 4 PM.',
          ],
          trend: 'STABLE',
        },
        {
          weekOffset: 3,
          narrative:
            'Initial baseline established. Early readings demonstrated mild stage 1 hypertension patterns with excellent overall logging adherence.',
          takeaways: [
            'Baseline profile initialized in coordination with Meridian Family Health.',
            'Maintain daily logging cadence.',
          ],
          trend: 'STABLE',
        },
      ],
    },
    {
      id: 'pat_002',
      email: 'aiko@healthlens.demo',
      name: 'Aiko Tanaka',
      gender: 'Female',
      dob: '1961-08-22',
      condition: 'Hypertension Stage 2',
      phone: '+1 (555) 203-9944',
      summaries: [
        {
          weekOffset: 0,
          narrative:
            'Systolic averages maintained around 134 mmHg this week. Post-meal glucose values were stable within expected thresholds.',
          takeaways: [
            'Continue prescribed morning medication adherence.',
            'Keep tracking post-dinner readings to monitor evening stability.',
          ],
          trend: 'STABLE',
        },
        {
          weekOffset: 1,
          narrative:
            'Notable reduction in systolic variance compared to baseline. Sleep duration averaged 6.8 hours with consistent bedtime.',
          takeaways: [
            'Current lifestyle modifications are demonstrating favorable control.',
            'Continue regular hydration throughout the day.',
          ],
          trend: 'IMPROVING',
        },
        {
          weekOffset: 2,
          narrative:
            'Mild morning blood pressure elevations recorded on two consecutive days, resolving by midday.',
          takeaways: [
            'Monitor morning stress levels and ensure adequate breakfast timing.',
            'Discuss morning readings with Dr. Ruiz.',
          ],
          trend: 'STABLE',
        },
        {
          weekOffset: 3,
          narrative:
            'First monthly evaluation established. Overall stability maintained across all primary cardiovascular indicators.',
          takeaways: [
            'Excellent compliance with remote monitoring program.',
            'Maintain steady physical activity levels.',
          ],
          trend: 'STABLE',
        },
      ],
    },
    {
      id: 'pat_003',
      email: 'priya@healthlens.demo',
      name: 'Priya Nair',
      gender: 'Female',
      dob: '1981-03-14',
      condition: 'Prediabetes',
      phone: '+1 (555) 304-1188',
      summaries: [
        {
          weekOffset: 0,
          narrative:
            'Fasting blood glucose averaged 101 mg/dL this week, showing steady management within target limits. Blood pressure remains optimal at 118/76.',
          takeaways: [
            'Fiber-rich meals continue to smooth post-meal glucose spikes.',
            'Physical activity goals met on 5 out of 7 days.',
          ],
          trend: 'IMPROVING',
        },
        {
          weekOffset: 1,
          narrative:
            'Glucose stability has improved by 4% compared to two weeks ago. Resting heart rate and sleep patterns remain excellent.',
          takeaways: [
            'Continue balanced carbohydrate distribution across daily meals.',
            'Keep up current evening walking routine.',
          ],
          trend: 'IMPROVING',
        },
        {
          weekOffset: 2,
          narrative:
            'Very consistent readings throughout the week. Blood pressure and glucose values tracked within normal healthy ranges.',
          takeaways: [
            'Healthy lifestyle adjustments showing sustained positive results.',
            'Continue logging at regular morning hours.',
          ],
          trend: 'STABLE',
        },
        {
          weekOffset: 3,
          narrative:
            'Initial monitoring period completed with outstanding compliance and healthy metabolic baseline.',
          takeaways: [
            'Baseline parameters documented and approved by Dr. Ruiz.',
            'Maintain weekly vitals check-ins.',
          ],
          trend: 'STABLE',
        },
      ],
    },
  ];

  for (const p of patients) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: { password: hashedPassword },
      create: {
        email: p.email,
        password: hashedPassword,
        name: p.name,
        role: Role.PATIENT,
        patient: {
          create: {
            id: p.id,
            doctorId,
            doctorAssignedAt: new Date('2024-11-03'),
            gender: p.gender,
            phone: p.phone,
            dateOfBirth: new Date(p.dob),
            conditions: { create: [{ label: p.condition }] },
            threshold: { create: {} },
          },
        },
      },
      include: { patient: true },
    });

    const patientId = user.patient?.id || p.id;

    // Seed 30 days of readings if none exist
    const count = await prisma.vital.count({ where: { patientId } });
    if (count === 0) {
      const rows = [];
      for (let i = 30; i >= 1; i--) {
        const at = new Date(Date.now() - i * DAY);
        at.setUTCHours(3, 0, 0, 0);
        rows.push({
          patientId,
          systolic: Math.round(135 + noise(i, 8)),
          diastolic: Math.round(85 + noise(i + 1, 5)),
          glucose: Math.round(110 + noise(i + 2, 10)),
          glucoseContext: i % 2 === 0 ? GlucoseContext.FASTING : GlucoseContext.POST_MEAL,
          weightKg: Math.round((75 + noise(i, 0.8)) * 10) / 10,
          sleepHours: Math.round((7 + noise(i, 0.5)) * 2) / 2,
          recordedAt: at,
        });
      }
      await prisma.vital.createMany({ data: rows });
      await prisma.patient.update({
        where: { id: patientId },
        data: { lastReadingAt: rows[rows.length - 1].recordedAt },
      });
      console.log(`✅ Seeded ${rows.length} vitals for patient ${p.email}`);
    }

    // Seed 4 weeks of WeeklySummary rows idempotently
    for (const s of p.summaries) {
      const weekStart = new Date(Date.now() - (s.weekOffset + 1) * 7 * DAY);
      weekStart.setUTCHours(12, 0, 0, 0);
      const weekEnd = new Date(Date.now() - s.weekOffset * 7 * DAY);
      weekEnd.setUTCHours(12, 0, 0, 0);

      await prisma.weeklySummary.upsert({
        where: {
          patientId_weekStart: {
            patientId,
            weekStart,
          },
        },
        update: {
          weekEnd,
          narrative: s.narrative,
          takeaways: s.takeaways,
          trend: s.trend,
        },
        create: {
          patientId,
          weekStart,
          weekEnd,
          narrative: s.narrative,
          takeaways: s.takeaways,
          trend: s.trend,
        },
      });
    }
    console.log(`✅ Seeded 4 weekly summaries for patient ${p.email}`);
  }

  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
