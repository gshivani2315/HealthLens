// backend/src/modules/doctor/doctor.routes.ts   (replaces current)
import crypto from 'crypto';
import { Router, Response } from 'express';
import { GlucoseContext, Prisma, RiskStatus } from '@prisma/client';
import { prisma } from '../../db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { supabaseAdmin } from '../../lib/supabase';
import { publishVitalLoggedEvent } from '../../kafka/producer';
import { alertForDoctor } from '../alerts/alertSerializer';

const router = Router();

type DoctorRecord = Prisma.DoctorGetPayload<{ include: { user: true } }>;

// Every route below: valid token -> DOCTOR role -> a Doctor row exists. Fail closed otherwise.
// (Before, a missing Doctor row silently dropped the "only my patients" filter and returned everyone.)
router.use(requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: req.user!.dbUserId },
      include: { user: true },
    });
    if (!doctor) return res.status(403).json({ message: 'Doctor profile not found for this account' });
    res.locals.doctor = doctor;
    next();
  } catch (err) {
    next(err);
  }
});

const doc = (res: Response) => res.locals.doctor as DoctorRecord;

// ───────────────────────────── helpers ─────────────────────────────

const EMAIL_RE = /^\S+@\S+\.\S+$/;

function toLowerRisk(risk: string): 'normal' | 'moderate' | 'critical' {
  switch (risk.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'MODERATE': return 'moderate';
    default: return 'normal';
  }
}

function toRiskEnum(v: unknown): RiskStatus | undefined {
  if (typeof v !== 'string') return undefined;
  switch (v.toUpperCase()) {
    case 'CRITICAL': return RiskStatus.CRITICAL;
    case 'MODERATE': return RiskStatus.MODERATE;
    case 'NORMAL': return RiskStatus.NORMAL;
    default: return undefined;
  }
}

function ageOf(dob: Date | null): number {
  const d = dob ?? new Date('1970-01-01');
  return Math.abs(new Date(Date.now() - d.getTime()).getUTCFullYear() - 1970);
}

function toLabels(c: unknown): string[] | undefined {
  if (Array.isArray(c)) return c.map((x) => String(x).trim()).filter(Boolean);
  if (typeof c === 'string') return c.split(',').map((s) => s.trim()).filter(Boolean);
  return undefined;
}

function generateTempPassword(): string {
  return crypto.randomBytes(9).toString('base64url'); // 12 chars, shown once to the doctor
}

/** Only patients assigned to THIS doctor. A patient that is unassigned or belongs to someone else is "not found". */
const ownedPatient = (id: string, doctorId: string): Prisma.PatientWhereInput => ({
  OR: [{ id }, { userId: id }],
  doctorId,
});

const rosterInclude = Prisma.validator<Prisma.PatientInclude>()({
  user: true,
  conditions: true,
  // Readings are partial (a submission may be only BP, or only glucose), so look at the last 20
  // and pick the latest BP and glucose separately instead of trusting the single newest row.
  vitals: { orderBy: { recordedAt: 'desc' }, take: 20 },
});
type RosterPatient = Prisma.PatientGetPayload<{ include: typeof rosterInclude }>;

function toRosterRow(p: RosterPatient) {
  const bp = p.vitals.find((v) => v.systolic != null && v.diastolic != null);
  const glu = p.vitals.find((v) => v.glucose != null);
  return {
    id: p.id,
    doctorId: p.doctorId ?? undefined,
    name: p.user.name,
    email: p.user.email,
    phone: p.phone ?? undefined,
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : undefined,
    age: ageOf(p.dateOfBirth),
    gender: p.gender ?? 'Unknown',
    primaryCondition: p.conditions[0]?.label ?? 'General Monitoring',
    conditions: p.conditions.map((c) => ({ id: c.id, label: c.label })),
    latestBloodPressure: bp ? { systolic: bp.systolic as number, diastolic: bp.diastolic as number } : null,
    latestGlucose: glu?.glucose ?? null,
    riskStatus: toLowerRisk(p.riskStatus),
    lastReadingAt: p.lastReadingAt ? p.lastReadingAt.toISOString() : null,
  };
}

function buildProfile(
  p: { id: string; dateOfBirth: Date | null; gender: string | null; phone: string | null; doctorAssignedAt: Date | null;
       user: { name: string; email: string }; conditions: { id: string; label: string }[] },
  doctor: DoctorRecord
) {
  return {
    id: p.id,
    name: p.user.name,
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : '',
    age: ageOf(p.dateOfBirth),
    gender: p.gender ?? 'Unknown',
    phone: p.phone ?? '',
    email: p.user.email,
    conditions: p.conditions.map((c) => ({ id: c.id, label: c.label })),
    doctor: {
      id: doctor.id,
      name: doctor.user.name,
      clinicName: doctor.clinicName ?? '',
      phone: doctor.phone ?? undefined,
      email: doctor.user.email,
      assignedDate: p.doctorAssignedAt?.toISOString(),
    },
  };
}

type InitialVitals = {
  systolic?: number; diastolic?: number; glucose?: number; weightKg?: number; sleepHours?: number;
};
type VitalsParse = { error: string } | { vitals: InitialVitals | null };

const opt = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));

// Mirrors the DB CHECK constraints so a bad form gives a clean 400 BEFORE we create a Supabase login.
function parseInitialVitals(b: any): VitalsParse {
  const v: InitialVitals = {
    systolic: opt(b.initialSystolic),
    diastolic: opt(b.initialDiastolic),
    glucose: opt(b.initialGlucose),
    weightKg: opt(b.initialWeightKg),
    sleepHours: opt(b.initialSleepHours),
  };
  const values = Object.values(v);
  if (values.every((x) => x === undefined)) return { vitals: null };
  if (values.some((x) => x !== undefined && !Number.isFinite(x))) return { error: 'Initial readings must be numbers' };
  if ((v.systolic === undefined) !== (v.diastolic === undefined)) {
    return { error: 'Enter both systolic and diastolic blood pressure, or neither' };
  }
  const within = (x: number | undefined, lo: number, hi: number) => x === undefined || (x >= lo && x <= hi);
  if (
    !within(v.systolic, 50, 300) || !within(v.diastolic, 30, 200) || !within(v.glucose, 20, 800) ||
    !within(v.weightKg, 20, 400) || !within(v.sleepHours, 0, 24)
  ) {
    return { error: 'One or more initial readings are outside plausible ranges' };
  }
  return { vitals: v };
}

// ───────────────────────────── GET /doctor/overview ─────────────────────────────
router.get('/overview', async (_req, res, next) => {
  try {
    const doctor = doc(res);

    const patients = await prisma.patient.findMany({
      where: { doctorId: doctor.id },
      include: rosterInclude,
    });

    const alertScope = { status: 'UNREAD' as const, patient: { doctorId: doctor.id } };
    const [urgentAlerts, criticalCount] = await Promise.all([
      prisma.alert.findMany({
        where: alertScope,
        include: { patient: { include: { user: true } } },
        orderBy: { triggeredAt: 'desc' },
        take: 50,
      }),
      prisma.alert.count({ where: { ...alertScope, severity: 'CRITICAL' } }),
    ]);

    const now = Date.now();
    const missing48h = patients.filter(
      (p) => !p.lastReadingAt || now - p.lastReadingAt.getTime() > 48 * 60 * 60 * 1000
    ).length;

    res.json({
      totalPatients: patients.length,
      criticalAlertsPending: criticalCount,
      missingReadings48h: missing48h,
      urgentAlerts: urgentAlerts.map(alertForDoctor),
      roster: patients.map(toRosterRow),
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── GET /doctor/patients ─────────────────────────────
router.get('/patients', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const search = (req.query.search as string) || '';
    const filter = (req.query.filter as string) || 'all';

    const where: Prisma.PatientWhereInput = { doctorId: doctor.id };
    if (search) where.user = { name: { contains: search, mode: 'insensitive' } };
    if (filter === 'critical') where.riskStatus = 'CRITICAL';
    else if (filter === 'needs_review') where.riskStatus = { not: 'NORMAL' };

    const patients = await prisma.patient.findMany({ where, include: rosterInclude });
    res.json(patients.map(toRosterRow));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── POST /doctor/patients (Add Patient) ─────────────────────────────
router.post('/patients', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const b = req.body ?? {};

    const fullName =
      (typeof b.name === 'string' && b.name.trim()) || `${b.firstName ?? ''} ${b.lastName ?? ''}`.trim();
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';

    if (!fullName || !EMAIL_RE.test(email) || !b.dateOfBirth) {
      return res.status(400).json({ message: 'A name, a valid email, and date of birth are required' });
    }
    const dob = new Date(b.dateOfBirth);
    if (Number.isNaN(dob.getTime())) return res.status(400).json({ message: 'Invalid date of birth' });

    const parsed = parseInitialVitals(b);
    if ('error' in parsed) return res.status(400).json({ message: parsed.error });
    const initial = parsed.vitals;

    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    const labels = toLabels(b.conditions);
    const conditionLabels = labels && labels.length ? labels : ['General Monitoring'];
    const risk = toRiskEnum(b.riskStatus) ?? RiskStatus.NORMAL;

    // 1. Supabase login first (external API: Postgres can't roll it back, so we clean up manually below).
    //    Role goes in app_metadata, which the user cannot edit.
    const tempPassword = generateTempPassword();
    const { data: created, error: supaErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      app_metadata: { role: 'PATIENT' },
      user_metadata: { name: fullName },
    });
    if (supaErr || !created.user) {
      const exists = supaErr?.message?.toLowerCase().includes('already');
      return res.status(exists ? 409 : 502).json({
        message: exists ? 'A user with this email already exists' : `Could not create the patient's login: ${supaErr?.message}`,
      });
    }
    const supaUserId = created.user.id;

    let patientId = '';
    let initialVital: { id: string; recordedAt: Date } | null = null;
    try {
      await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { id: supaUserId, email, password: 'SUPABASE_MANAGED_AUTH', name: fullName, role: 'PATIENT' },
        });
        const patient = await tx.patient.create({
          data: {
            userId: user.id,
            doctorId: doctor.id,
            doctorAssignedAt: new Date(),
            gender: b.gender || 'Unknown',
            phone: b.phone || '',
            dateOfBirth: dob,
            riskStatus: risk,
            conditions: { create: conditionLabels.map((label) => ({ label })) },
            threshold: { create: {} },
          },
        });
        patientId = patient.id;

        if (initial) {
          const vital = await tx.vital.create({
            data: {
              patientId: patient.id,
              ...initial,
              glucoseContext: initial.glucose !== undefined ? GlucoseContext.FASTING : undefined,
              recordedAt: new Date(),
            },
          });
          await tx.patient.update({ where: { id: patient.id }, data: { lastReadingAt: vital.recordedAt } });
          initialVital = { id: vital.id, recordedAt: vital.recordedAt };
        }
      });
    } catch (dbErr) {
      await supabaseAdmin.auth.admin.deleteUser(supaUserId).catch(() => {});
      throw dbErr;
    }

    // Run the baseline reading through the same pipeline as any other reading (rules + AI).
    if (initialVital) {
      await publishVitalLoggedEvent({
        vitalId: (initialVital as { id: string }).id,
        patientId,
        recordedAt: (initialVital as { recordedAt: Date }).recordedAt,
      });
    }

    const fresh = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, include: rosterInclude });

    // The doctor must hand this to the patient: the frontend shows it once in a modal.
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ ...toRosterRow(fresh), temporaryPassword: tempPassword });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── GET /doctor/patients/:id ─────────────────────────────
router.get('/patients/:id', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const patient = await prisma.patient.findFirst({
      where: ownedPatient(req.params.id, doctor.id),
      include: {
        user: true,
        conditions: true,
        insight: true,
        alerts: { orderBy: { triggeredAt: 'desc' }, take: 10 },
        // 90 days so the 7D/30D/90D buttons actually have data (was: newest 30 rows ≈ 15 days).
        vitals: { where: { recordedAt: { gte: since } }, orderBy: { recordedAt: 'desc' }, take: 500 },
      },
    });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    res.json({
      profile: buildProfile(patient, doctor),
      riskStatus: toLowerRisk(patient.riskStatus),
      // null when no assessment exists. The old code invented "Vitals are tracking within monitored targets."
      aiClinicalInsight: patient.insight
        ? { generatedAt: patient.insight.generatedAt.toISOString(), narrative: patient.insight.narrative }
        : null,
      alertHistory: patient.alerts.map(alertForDoctor),
      vitalsLog: patient.vitals.map((v) => ({
        id: v.id,
        patientId: v.patientId,
        recordedAt: v.recordedAt.toISOString(),
        systolic: v.systolic ?? undefined,
        diastolic: v.diastolic ?? undefined,
        glucose: v.glucose ?? undefined,
        glucoseContext: v.glucoseContext ? v.glucoseContext.toLowerCase() : undefined,
        weightKg: v.weightKg ?? undefined,
        sleepHours: v.sleepHours ?? undefined,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── PATCH /doctor/patients/:id (Edit Patient) ─────────────────────────────
// This route did not exist: the Edit Patient buttons returned 404 in live mode.
router.patch('/patients/:id', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const patient = await prisma.patient.findFirst({
      where: ownedPatient(req.params.id, doctor.id),
      include: { user: true, conditions: true },
    });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const b = req.body ?? {};

    const name = typeof b.name === 'string' ? b.name.trim() : undefined;
    if (name !== undefined && !name) return res.status(400).json({ message: 'Name cannot be empty' });

    let newEmail: string | undefined;
    if (typeof b.email === 'string') {
      const e = b.email.trim().toLowerCase();
      if (!EMAIL_RE.test(e)) return res.status(400).json({ message: 'Invalid email address' });
      if (e !== patient.user.email) {
        if (await prisma.user.findUnique({ where: { email: e } })) {
          return res.status(409).json({ message: 'A user with this email already exists' });
        }
        newEmail = e;
      }
    }

    let dob: Date | undefined;
    if (typeof b.dateOfBirth === 'string' && b.dateOfBirth) {
      dob = new Date(b.dateOfBirth);
      if (Number.isNaN(dob.getTime())) return res.status(400).json({ message: 'Invalid date of birth' });
    }

    const labels = toLabels(b.conditions);
    const risk = toRiskEnum(b.riskStatus);

    // The login email lives in Supabase too. Change it there first, or the patient can no longer sign in.
    if (newEmail) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(patient.userId, {
        email: newEmail,
        email_confirm: true,
      });
      if (error) return res.status(502).json({ message: `Could not update the login email: ${error.message}` });
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (name !== undefined || newEmail) {
          await tx.user.update({
            where: { id: patient.userId },
            data: { ...(name !== undefined ? { name } : {}), ...(newEmail ? { email: newEmail } : {}) },
          });
        }
        await tx.patient.update({
          where: { id: patient.id },
          data: {
            ...(typeof b.phone === 'string' ? { phone: b.phone.trim() } : {}),
            ...(typeof b.gender === 'string' ? { gender: b.gender } : {}),
            ...(dob ? { dateOfBirth: dob } : {}),
            ...(risk ? { riskStatus: risk } : {}),
          },
        });
        if (labels) {
          await tx.chronicCondition.deleteMany({ where: { patientId: patient.id } });
          if (labels.length) {
            await tx.chronicCondition.createMany({ data: labels.map((label) => ({ patientId: patient.id, label })) });
          }
        }
      });
    } catch (err) {
      if (newEmail) {
        await supabaseAdmin.auth.admin
          .updateUserById(patient.userId, { email: patient.user.email, email_confirm: true })
          .catch(() => {});
      }
      throw err;
    }

    const fresh = await prisma.patient.findUniqueOrThrow({
      where: { id: patient.id },
      include: { user: true, conditions: true },
    });
    res.json(buildProfile(fresh, doctor));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── DELETE /doctor/patients/:id (Remove from roster) ─────────────────────────────
// Also did not exist. "Remove" = UNASSIGN (matches the UI wording). The patient's account and all
// of their data stay intact.
router.delete('/patients/:id', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const patient = await prisma.patient.findFirst({ where: ownedPatient(req.params.id, doctor.id) });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    await prisma.patient.update({
      where: { id: patient.id },
      data: { doctorId: null, doctorAssignedAt: null },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── PATCH /doctor/profile ─────────────────────────────
router.patch('/profile', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const { name, clinicName, phone } = req.body ?? {};

    if (typeof name === 'string' && name.trim()) {
      await prisma.user.update({ where: { id: doctor.userId }, data: { name: name.trim() } });
    }

    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        ...(typeof clinicName === 'string' ? { clinicName: clinicName.trim() } : {}),
        ...(typeof phone === 'string' ? { phone: phone.trim() } : {}),
      },
      include: { user: true },
    });

    res.json({
      id: updated.id,
      name: updated.user.name,
      email: updated.user.email,
      clinicName: updated.clinicName,
      phone: updated.phone,
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── Thresholds ─────────────────────────────
// Both routes previously had NO ownership check: any doctor could read or change any patient's alert
// thresholds, silently altering when someone else's patient triggers alerts.

const INT_FIELDS = ['systolicMax', 'diastolicMax', 'glucoseFastingMax', 'glucoseFastingMin', 'glucosePostMealMax', 'weightDeltaDays'] as const;
const FLOAT_FIELDS = ['weightDeltaKg'] as const;

router.get('/patients/:id/thresholds', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const patient = await prisma.patient.findFirst({
      where: ownedPatient(req.params.id, doctor.id),
      include: { threshold: true },
    });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const t = patient.threshold;
    res.json({
      patientId: patient.id,
      systolicMax: t?.systolicMax ?? 160,
      diastolicMax: t?.diastolicMax ?? 100,
      glucoseFastingMax: t?.glucoseFastingMax ?? 130,
      glucoseFastingMin: t?.glucoseFastingMin ?? 70,
      glucosePostMealMax: t?.glucosePostMealMax ?? 180,
      weightDeltaKg: t?.weightDeltaKg ?? 2,
      weightDeltaDays: t?.weightDeltaDays ?? 7,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/patients/:id/thresholds', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const patient = await prisma.patient.findFirst({
      where: ownedPatient(req.params.id, doctor.id),
      include: { threshold: true },
    });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const body = req.body ?? {};
    const data: Record<string, number> = {};

    for (const f of [...INT_FIELDS, ...FLOAT_FIELDS]) {
      if (body[f] === undefined) continue;
      const n = Number(body[f]);
      if (!Number.isFinite(n) || n <= 0) return res.status(400).json({ message: `${f} must be a positive number` });
      if ((INT_FIELDS as readonly string[]).includes(f) && !Number.isInteger(n)) {
        return res.status(400).json({ message: `${f} must be a whole number` });
      }
      data[f] = n;
    }

    const min = data.glucoseFastingMin ?? patient.threshold?.glucoseFastingMin ?? 70;
    const max = data.glucoseFastingMax ?? patient.threshold?.glucoseFastingMax ?? 130;
    if (min >= max) return res.status(400).json({ message: 'Fasting glucose minimum must be below the maximum' });

    // Omitted fields fall back to the schema defaults on create and stay unchanged on update.
    const updated = await prisma.patientThreshold.upsert({
      where: { patientId: patient.id },
      create: { patientId: patient.id, ...data },
      update: data,
    });

    res.json({
      patientId: updated.patientId,
      systolicMax: updated.systolicMax,
      diastolicMax: updated.diastolicMax,
      glucoseFastingMax: updated.glucoseFastingMax,
      glucoseFastingMin: updated.glucoseFastingMin,
      glucosePostMealMax: updated.glucosePostMealMax,
      weightDeltaKg: updated.weightDeltaKg,
      weightDeltaDays: updated.weightDeltaDays,
    });
  } catch (err) {
    next(err);
  }
});

export default router;