import 'dotenv/config';
import {
  AiRiskLevel,
  AlertSeverity,
  AlertStatus,
  AlertType,
  AssignmentStatus,
  GlucoseContext,
  InviteStatus,
  NotificationType,
  Prisma,
  RiskStatus,
  Role,
} from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '../src/db';

// ─────────────────────────── Config ───────────────────────────

const DEMO_PASSWORD = 'demo1234';
const MANAGED = 'SUPABASE_MANAGED_AUTH';
const DAY = 86_400_000;
const DAYS_OF_DATA = 45;
const NOW = Date.now();

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Mirrors the schema defaults on PatientThreshold
const DEFAULT_THRESHOLD = {
  systolicMax: 160,
  diastolicMax: 100,
  glucoseFastingMax: 130,
  glucoseFastingMin: 70,
  glucosePostMealMax: 180,
  weightDeltaKg: 2,
  weightDeltaDays: 7,
  heartRateMax: 120,
  heartRateMin: 50,
};

// ─────────────────────────── Clinics & doctors ───────────────────────────

const CLINICS = {
  meridian: {
    id: 'clinic_meridian',
    name: 'Meridian Family Health',
    phone: '+1 (555) 019-2231',
    address: '214 Harbor Ave, Suite 300',
  },
  riverside: {
    id: 'clinic_riverside',
    name: 'Riverside Heart & Vascular',
    phone: '+1 (555) 019-7740',
    address: '88 Riverside Dr, Suite 5',
  },
};

type DocKey = 'ruiz' | 'okafor';

const DOCTORS: {
  key: DocKey;
  email: string;
  name: string;
  clinic: keyof typeof CLINICS;
  specialty: string;
  phone: string;
}[] = [
  {
    key: 'ruiz',
    email: 'doctor@healthlens.demo',
    name: 'Dr. Elena Ruiz',
    clinic: 'meridian',
    specialty: 'General Practice',
    phone: '+1 (555) 019-2231',
  },
  {
    key: 'okafor',
    email: 'doctor2@healthlens.demo',
    name: 'Dr. James Okafor',
    clinic: 'riverside',
    specialty: 'Cardiology',
    phone: '+1 (555) 019-7740',
  },
];

// ─────────────────────────── Patient profiles ───────────────────────────

type PatientProfile = {
  key: string;
  email: string;
  name: string;
  gender: string;
  dob: string;
  phone: string;
  doctor: DocKey;
  conditions: string[];
  base: { sys: number; dia: number; glucose: number; weight: number; sleep: number; hr: number };
  drift: { sys: number; glucose: number; weight: number; hr: number }; // change per day
  spikeChance: number;
  threshold?: Partial<typeof DEFAULT_THRESHOLD>;
  insight: { riskLevel: AiRiskLevel; trend: string; narrative: string };
  aiPattern?: { severity: AlertSeverity; status: AlertStatus; label: string; rationale: string };
  followUp?: { note: string };
  takeaways: string[];
  chat: [ 'doctor' | 'patient', string ][];
};

const PATIENTS: PatientProfile[] = [
  {
    key: 'marcus',
    email: 'patient@healthlens.demo',
    name: 'Marcus Bell',
    gender: 'Male',
    dob: '1968-04-12',
    phone: '+1 (555) 402-8871',
    doctor: 'ruiz',
    conditions: ['Hypertension Stage 1', 'Hyperlipidemia'],
    base: { sys: 146, dia: 93, glucose: 112, weight: 96.4, sleep: 6.4, hr: 76 },
    drift: { sys: -0.08, glucose: -0.05, weight: -0.02, hr: -0.02 },
    spikeChance: 0.12,
    insight: {
      riskLevel: AiRiskLevel.MODERATE,
      trend: 'Gradual improvement',
      narrative:
        'Morning systolic pressure has come down roughly 3 to 4 mmHg over the last six weeks, and fasting glucose is drifting lower. Intermittent readings above 160 systolic still occur, so the regimen is working but not yet fully controlled. Sleep under 6.5 hours is the most consistent companion of elevated mornings.',
    },
    aiPattern: {
      severity: AlertSeverity.CAUTION,
      status: AlertStatus.UNREAD,
      label: 'AI pattern: sustained downward systolic trend',
      rationale:
        'Morning systolic has trended down about 3.5 mmHg across six weeks. Readings above 160 have become less frequent, though not yet absent.',
    },
    takeaways: [
      'Keep bedtime within 30 minutes of the same time each night.',
      'Aim for under 2,000 mg of sodium per day on weekdays.',
      'Walk for 20 minutes after dinner on most days.',
      'Log readings at the same morning hour, seated, after 5 minutes of rest.',
      'Bring the home log to your next visit with Dr. Ruiz.',
    ],
    chat: [
      ['doctor', 'Hi Marcus, your fasting numbers look better this month. How are you feeling on the new routine?'],
      ['patient', 'Thanks, Dr. Ruiz. Feeling steadier. Still getting a few high mornings though.'],
      ['doctor', 'That is common in the first few weeks. Are you still taking the morning dose at the same time?'],
      ['patient', 'Yes, 7am with coffee. Sleep has been better since I moved my phone out of the bedroom.'],
      ['doctor', 'Good, keep that up. Send me the log before your visit on the 14th and we will review it together.'],
      ['patient', 'Will do. Thank you.'],
    ],
  },
  {
    key: 'aiko',
    email: 'patient2@healthlens.demo',
    name: 'Aiko Tanaka',
    gender: 'Female',
    dob: '1961-08-22',
    phone: '+1 (555) 203-9944',
    doctor: 'ruiz',
    conditions: ['Hypertension Stage 2', 'Osteoarthritis'],
    base: { sys: 136, dia: 85, glucose: 104, weight: 68.2, sleep: 6.8, hr: 72 },
    drift: { sys: -0.04, glucose: 0, weight: 0, hr: 0 },
    spikeChance: 0.15,
    threshold: { systolicMax: 150, diastolicMax: 95 },
    insight: {
      riskLevel: AiRiskLevel.LOW,
      trend: 'Stable with occasional morning elevations',
      narrative:
        'Systolic variance has narrowed since the start of the monitoring window, and most readings sit in the mid 130s. Morning spikes appear a few times a month and resolve by midday. Adherence to the morning medication schedule looks consistent.',
    },
    aiPattern: {
      severity: AlertSeverity.INFO,
      status: AlertStatus.ACKNOWLEDGED,
      label: 'AI pattern: narrowing systolic variance',
      rationale:
        'Day-to-day systolic variance is lower than it was in the first two weeks. This reflects improved control rather than new risk.',
    },
    takeaways: [
      'Continue your morning medication at the same time each day.',
      'Take readings at least 30 minutes after waking and before breakfast.',
      'Keep up the daily gentle walking routine.',
      'Stay hydrated through the day, especially in warm weather.',
    ],
    chat: [
      ['doctor', 'Aiko, your variance has narrowed nicely. The morning spikes are worth watching, though.'],
      ['patient', 'Thank you. I have been trying to take the readings after my tea, not before. Is that right?'],
      ['doctor', 'Yes, that is exactly right. Keep doing that and we will look at the averages at your monthly visit.'],
      ['patient', 'Perfect. I will keep going.'],
    ],
  },
  {
    key: 'priya',
    email: 'patient3@healthlens.demo',
    name: 'Priya Nair',
    gender: 'Female',
    dob: '1981-03-14',
    phone: '+1 (555) 304-1188',
    doctor: 'ruiz',
    conditions: ['Prediabetes', 'Vitamin D deficiency'],
    base: { sys: 118, dia: 76, glucose: 108, weight: 71.5, sleep: 7.4, hr: 64 },
    drift: { sys: 0, glucose: -0.12, weight: -0.03, hr: 0 },
    spikeChance: 0.03,
    threshold: { glucoseFastingMax: 110, glucosePostMealMax: 160 },
    insight: {
      riskLevel: AiRiskLevel.LOW,
      trend: 'Improving glucose control',
      narrative:
        'Fasting glucose has declined about 5 mg/dL over six weeks and now sits comfortably below the prediabetes threshold. Blood pressure is consistently optimal, and resting heart rate is steady. Post-meal values are well managed, with only one brief excursion in the window.',
    },
    aiPattern: {
      severity: AlertSeverity.INFO,
      status: AlertStatus.ACKNOWLEDGED,
      label: 'AI pattern: fasting glucose improving',
      rationale:
        'Fasting glucose is on a steady downward slope over six weeks. The change is consistent with the fiber-forward meal plan and evening walks.',
    },
    takeaways: [
      'Keep fiber-rich breakfasts; they are smoothing post-meal spikes.',
      'Continue the evening walk, aiming for 30 minutes.',
      'Spread carbohydrates evenly across meals rather than concentrating them at dinner.',
      'Keep logging at the same morning hour.',
    ],
    chat: [
      ['doctor', 'Priya, your fasting glucose has come down steadily. Excellent work on the evening walks.'],
      ['patient', 'Thank you! The walks have become something I look forward to.'],
      ['doctor', 'That is the best kind of habit. We will reassess your HbA1c at the next quarterly visit.'],
      ['patient', 'Sounds good. Should I keep the vitamin D dose as is?'],
      ['doctor', 'Yes, continue it through the winter and we will recheck the level then.'],
    ],
  },
  {
    key: 'daniel',
    email: 'patient4@healthlens.demo',
    name: 'Daniel Reyes',
    gender: 'Male',
    dob: '1975-11-02',
    phone: '+1 (555) 610-4402',
    doctor: 'okafor',
    conditions: ['Atrial fibrillation (rate-controlled)', 'Hypertension Stage 1'],
    base: { sys: 128, dia: 82, glucose: 98, weight: 88.0, sleep: 6.0, hr: 92 },
    drift: { sys: 0.02, glucose: 0, weight: 0, hr: 0.15 },
    spikeChance: 0.12,
    threshold: { heartRateMax: 105, heartRateMin: 50 },
    insight: {
      riskLevel: AiRiskLevel.MODERATE,
      trend: 'Rising resting heart rate',
      narrative:
        'Resting heart rate has climbed about 6 bpm over six weeks, with more frequent readings above the 105 bpm ceiling. Blood pressure is stable in the high 120s. Sleep is averaging about 6 hours, which may be contributing to the rate trend. Recommend reviewing rate-control dosing and a short ambulatory rhythm check.',
    },
    aiPattern: {
      severity: AlertSeverity.CAUTION,
      status: AlertStatus.UNREAD,
      label: 'AI pattern: rising resting heart rate',
      rationale:
        'Resting heart rate has increased roughly 6 bpm over six weeks. Episodes above 105 bpm are more frequent in the last two weeks than in the first two.',
    },
    takeaways: [
      'Take your rate-control medication at the same time each day.',
      'Limit caffeine to one cup before noon.',
      'Record palpitations in the notes field with the time they started.',
      'Aim for 7 hours of sleep; a fixed wake time helps the most.',
    ],
    chat: [
      ['patient', 'Dr. Okafor, my heart rate has been running higher the last couple of weeks. Should I be worried?'],
      ['doctor', 'Thanks for flagging it, Daniel. I have reviewed the log. Let us schedule an ECG and a 48-hour monitor.'],
      ['patient', 'Okay. Is there anything I should do in the meantime?'],
      ['doctor', 'Keep taking your medication as prescribed, limit caffeine, and message me right away if you feel faint or chest tightness.'],
      ['patient', 'Understood. I will message you if anything changes.'],
    ],
  },
  {
    key: 'grace',
    email: 'patient5@healthlens.demo',
    name: 'Grace Holloway',
    gender: 'Female',
    dob: '1952-06-30',
    phone: '+1 (555) 517-6633',
    doctor: 'okafor',
    conditions: [
      'Heart failure with reduced ejection fraction (HFrEF)',
      'Type 2 diabetes',
      'Hypertension Stage 2',
    ],
    base: { sys: 150, dia: 90, glucose: 128, weight: 84.0, sleep: 5.9, hr: 84 },
    drift: { sys: 0.05, glucose: 0.02, weight: 0.06, hr: 0.02 },
    spikeChance: 0.15,
    threshold: { systolicMax: 150, heartRateMax: 100, weightDeltaKg: 1.5 },
    insight: {
      riskLevel: AiRiskLevel.HIGH,
      trend: 'Worsening volume status',
      narrative:
        'Weight is up about 2.5 kg over six weeks while systolic pressure is drifting upward. Together these changes suggest fluid retention and reduced cardiac reserve. Sleep has shortened and the patient reports breathlessness on stairs. Recommend a same-week review of diuretic dosing and a sodium and fluid assessment.',
    },
    aiPattern: {
      severity: AlertSeverity.CRITICAL,
      status: AlertStatus.UNREAD,
      label: 'AI pattern: weight and pressure rising together',
      rationale:
        'Weight has risen about 2.5 kg over six weeks in parallel with rising systolic pressure. This combination is consistent with fluid retention in heart failure and warrants prompt review.',
    },
    followUp: {
      note: 'Patient reports breathlessness on stairs and swollen ankles by evening. Requests an earlier visit.',
    },
    takeaways: [
      'Weigh yourself every morning after using the bathroom, before breakfast.',
      'Keep sodium under 2,000 mg a day and avoid processed foods.',
      'Elevate your legs for 20 minutes in the evening if ankles swell.',
      'Call the clinic if weight rises more than 1.5 kg in a week.',
    ],
    chat: [
      ['doctor', 'Grace, I reviewed your weekly weights. We need to talk about fluid, please call the clinic this week.'],
      ['patient', 'I have been more tired than usual and my ankles swell by evening.'],
      ['doctor', 'Thank you for telling me. Please keep your weight log daily and let us move your visit up.'],
      ['patient', 'I can come in Thursday morning if that helps.'],
      ['doctor', 'Thursday works. Go to the emergency department right away if you feel chest pain or cannot catch your breath at rest.'],
    ],
  },
];

// ─────────────────────────── Helpers ───────────────────────────

// Deterministic PRNG so every re-seed produces the same story
function rngFor(seed: string) {
  let h = 2166136261;
  for (const c of seed) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  const next = () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    const u = Math.max(next(), 1e-9);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return { next, gauss };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round05 = (n: number) => Math.round(n * 2) / 2;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmtDelta = (n: number) => (n === 0 ? 'unchanged' : `${n > 0 ? '+' : ''}${n}`);

async function upsertAuthUser(email: string, name: string, role: Role): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { name },
  });
  if (!error && data.user) return data.user.id;

  if (error?.message?.toLowerCase().includes('already')) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const found = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      await supabaseAdmin.auth.admin.updateUserById(found.id, {
        password: DEMO_PASSWORD,
        app_metadata: { role },
        user_metadata: { name },
      });
      return found.id;
    }
  }
  console.warn(`⚠️  Could not upsert Supabase user for ${email}: ${error?.message}`);
  return null;
}

/** Returns the Prisma User id, keyed to the Supabase Auth id when available. */
async function ensureUser(email: string, name: string, role: Role): Promise<string> {
  const supaId = await upsertAuthUser(email, name, role);
  const byEmail = await prisma.user.findUnique({ where: { email } });

  if (supaId) {
    if (byEmail && byEmail.id !== supaId) {
      // Re-key a pre-existing row so the Supabase login maps to it
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { id: supaId, name, role, password: MANAGED },
      });
      return supaId;
    }
    await prisma.user.upsert({
      where: { id: supaId },
      create: { id: supaId, email, name, role, password: MANAGED },
      update: { email, name, role, password: MANAGED },
    });
    return supaId;
  }

  // Supabase unavailable: fall back to an email-keyed row
  const u = await prisma.user.upsert({
    where: { email },
    create: { email, name, role, password: MANAGED },
    update: { name, role },
  });
  return u.id;
}

// ─────────────────────────── Data generators ───────────────────────────

function buildVitals(p: PatientProfile): Prisma.VitalCreateManyInput[] {
  const r = rngFor(p.key);
  const patientId = `pat_${p.key}`;
  const rows: Prisma.VitalCreateManyInput[] = [];

  for (let d = DAYS_OF_DATA; d >= 1; d--) {
    const t = DAYS_OF_DATA - d; // days elapsed in the window

    const sysSpike = r.next() < p.spikeChance ? 18 + r.next() * 12 : 0;
    const sys = Math.round(p.base.sys + p.drift.sys * t + r.gauss() * 4 + sysSpike);
    const dia = Math.round(p.base.dia + (sys - p.base.sys) * 0.45 + r.gauss() * 2);
    const fasting = Math.round(p.base.glucose + p.drift.glucose * t + r.gauss() * 5);
    const weight = round1(p.base.weight + p.drift.weight * t + r.gauss() * 0.3);
    const sleep = round05(p.base.sleep + r.gauss() * 0.5);
    const hrSpike = r.next() < p.spikeChance ? 30 + r.next() * 30 : 0;
    const hr = Math.round(p.base.hr + p.drift.hr * t + r.gauss() * 3 + hrSpike);

    const am = new Date(NOW - d * DAY);
    am.setUTCHours(7, 30, 0, 0);
    rows.push({
      id: `vit_${p.key}_${d}_am`,
      patientId,
      systolic: sys,
      diastolic: dia,
      glucose: fasting,
      glucoseContext: GlucoseContext.FASTING,
      weightKg: weight,
      sleepHours: sleep,
      heartRate: hr,
      recordedAt: am,
    });

    // Evening post-meal reading on alternate days
    if (d % 2 === 0) {
      const pm = new Date(NOW - d * DAY);
      pm.setUTCHours(19, 30, 0, 0);
      rows.push({
        id: `vit_${p.key}_${d}_pm`,
        patientId,
        glucose: Math.round(fasting + 38 + r.gauss() * 12),
        glucoseContext: GlucoseContext.POST_MEAL,
        recordedAt: pm,
      });
    }
  }
  return rows;
}

function buildAlerts(
  p: PatientProfile,
  vitals: Prisma.VitalCreateManyInput[],
  th: typeof DEFAULT_THRESHOLD,
  doctorId: string
): Prisma.AlertCreateManyInput[] {
  const patientId = `pat_${p.key}`;
  const alerts: Prisma.AlertCreateManyInput[] = [];

  for (const v of vitals) {
    const recordedAt = v.recordedAt as Date;
    const ageDays = (NOW - recordedAt.getTime()) / DAY;
    const hits: { rule: string; label: string; detail: string; critical: boolean }[] = [];

    if (v.systolic != null && v.diastolic != null) {
      if (v.systolic > th.systolicMax || v.diastolic > th.diastolicMax) {
        hits.push({
          rule: 'BP_THRESHOLD',
          label: `Threshold: BP > ${th.systolicMax}/${th.diastolicMax}`,
          detail: `Recorded ${v.systolic}/${v.diastolic} mmHg`,
          critical: v.systolic >= 180 || v.diastolic >= 110,
        });
      }
    }

    if (v.glucose != null) {
      if (v.glucoseContext === GlucoseContext.FASTING) {
        if (v.glucose > th.glucoseFastingMax) {
          hits.push({
            rule: 'GLUCOSE_HIGH_FASTING',
            label: `Threshold: fasting glucose > ${th.glucoseFastingMax} mg/dL`,
            detail: `Fasting glucose ${v.glucose} mg/dL`,
            critical: v.glucose >= 250,
          });
        }
        if (v.glucose < th.glucoseFastingMin) {
          hits.push({
            rule: 'GLUCOSE_LOW',
            label: `Threshold: fasting glucose < ${th.glucoseFastingMin} mg/dL`,
            detail: `Fasting glucose ${v.glucose} mg/dL`,
            critical: v.glucose < 54,
          });
        }
      } else if (v.glucose > th.glucosePostMealMax) {
        hits.push({
          rule: 'GLUCOSE_HIGH_POST_MEAL',
          label: `Threshold: post-meal glucose > ${th.glucosePostMealMax} mg/dL`,
          detail: `Post-meal glucose ${v.glucose} mg/dL`,
          critical: v.glucose >= 250,
        });
      }
    }

    if (v.heartRate != null) {
      if (v.heartRate > th.heartRateMax) {
        hits.push({
          rule: 'HEART_RATE_HIGH',
          label: `Threshold: heart rate > ${th.heartRateMax} bpm`,
          detail: `Heart rate ${v.heartRate} bpm`,
          critical: v.heartRate >= 130,
        });
      }
      if (v.heartRate < th.heartRateMin) {
        hits.push({
          rule: 'HEART_RATE_LOW',
          label: `Threshold: heart rate < ${th.heartRateMin} bpm`,
          detail: `Heart rate ${v.heartRate} bpm`,
          critical: v.heartRate <= 45,
        });
      }
    }

    for (const h of hits) {
      const status =
        ageDays <= 3 ? AlertStatus.UNREAD : ageDays <= 10 ? AlertStatus.ACKNOWLEDGED : AlertStatus.RESOLVED;
      const acked = status !== AlertStatus.UNREAD;
      const resolved = status === AlertStatus.RESOLVED;

      alerts.push({
        patientId,
        type: AlertType.THRESHOLD,
        severity: h.critical ? AlertSeverity.CRITICAL : AlertSeverity.CAUTION,
        status,
        rule: h.rule,
        triggerLabel: h.label,
        detail: h.detail,
        vitalId: v.id as string,
        dedupeKey: `${v.id}:${h.rule}`,
        metrics: {
          systolic: v.systolic ?? null,
          diastolic: v.diastolic ?? null,
          glucose: v.glucose ?? null,
          heartRate: v.heartRate ?? null,
        },
        triggeredAt: recordedAt,
        acknowledgedAt: acked ? new Date(recordedAt.getTime() + 3 * 3_600_000) : null,
        acknowledgedById: acked ? doctorId : null,
        resolvedAt: resolved ? new Date(recordedAt.getTime() + 2 * DAY) : null,
        clinicalNote: resolved ? 'Reviewed. Discussed at follow-up; continue current plan.' : null,
      });
    }
  }

  // Patient-specific AI pattern alert
  if (p.aiPattern) {
    alerts.push({
      patientId,
      type: AlertType.AI_PATTERN,
      severity: p.aiPattern.severity,
      status: p.aiPattern.status,
      rule: 'AI_PATTERN',
      triggerLabel: p.aiPattern.label,
      detail: 'Multi-week trend detected by insight worker',
      aiRationale: p.aiPattern.rationale,
      dedupeKey: `ai_${p.key}_pattern`,
      triggeredAt: new Date(NOW - 1 * DAY),
    });
  }

  // Grace: mark the newest alert as a visit request from the patient
  if (p.followUp) {
    const newest = alerts
      .filter((a) => a.type === AlertType.THRESHOLD)
      .sort((a, b) => (b.triggeredAt as Date).getTime() - (a.triggeredAt as Date).getTime())[0];
    if (newest) {
      newest.followUpRequestedAt = new Date(NOW - 1 * DAY);
      newest.followUpNote = p.followUp.note;
    }
  }

  return alerts;
}

function buildSummaries(
  p: PatientProfile,
  vitals: Prisma.VitalCreateManyInput[],
  alerts: Prisma.AlertCreateManyInput[]
): Prisma.WeeklySummaryCreateManyInput[] {
  const patientId = `pat_${p.key}`;
  const morning = vitals.filter((v) => v.glucoseContext === GlucoseContext.FASTING);

  const inWindow = (fromDays: number, toDays: number) =>
    morning.filter((v) => {
      const age = (NOW - (v.recordedAt as Date).getTime()) / DAY;
      return age >= toDays && age < fromDays;
    });

  const stats = (rows: Prisma.VitalCreateManyInput[]) => ({
    sys: avg(rows.map((r) => r.systolic as number)),
    dia: avg(rows.map((r) => r.diastolic as number)),
    glucose: avg(rows.map((r) => r.glucose as number)),
    weight: avg(rows.map((r) => r.weightKg as number)),
    sleep: avg(rows.map((r) => r.sleepHours as number)),
  });

  const out: Prisma.WeeklySummaryCreateManyInput[] = [];

  for (let w = 0; w < 4; w++) {
    const cur = stats(inWindow((w + 1) * 7, w * 7));
    const prev = stats(inWindow((w + 2) * 7, (w + 1) * 7));

    const sys = Math.round(cur.sys);
    const dia = Math.round(cur.dia);
    const glucose = Math.round(cur.glucose);
    const weight = round1(cur.weight);
    const sleep = round1(cur.sleep);
    const dSys = Math.round(cur.sys - prev.sys);
    const dGlucose = Math.round(cur.glucose - prev.glucose);

    const trend =
      dSys <= -2 || dGlucose <= -3 ? 'IMPROVING' : dSys >= 2 || dGlucose >= 3 ? 'WORSENING' : 'STABLE';

    const breaches = alerts.filter((a) => {
      if (a.rule !== 'BP_THRESHOLD') return false;
      const age = (NOW - (a.triggeredAt as Date).getTime()) / DAY;
      return age >= w * 7 && age < (w + 1) * 7;
    }).length;

    const narrative =
      `Average blood pressure was ${sys}/${dia} mmHg this week (${fmtDelta(dSys)} mmHg vs. the prior week). ` +
      `Fasting glucose averaged ${glucose} mg/dL, sleep averaged ${sleep} hours, and weight averaged ${weight} kg. ` +
      (breaches > 0
        ? `${breaches} reading${breaches > 1 ? 's' : ''} exceeded your blood pressure threshold.`
        : 'No blood pressure readings exceeded your threshold.');

    const pool = p.takeaways;
    const takeaways = [pool[(w * 2) % pool.length], pool[(w * 2 + 1) % pool.length]];

    const weekStart = new Date(NOW - (w + 1) * 7 * DAY);
    weekStart.setUTCHours(12, 0, 0, 0);
    const weekEnd = new Date(NOW - w * 7 * DAY);
    weekEnd.setUTCHours(12, 0, 0, 0);

    out.push({
      patientId,
      weekStart,
      weekEnd,
      narrative,
      takeaways,
      trend,
      model: 'healthlens-insight-v1',
      stats: { avgSystolic: sys, avgDiastolic: dia, avgFastingGlucose: glucose, avgWeightKg: weight, avgSleepHours: sleep, breaches },
    });
  }
  return out;
}

// ─────────────────────────── Main ───────────────────────────

async function main() {
  console.log('🌱 Seeding HealthLens demo data...');

  // 1. Clinics
  for (const c of Object.values(CLINICS)) {
    await prisma.clinic.upsert({
      where: { id: c.id },
      create: c,
      update: { name: c.name, phone: c.phone, address: c.address },
    });
  }

  // 2. Auth + users
  const doctorUserIds: Record<DocKey, string> = {} as any;
  for (const d of DOCTORS) {
    doctorUserIds[d.key] = await ensureUser(d.email, d.name, Role.DOCTOR);
  }
  const patientUserIds: Record<string, string> = {};
  for (const p of PATIENTS) {
    patientUserIds[p.key] = await ensureUser(p.email, p.name, Role.PATIENT);
  }

  // 3. Doctor rows
  const doctorRows: Record<DocKey, { id: string }> = {} as any;
  for (const d of DOCTORS) {
    const userId = doctorUserIds[d.key];
    doctorRows[d.key] = await prisma.doctor.upsert({
      where: { userId },
      create: { userId, clinicId: CLINICS[d.clinic].id, clinicName: CLINICS[d.clinic].name, phone: d.phone },
      update: { clinicId: CLINICS[d.clinic].id, clinicName: CLINICS[d.clinic].name, phone: d.phone },
    });
    console.log(`✅ Doctor ready: ${d.email}`);
  }

  // 4. Clean previous demo data so re-runs are idempotent
  const allUserIds = [...Object.values(doctorUserIds), ...Object.values(patientUserIds)];
  const allDoctorIds = Object.values(doctorRows).map((d) => d.id);
  await prisma.notification.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.message.deleteMany({ where: { senderId: { in: allUserIds } } });
  await prisma.careInvite.deleteMany({ where: { doctorId: { in: allDoctorIds } } });
  await prisma.patient.deleteMany({ where: { userId: { in: Object.values(patientUserIds) } } }); // cascades

  // 5. Care invites (pending, accepted, expired, cancelled)
  const inDays = (n: number) => new Date(NOW + n * DAY);
  await prisma.careInvite.createMany({
    data: [
      { code: 'HL-RUIZ-7H2K', doctorId: doctorRows.ruiz.id, clinicId: CLINICS.meridian.id, specialty: 'General Practice', patientEmail: 'new.patient@example.com', status: InviteStatus.PENDING, expiresAt: inDays(14) },
      { code: 'HL-RUIZ-3QF9', doctorId: doctorRows.ruiz.id, clinicId: CLINICS.meridian.id, specialty: 'General Practice', patientEmail: 'patient3@healthlens.demo', status: InviteStatus.ACCEPTED, expiresAt: inDays(-30) },
      { code: 'HL-RUIZ-9ZP1', doctorId: doctorRows.ruiz.id, clinicId: CLINICS.meridian.id, specialty: 'General Practice', status: InviteStatus.EXPIRED, expiresAt: inDays(-5) },
      { code: 'HL-OKAF-4MN8', doctorId: doctorRows.okafor.id, clinicId: CLINICS.riverside.id, specialty: 'Cardiology', patientEmail: 'referral@example.com', status: InviteStatus.PENDING, expiresAt: inDays(10) },
      { code: 'HL-OKAF-2TX5', doctorId: doctorRows.okafor.id, clinicId: CLINICS.riverside.id, specialty: 'Cardiology', status: InviteStatus.CANCELLED, expiresAt: inDays(7) },
    ],
  });

  // 6. Patients and everything attached to them
  const notifications: Prisma.NotificationCreateManyInput[] = [];

  for (const p of PATIENTS) {
    const doc = DOCTORS.find((d) => d.key === p.doctor)!;
    const doctorRow = doctorRows[p.key === 'x' ? 'ruiz' : p.doctor];
    const doctorUserId = doctorUserIds[p.doctor];
    const patientId = `pat_${p.key}`;
    const userId = patientUserIds[p.key];
    const clinicId = CLINICS[doc.clinic].id;
    const th = { ...DEFAULT_THRESHOLD, ...(p.threshold ?? {}) };

    const vitals = buildVitals(p);
    const alerts = buildAlerts(p, vitals, th, doctorRow.id);
    const summaries = buildSummaries(p, vitals, alerts);

    const recent = alerts.filter((a) => (NOW - (a.triggeredAt as Date).getTime()) / DAY <= 7);
    const riskStatus = recent.some((a) => a.severity === AlertSeverity.CRITICAL && a.status !== AlertStatus.RESOLVED)
      ? RiskStatus.CRITICAL
      : recent.some((a) => a.status !== AlertStatus.RESOLVED)
      ? RiskStatus.MODERATE
      : RiskStatus.NORMAL;

    const lastReadingAt = new Date(Math.max(...vitals.map((v) => (v.recordedAt as Date).getTime())));
    const assignedAt = new Date(NOW - 120 * DAY);

    await prisma.patient.create({
      data: {
        id: patientId,
        userId,
        doctorId: doctorRow.id,
        doctorAssignedAt: assignedAt,
        dateOfBirth: new Date(p.dob),
        gender: p.gender,
        phone: p.phone,
        riskStatus,
        lastReadingAt,
        conditions: { create: p.conditions.map((label) => ({ label })) },
        threshold: { create: th },
        insight: {
          create: {
            narrative: p.insight.narrative,
            riskLevel: p.insight.riskLevel,
            trend: p.insight.trend,
            stats: {
              avgSystolic30d: Math.round(avg(vitals.map((v) => v.systolic as number)) || 0),
              avgDiastolic30d: Math.round(avg(vitals.map((v) => v.diastolic as number)) || 0),
              avgFastingGlucose30d: Math.round(avg(vitals.filter((v) => v.glucoseContext === GlucoseContext.FASTING).map((v) => v.glucose as number))),
              readingCount: vitals.length,
              openAlerts: alerts.filter((a) => a.status === AlertStatus.UNREAD).length,
            },
          },
        },
      },
    });

    await prisma.careAssignment.create({
      data: {
        id: `ca_${p.key}`,
        patientId,
        doctorId: doctorRow.id,
        clinicId,
        specialty: doc.specialty,
        status: AssignmentStatus.ACTIVE,
        assignedAt,
      },
    });

    await prisma.vital.createMany({ data: vitals });
    await prisma.alert.createMany({ data: alerts });
    await prisma.weeklySummary.createMany({ data: summaries });

    // Chat thread between patient and doctor
    const chatBase = NOW - (p.chat.length - 1) * 2 * DAY;
    await prisma.message.createMany({
      data: p.chat.map(([who, content], i) => {
        const senderId = who === 'doctor' ? doctorUserId : userId;
        const createdAt = new Date(chatBase + i * 2 * DAY);
        const isLast = i === p.chat.length - 1;
        return {
          assignmentId: `ca_${p.key}`,
          senderId,
          content,
          read: !(isLast && who === 'patient'),
          createdAt,
        };
      }),
    });

    // Notifications
    const criticalAlerts = alerts
      .filter((a) => a.severity === AlertSeverity.CRITICAL)
      .slice(0, 2);

    for (const a of criticalAlerts) {
      notifications.push({
        userId: doctorUserId,
        title: `Critical reading: ${p.name}`,
        message: `${a.detail}. Review and acknowledge.`,
        type: NotificationType.CRITICAL_ALERT,
        read: false,
        link: `/doctor/patients/${patientId}`,
        metadata: { patientId, rule: a.rule },
      });
    }

    if (p.followUp) {
      notifications.push({
        userId: doctorUserId,
        title: `Visit requested: ${p.name}`,
        message: p.followUp.note,
        type: NotificationType.VISIT_REQUEST,
        read: false,
        link: `/doctor/patients/${patientId}`,
        metadata: { patientId },
      });
    }

    notifications.push({
      userId,
      title: 'Care assignment confirmed',
      message: `${doc.name} is now your ${doc.specialty.toLowerCase()} provider.`,
      type: NotificationType.CARE_ASSIGNMENT,
      read: true,
      link: '/patient/care-team',
    });

    notifications.push({
      userId,
      title: 'New message from your care team',
      message: `${doc.name} replied to your last message.`,
      type: NotificationType.CHAT,
      read: false,
      link: '/patient/messages',
    });

    console.log(
      `✅ Patient ready: ${p.email} (${vitals.length} readings, ${alerts.length} alerts, risk: ${riskStatus})`
    );
  }

  // Welcome notifications for every account
  for (const d of DOCTORS) {
    notifications.push({
      userId: doctorUserIds[d.key],
      title: 'Welcome to HealthLens',
      message: 'Your demo panel is loaded with 30+ days of patient data.',
      type: NotificationType.SYSTEM,
      read: true,
    });
  }

  await prisma.notification.createMany({ data: notifications });

  console.log('\n🎉 Seeding complete!\n');
  console.table(
    [
      ...DOCTORS.map((d) => ({ role: 'DOCTOR', name: d.name, email: d.email, password: DEMO_PASSWORD })),
      ...PATIENTS.map((p) => ({ role: 'PATIENT', name: p.name, email: p.email, password: DEMO_PASSWORD })),
    ]
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());