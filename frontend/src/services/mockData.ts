// ---------------------------------------------------------------------------
// In-memory mock data + generators. Only used while VITE_USE_MOCKS=true.
// Nothing here is imported by real API service calls once mocks are off.
// ---------------------------------------------------------------------------

import {
  AlertItem,
  ChronicCondition,
  Doctor,
  PatientProfile,
  PatientRosterRow,
  ThresholdConfig,
  VitalsEntry,
  WeeklySummary,
} from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDaysAgo(days: number, hour = 8): string {
  const d = new Date(Date.now() - days * DAY_MS);
  d.setHours(hour, Math.floor(Math.random() * 40), 0, 0);
  return d.toISOString();
}

function seededWiggle(base: number, amplitude: number, seed: number): number {
  return base + Math.sin(seed / 3) * amplitude + (Math.sin(seed * 1.7) * amplitude) / 3;
}

export const mockDoctor: Doctor = {
  id: "doc_001",
  name: "Dr. Elena Ruiz",
  clinicName: "Meridian Family Health",
  phone: "+1 (555) 019-2231",
  email: "e.ruiz@meridianhealth.example",
  assignedDate: "2024-11-03",
};

export const mockDoctors: Record<string, Doctor> = {
  doc_001: mockDoctor,
};

export function registerDoctorMock(doctor: Doctor) {
  mockDoctors[doctor.id] = doctor;
}

export function getDoctorById(id?: string): Doctor {
  if (id && mockDoctors[id]) return mockDoctors[id];
  return mockDoctor;
}

const conditionsA: ChronicCondition[] = [
  { id: "c1", label: "Hypertension Stage 1" },
  { id: "c2", label: "Type 2 Diabetes" },
];
const conditionsB: ChronicCondition[] = [{ id: "c3", label: "Prediabetes" }];
const conditionsC: ChronicCondition[] = [{ id: "c4", label: "Hypertension Stage 2" }];

export const mockPatientProfile: PatientProfile = {
  id: "pat_001",
  doctorId: "doc_001",
  name: "Marcus Bell",
  dateOfBirth: "1968-04-12",
  age: 57,
  gender: "Male",
  phone: "+1 (555) 402-8871",
  email: "marcus.bell@example.com",
  conditions: conditionsA,
  doctor: mockDoctor,
};

interface RosterSeed {
  id: string;
  doctorId: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  age: number;
  gender: string;
  conditions: ChronicCondition[];
  base: { sys: number; dia: number; glu: number; weight: number; sleep: number };
  risk: "normal" | "moderate" | "critical";
}

let rosterSeeds: RosterSeed[] = [
  { id: "pat_001", doctorId: "doc_001", name: "Marcus Bell", email: "marcus.bell@example.com", phone: "+1 (555) 402-8871", dateOfBirth: "1968-04-12", age: 57, gender: "Male", conditions: conditionsA, base: { sys: 148, dia: 94, glu: 152, weight: 88, sleep: 6.2 }, risk: "critical" },
  { id: "pat_002", doctorId: "doc_001", name: "Aiko Tanaka", email: "aiko.tanaka@example.com", phone: "+1 (555) 402-8872", dateOfBirth: "1962-09-18", age: 63, gender: "Female", conditions: conditionsC, base: { sys: 132, dia: 84, glu: 110, weight: 71, sleep: 6.8 }, risk: "moderate" },
  { id: "pat_003", doctorId: "doc_001", name: "Priya Nair", email: "priya.nair@example.com", phone: "+1 (555) 402-8873", dateOfBirth: "1980-01-22", age: 45, gender: "Female", conditions: conditionsB, base: { sys: 118, dia: 76, glu: 101, weight: 64, sleep: 7.4 }, risk: "normal" },
  { id: "pat_004", doctorId: "doc_001", name: "Daniel Osei", email: "daniel.osei@example.com", phone: "+1 (555) 402-8874", dateOfBirth: "1974-06-30", age: 51, gender: "Male", conditions: conditionsA, base: { sys: 126, dia: 80, glu: 118, weight: 92, sleep: 6.5 }, risk: "moderate" },
  { id: "pat_005", doctorId: "doc_001", name: "Helen Cho", email: "helen.cho@example.com", phone: "+1 (555) 402-8875", dateOfBirth: "1955-11-05", age: 70, gender: "Female", conditions: conditionsC, base: { sys: 121, dia: 78, glu: 96, weight: 58, sleep: 7.1 }, risk: "normal" },
  { id: "pat_006", doctorId: "doc_001", name: "Tobias Reyes", email: "tobias.reyes@example.com", phone: "+1 (555) 402-8876", dateOfBirth: "1986-03-14", age: 39, gender: "Male", conditions: conditionsB, base: { sys: 116, dia: 74, glu: 99, weight: 76, sleep: 7.6 }, risk: "normal" },
];

export function generateVitalsHistory(patientId: string, days = 90): VitalsEntry[] {
  const seed = rosterSeeds.find((r) => r.id === patientId) ?? rosterSeeds[0];
  const entries: VitalsEntry[] = [];
  for (let i = days; i >= 0; i--) {
    const drift = (days - i) / days;
    entries.push({
      id: `${patientId}_vit_${i}`,
      patientId,
      recordedAt: isoDaysAgo(i),
      systolic: Math.round(seededWiggle(seed.base.sys - drift * 6, 6, i)),
      diastolic: Math.round(seededWiggle(seed.base.dia - drift * 4, 4, i + 5)),
      glucose: Math.round(seededWiggle(seed.base.glu - drift * 10, 10, i + 2)),
      glucoseContext: i % 2 === 0 ? "fasting" : "post_meal",
      weightKg: Number(seededWiggle(seed.base.weight - drift * 1.5, 0.6, i + 8).toFixed(1)),
      sleepHours: Number(seededWiggle(seed.base.sleep + drift * 0.6, 0.8, i + 3).toFixed(1)),
    });
  }
  return entries;
}

export function getRoster(doctorId?: string): PatientRosterRow[] {
  let list = rosterSeeds;
  if (doctorId) {
    list = rosterSeeds.filter((s) => s.doctorId === doctorId);
  }
  return list.map((s) => {
    const latest = generateVitalsHistory(s.id, 1)[1] ?? generateVitalsHistory(s.id, 1)[0];
    return {
      id: s.id,
      doctorId: s.doctorId,
      name: s.name,
      email: s.email,
      phone: s.phone,
      dateOfBirth: s.dateOfBirth,
      age: s.age,
      gender: s.gender,
      primaryCondition: s.conditions[0]?.label ?? "—",
      conditions: s.conditions,
      latestBloodPressure: { systolic: latest.systolic!, diastolic: latest.diastolic! },
      latestGlucose: latest.glucose!,
      riskStatus: s.risk,
      lastReadingAt: latest.recordedAt,
    };
  });
}

function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const diffMs = Date.now() - dob.getTime();
  const ageDt = new Date(diffMs);
  return Math.abs(ageDt.getUTCFullYear() - 1970) || 40;
}

export function createPatientMock(
  payload: import("@/types").CreatePatientPayload,
  doctorId = "doc_001"
): PatientRosterRow {
  const newId = `pat_${Date.now()}`;
  const age = calculateAge(payload.dateOfBirth);
  const conditions: ChronicCondition[] = (payload.conditions || []).map((label, idx) => ({
    id: `c_${Date.now()}_${idx}`,
    label,
  }));
  if (conditions.length === 0) {
    conditions.push({ id: `c_${Date.now()}_0`, label: "General Monitoring" });
  }

  const newSeed: RosterSeed = {
    id: newId,
    doctorId,
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    dateOfBirth: payload.dateOfBirth,
    age,
    gender: payload.gender || "Other",
    conditions,
    base: {
      sys: payload.initialSystolic || 120,
      dia: payload.initialDiastolic || 80,
      glu: payload.initialGlucose || 95,
      weight: payload.initialWeightKg || 70,
      sleep: payload.initialSleepHours || 7,
    },
    risk: payload.riskStatus || "normal",
  };

  rosterSeeds.unshift(newSeed);

  mockThresholds[newId] = {
    patientId: newId,
    systolicMax: 160,
    diastolicMax: 100,
    glucoseFastingMax: 130,
    glucoseFastingMin: 70,
    glucosePostMealMax: 180,
    weightDeltaKg: 2,
    weightDeltaDays: 7,
  };

  const latest = generateVitalsHistory(newId, 1)[1] ?? generateVitalsHistory(newId, 1)[0];
  return {
    id: newId,
    doctorId,
    name: newSeed.name,
    email: newSeed.email,
    phone: newSeed.phone,
    dateOfBirth: newSeed.dateOfBirth,
    age: newSeed.age,
    gender: newSeed.gender,
    primaryCondition: newSeed.conditions[0]?.label ?? "—",
    conditions: newSeed.conditions,
    latestBloodPressure: { systolic: latest.systolic!, diastolic: latest.diastolic! },
    latestGlucose: latest.glucose!,
    riskStatus: newSeed.risk,
    lastReadingAt: latest.recordedAt,
  };
}

export function updatePatientMock(
  patientId: string,
  updates: import("@/types").UpdatePatientPayload
): PatientProfile {
  const seed = rosterSeeds.find((r) => r.id === patientId);
  if (!seed) throw new Error("Patient not found");

  if (updates.name) seed.name = updates.name;
  if (updates.email) seed.email = updates.email;
  if (updates.phone) seed.phone = updates.phone;
  if (updates.gender) seed.gender = updates.gender;
  if (updates.dateOfBirth) {
    seed.dateOfBirth = updates.dateOfBirth;
    seed.age = calculateAge(updates.dateOfBirth);
  }
  if (updates.riskStatus) seed.risk = updates.riskStatus;
  if (updates.conditions) {
    seed.conditions = updates.conditions.map((lbl, idx) => ({
      id: `c_${patientId}_${idx}`,
      label: lbl,
    }));
  }

  return getPatientProfileById(patientId);
}

export function deletePatientMock(patientId: string): void {
  const idx = rosterSeeds.findIndex((r) => r.id === patientId);
  if (idx !== -1) {
    rosterSeeds.splice(idx, 1);
  }
  delete mockThresholds[patientId];
  // Remove related alerts
  for (let i = mockAlerts.length - 1; i >= 0; i--) {
    if (mockAlerts[i].patientId === patientId) {
      mockAlerts.splice(i, 1);
    }
  }
}

export function getPatientProfileById(id: string): PatientProfile {
  const seed = rosterSeeds.find((r) => r.id === id) ?? rosterSeeds[0];
  const doc = getDoctorById(seed.doctorId);
  return {
    id: seed.id,
    doctorId: seed.doctorId,
    name: seed.name,
    dateOfBirth: seed.dateOfBirth || "1968-04-12",
    age: seed.age,
    gender: seed.gender,
    phone: seed.phone || "+1 (555) 402-8871",
    email: seed.email || `${seed.name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    conditions: seed.conditions,
    doctor: doc,
  };
}

export const mockAlerts: AlertItem[] = [
  {
    id: "al_001",
    patientId: "pat_001",
    patientName: "Marcus Bell",
    type: "threshold",
    severity: "critical",
    status: "unread",
    triggerLabel: "Threshold: BP > 160/100",
    detail: "Reading of 164/102 mmHg recorded this morning.",
    triggeredAt: isoDaysAgo(0, 7),
  },
  {
    id: "al_002",
    patientId: "pat_001",
    patientName: "Marcus Bell",
    type: "ai_pattern",
    severity: "caution",
    status: "unread",
    triggerLabel: "AI Pattern: 21-day continuous rise",
    detail: "Systolic pressure has trended upward for 21 consecutive days.",
    triggeredAt: isoDaysAgo(1, 9),
  },
  {
    id: "al_003",
    patientId: "pat_002",
    patientName: "Aiko Tanaka",
    type: "threshold",
    severity: "caution",
    status: "acknowledged",
    triggerLabel: "Threshold: Fasting glucose > 130 mg/dL",
    detail: "Fasting reading of 134 mg/dL.",
    triggeredAt: isoDaysAgo(2, 8),
    clinicalNote: "Discussed diet adjustment during call.",
  },
  {
    id: "al_004",
    patientId: "pat_004",
    patientName: "Daniel Osei",
    type: "ai_pattern",
    severity: "info",
    status: "resolved",
    triggerLabel: "AI Pattern: Weight fluctuation stabilized",
    detail: "Weight has returned to baseline after prior 2.4kg swing.",
    triggeredAt: isoDaysAgo(5, 11),
  },
  {
    id: "al_005",
    patientId: "pat_003",
    patientName: "Priya Nair",
    type: "threshold",
    severity: "info",
    status: "resolved",
    triggerLabel: "Missed reading reminder sent",
    triggeredAt: isoDaysAgo(6, 14),
  },
];

export function getAlertsForPatient(patientId: string): AlertItem[] {
  return mockAlerts.filter((a) => a.patientId === patientId);
}

export const mockWeeklySummaries: WeeklySummary[] = [
  {
    id: "sum_001",
    patientId: "pat_001",
    weekStart: isoDaysAgo(7),
    weekEnd: isoDaysAgo(0),
    generatedAt: isoDaysAgo(0, 6),
    narrative:
      "Your blood pressure has remained elevated this week, averaging 148/94. Sleep improved by about 1 hour compared to last week, which is a good sign — keep prioritizing consistent bedtimes.",
    takeaways: [
      "Discuss the recent systolic rise with Dr. Ruiz at your next check-in.",
      "Continue the earlier bedtime routine that improved your sleep.",
      "Reduce added sodium — three readings this week followed high-sodium meals.",
    ],
  },
  {
    id: "sum_002",
    patientId: "pat_001",
    weekStart: isoDaysAgo(14),
    weekEnd: isoDaysAgo(7),
    generatedAt: isoDaysAgo(7, 6),
    narrative:
      "Blood glucose levels improved by 6% compared to the prior week. Blood pressure stayed roughly flat. Weight is trending down slowly and steadily.",
    takeaways: [
      "Whatever changed with meal timing this week is working — keep it up.",
      "Continue logging vitals daily; consistency is helping the model give clearer trends.",
    ],
  },
  {
    id: "sum_001b",
    patientId: "pat_001",
    weekStart: isoDaysAgo(21),
    weekEnd: isoDaysAgo(14),
    generatedAt: isoDaysAgo(14, 6),
    narrative:
      "Blood pressure and resting heart rate showed minor elevation during evening hours. Morning fasting glucose was well-controlled at 98 mg/dL.",
    takeaways: [
      "Maintain consistent fluid intake and evening relaxation routine.",
      "Monitor evening blood pressure before and after dinner.",
    ],
  },
  {
    id: "sum_001c",
    patientId: "pat_001",
    weekStart: isoDaysAgo(28),
    weekEnd: isoDaysAgo(21),
    generatedAt: isoDaysAgo(21, 6),
    narrative:
      "Initial baseline period. Average systolic 142 mmHg with stable sleep duration averaging 6.7 hours per night.",
    takeaways: [
      "Baseline vitals captured. Begin regular daily log entries.",
      "Continue prescribed routine.",
    ],
  },
  {
    id: "sum_003",
    patientId: "pat_002",
    weekStart: isoDaysAgo(7),
    weekEnd: isoDaysAgo(0),
    generatedAt: isoDaysAgo(0, 6),
    narrative:
      "Systolic averages maintained around 134 mmHg this week. Post-meal glucose values were stable within expected thresholds with good compliance.",
    takeaways: [
      "Continue prescribed morning medication adherence.",
      "Keep tracking post-dinner readings to monitor evening stability.",
    ],
  },
  {
    id: "sum_004",
    patientId: "pat_002",
    weekStart: isoDaysAgo(14),
    weekEnd: isoDaysAgo(7),
    generatedAt: isoDaysAgo(7, 6),
    narrative:
      "Notable reduction in systolic variance compared to baseline. Sleep duration averaged 6.8 hours with consistent bedtime.",
    takeaways: [
      "Current lifestyle modifications are demonstrating favorable control.",
      "Continue regular hydration throughout the day.",
    ],
  },
  {
    id: "sum_004b",
    patientId: "pat_002",
    weekStart: isoDaysAgo(21),
    weekEnd: isoDaysAgo(14),
    generatedAt: isoDaysAgo(14, 6),
    narrative:
      "Blood pressure trended slightly lower this week, averaging 132/84. Fasting glucose remained stable.",
    takeaways: [
      "Consistent morning routine is supporting healthy readings.",
      "Maintain active walking sessions during weekdays.",
    ],
  },
  {
    id: "sum_004c",
    patientId: "pat_002",
    weekStart: isoDaysAgo(28),
    weekEnd: isoDaysAgo(21),
    generatedAt: isoDaysAgo(21, 6),
    narrative:
      "Baseline monitoring initialized. Compliance was high with 7 of 7 days logged accurately.",
    takeaways: [
      "Initial parameters logged and shared with Dr. Ruiz.",
      "Keep tracking vitals each morning.",
    ],
  },
  {
    id: "sum_005",
    patientId: "pat_003",
    weekStart: isoDaysAgo(7),
    weekEnd: isoDaysAgo(0),
    generatedAt: isoDaysAgo(0, 6),
    narrative:
      "Fasting blood glucose averaged 101 mg/dL this week, showing steady management within target limits. Blood pressure remains optimal at 118/76.",
    takeaways: [
      "Fiber-rich meals continue to smooth post-meal glucose spikes.",
      "Physical activity goals met on 5 out of 7 days.",
    ],
  },
  {
    id: "sum_006",
    patientId: "pat_003",
    weekStart: isoDaysAgo(14),
    weekEnd: isoDaysAgo(7),
    generatedAt: isoDaysAgo(7, 6),
    narrative:
      "Glucose stability has improved by 4% compared to two weeks ago. Resting heart rate and sleep patterns remain excellent.",
    takeaways: [
      "Continue balanced carbohydrate distribution across daily meals.",
      "Keep up current evening walking routine.",
    ],
  },
  {
    id: "sum_006b",
    patientId: "pat_003",
    weekStart: isoDaysAgo(21),
    weekEnd: isoDaysAgo(14),
    generatedAt: isoDaysAgo(14, 6),
    narrative:
      "Very consistent readings throughout the week. Blood pressure and glucose values tracked within normal healthy ranges.",
    takeaways: [
      "Healthy lifestyle adjustments showing sustained positive results.",
      "Continue logging at regular morning hours.",
    ],
  },
  {
    id: "sum_006c",
    patientId: "pat_003",
    weekStart: isoDaysAgo(28),
    weekEnd: isoDaysAgo(21),
    generatedAt: isoDaysAgo(21, 6),
    narrative:
      "Initial monitoring period completed with outstanding compliance and healthy metabolic baseline.",
    takeaways: [
      "Baseline parameters documented and approved by Dr. Ruiz.",
      "Maintain weekly vitals check-ins.",
    ],
  },
];

export function getSummariesForPatient(patientId: string): WeeklySummary[] {
  return mockWeeklySummaries.filter((s) => s.patientId === patientId);
}

export const mockThresholds: Record<string, ThresholdConfig> = Object.fromEntries(
  rosterSeeds.map((s) => [
    s.id,
    {
      patientId: s.id,
      systolicMax: 160,
      diastolicMax: 100,
      glucoseFastingMax: 130,
      glucoseFastingMin: 70,
      glucosePostMealMax: 180,
      weightDeltaKg: 2,
      weightDeltaDays: 7,
    },
  ])
);
