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
    },
    {
      id: 'pat_002',
      email: 'aiko@healthlens.demo',
      name: 'Aiko Tanaka',
      gender: 'Female',
      dob: '1961-08-22',
      condition: 'Hypertension Stage 2',
      phone: '+1 (555) 203-9944',
    },
    {
      id: 'pat_003',
      email: 'priya@healthlens.demo',
      name: 'Priya Nair',
      gender: 'Female',
      dob: '1981-03-14',
      condition: 'Prediabetes',
      phone: '+1 (555) 304-1188',
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
    } else {
      console.log(`ℹ️ Patient ${p.email} already has vitals`);
    }
  }

  console.log('🎉 Database seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

