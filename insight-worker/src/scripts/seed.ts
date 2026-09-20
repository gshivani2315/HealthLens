import { GlucoseContext, Role } from "@prisma/client";
import { prisma } from "../db";

const DAY = 86_400_000;
const noise = (seed: number, amp: number) => Math.sin(seed * 12.9898) * amp; // deterministic "randomness"

type Gen = (daysAgo: number) => { sys: number; dia: number; glu: number; kg: number; sleep: number };

const patients: Array<{ id: string; name: string; gender: string; dob: string; condition: string; gen: Gen }> = [
  {
    // Scenario 1: normal readings -> no alert
    id: "patient_stable",
    name: "Priya Nair",
    gender: "Female",
    dob: "1981-03-14",
    condition: "Prediabetes",
    gen: (i) => ({ sys: 118 + noise(i, 4), dia: 78 + noise(i + 3, 3), glu: 98 + noise(i + 5, 6), kg: 64 + noise(i, 0.3), sleep: 7.3 + noise(i, 0.5) }),
  },
  {
    // Scenario 3: 16 flat days, then 14 days of steady climb (systolic 122 -> 148, still under the 160 hard limit)
    id: "patient_rising",
    name: "Marcus Bell",
    gender: "Male",
    dob: "1968-04-12",
    condition: "Hypertension Stage 1",
    gen: (i) => {
      const j = i <= 14 ? 14 - i : -1; // 0..13 across the last 14 days
      return {
        sys: j < 0 ? 123 + noise(i, 3) : 122 + j * 2 + noise(i, 1.5),
        dia: j < 0 ? 79 + noise(i + 1, 2) : 78 + j * 1 + noise(i + 1, 1),
        glu: 112 + noise(i + 2, 8),
        kg: 88 + noise(i, 0.4),
        sleep: 6.4 + noise(i, 0.6),
      };
    },
  },
  {
    // Scenario 2: healthy history; you then publish a 172/105 reading
    id: "patient_critical",
    name: "Daniel Osei",
    gender: "Male",
    dob: "1974-09-02",
    condition: "Type 2 Diabetes",
    gen: (i) => ({ sys: 122 + noise(i, 4), dia: 80 + noise(i + 2, 3), glu: 118 + noise(i + 4, 9), kg: 92 + noise(i, 0.4), sleep: 6.8 + noise(i, 0.5) }),
  },
];

async function main() {
  const doctorUser = await prisma.user.upsert({
    where: { email: "doctor@healthlens.demo" },
    update: {},
    create: {
      email: "doctor@healthlens.demo",
      password: "SEED_ONLY_NOT_A_REAL_HASH",
      name: "Dr. Elena Ruiz",
      role: Role.DOCTOR,
      doctor: { create: { clinicName: "Meridian Family Health" } },
    },
    include: { doctor: true },
  });
  const doctorId = doctorUser.doctor!.id;

  for (const p of patients) {
    await prisma.user.upsert({
      where: { email: `${p.id}@healthlens.demo` },
      update: {},
      create: {
        email: `${p.id}@healthlens.demo`,
        password: "SEED_ONLY_NOT_A_REAL_HASH",
        name: p.name,
        role: Role.PATIENT,
        patient: {
          create: {
            id: p.id,
            doctorId,
            doctorAssignedAt: new Date(),
            gender: p.gender,
            dateOfBirth: new Date(p.dob),
            conditions: { create: [{ label: p.condition }] },
            threshold: { create: {} }, // default thresholds
          },
        },
      },
    });

    await prisma.vital.deleteMany({ where: { patientId: p.id } });
    const rows = [];
    for (let i = 30; i >= 1; i--) {
      const v = p.gen(i);
      const at = new Date(Date.now() - i * DAY);
      at.setUTCHours(3, 0, 0, 0);
      rows.push({
        patientId: p.id,
        systolic: Math.round(v.sys),
        diastolic: Math.round(v.dia),
        glucose: Math.round(v.glu),
        glucoseContext: i % 2 === 0 ? GlucoseContext.FASTING : GlucoseContext.POST_MEAL,
        weightKg: Math.round(v.kg * 10) / 10,
        sleepHours: Math.round(v.sleep * 2) / 2,
        recordedAt: at,
      });
    }
    await prisma.vital.createMany({ data: rows });
    await prisma.patient.update({ where: { id: p.id }, data: { lastReadingAt: rows[rows.length - 1].recordedAt } });
    console.log(`Seeded ${p.id}: ${rows.length} readings`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
