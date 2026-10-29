// backend/src/modules/doctor/doctor.routes.ts
import crypto from 'crypto';
import { Router, Response } from 'express';
import { GlucoseContext, Prisma, RiskStatus } from '@prisma/client';
import { prisma } from '../../db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { supabaseAdmin } from '../../lib/supabase';
import { publishVitalLoggedEvent } from '../../kafka/producer';
import { alertForDoctor } from '../alerts/alertSerializer';
import {
  hasActiveCareAssignment,
  verifyDoctorPatientAccess,
  getActivePatientIdsForDoctor,
} from '../../middleware/accessGuard';

const router = Router();

type DoctorRecord = Prisma.DoctorGetPayload<{
  include: {
    user: true;
    clinicMemberships: { include: { clinic: true } };
  };
}>;

// Middleware: Require DOCTOR role and load doctor profile
router.use(requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findUnique({
      where: { userId: req.user!.dbUserId },
      include: {
        user: true,
        clinicMemberships: { include: { clinic: true } },
      },
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
  return crypto.randomBytes(9).toString('base64url'); // 12 chars
}

const rosterInclude = Prisma.validator<Prisma.PatientInclude>()({
  user: true,
  conditions: true,
  careAssignments: {
    include: {
      clinic: true,
      doctor: { include: { user: true } },
    },
  },
  vitals: { orderBy: { recordedAt: 'desc' }, take: 20 },
});
type RosterPatient = Prisma.PatientGetPayload<{ include: typeof rosterInclude }>;

function toRosterRow(p: RosterPatient, currentDoctorId?: string) {
  const bp = p.vitals.find((v) => v.systolic != null && v.diastolic != null);
  const glu = p.vitals.find((v) => v.glucose != null);
  const hr = p.vitals.find((v) => v.heartRate != null);

  const activeAssignments = (p.careAssignments || []).filter((a) => a.status === 'ACTIVE');
  const thisAssignment = activeAssignments.find((a) => a.doctorId === currentDoctorId) || activeAssignments[0];

  return {
    id: p.id,
    doctorId: thisAssignment?.doctorId ?? p.doctorId ?? undefined,
    specialty: thisAssignment?.specialty ?? 'General Practice',
    clinicName: thisAssignment?.clinic?.name ?? undefined,
    careTeamCount: activeAssignments.length,
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
    latestHeartRate: hr?.heartRate ?? null,
    riskStatus: toLowerRisk(p.riskStatus),
    lastReadingAt: p.lastReadingAt ? p.lastReadingAt.toISOString() : null,
  };
}

function buildProfile(
  p: {
    id: string;
    dateOfBirth: Date | null;
    gender: string | null;
    phone: string | null;
    doctorAssignedAt: Date | null;
    user: { name: string; email: string };
    conditions: { id: string; label: string }[];
    careAssignments?: any[];
  },
  doctor: DoctorRecord
) {
  const activeAssignments = (p.careAssignments || []).filter((a: any) => a.status === 'ACTIVE');
  const thisAssignment = activeAssignments.find((a: any) => a.doctorId === doctor.id);
  const primaryClinic = doctor.clinicMemberships?.[0]?.clinic;

  return {
    id: p.id,
    name: p.user.name,
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : '',
    age: ageOf(p.dateOfBirth),
    gender: p.gender ?? 'Unknown',
    phone: p.phone ?? '',
    email: p.user.email,
    conditions: p.conditions.map((c) => ({ id: c.id, label: c.label })),
    specialty: thisAssignment?.specialty ?? 'General Practice',
    clinic: thisAssignment?.clinic
      ? { id: thisAssignment.clinic.id, name: thisAssignment.clinic.name, phone: thisAssignment.clinic.phone }
      : primaryClinic
      ? { id: primaryClinic.id, name: primaryClinic.name, phone: primaryClinic.phone }
      : null,
    doctor: {
      id: doctor.id,
      name: doctor.user.name,
      clinicName: thisAssignment?.clinic?.name ?? primaryClinic?.name ?? doctor.clinicName ?? '',
      phone: doctor.phone ?? undefined,
      email: doctor.user.email,
      assignedDate: thisAssignment?.assignedAt?.toISOString() ?? p.doctorAssignedAt?.toISOString(),
    },
    careTeam: activeAssignments.map((a: any) => ({
      assignmentId: a.id,
      doctorId: a.doctorId,
      doctorName: a.doctor?.user?.name ?? 'Assigned Physician',
      specialty: a.specialty,
      clinicName: a.clinic?.name ?? 'HealthLens Clinic',
      assignedAt: a.assignedAt ? new Date(a.assignedAt).toISOString() : null,
    })),
  };
}

type InitialVitals = {
  systolic?: number;
  diastolic?: number;
  glucose?: number;
  weightKg?: number;
  sleepHours?: number;
  heartRate?: number;
};
type VitalsParse = { error: string } | { vitals: InitialVitals | null };

const opt = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));

function parseInitialVitals(b: any): VitalsParse {
  const v: InitialVitals = {
    systolic: opt(b.initialSystolic),
    diastolic: opt(b.initialDiastolic),
    glucose: opt(b.initialGlucose),
    weightKg: opt(b.initialWeightKg),
    sleepHours: opt(b.initialSleepHours),
    heartRate: opt(b.initialHeartRate),
  };
  const values = Object.values(v);
  if (values.every((x) => x === undefined)) return { vitals: null };
  if (values.some((x) => x !== undefined && !Number.isFinite(x))) return { error: 'Initial readings must be numbers' };
  if ((v.systolic === undefined) !== (v.diastolic === undefined)) {
    return { error: 'Enter both systolic and diastolic blood pressure, or neither' };
  }
  const within = (x: number | undefined, lo: number, hi: number) => x === undefined || (x >= lo && x <= hi);
  if (
    !within(v.systolic, 50, 300) ||
    !within(v.diastolic, 30, 200) ||
    !within(v.glucose, 20, 800) ||
    !within(v.weightKg, 20, 400) ||
    !within(v.sleepHours, 0, 24) ||
    !within(v.heartRate, 30, 250)
  ) {
    return { error: 'One or more initial readings are outside plausible ranges' };
  }
  return { vitals: v };
}

// ───────────────────────────── CLINICS ─────────────────────────────

router.get('/clinics', async (_req, res, next) => {
  try {
    const doctor = doc(res);
    const memberships = await prisma.clinicMember.findMany({
      where: { doctorId: doctor.id },
      include: {
        clinic: {
          include: {
            members: { include: { doctor: { include: { user: true } } } },
            assignments: { where: { status: 'ACTIVE' } },
          },
        },
      },
    });

    res.json(
      memberships.map((m: any) => ({
        id: m.clinic.id,
        name: m.clinic.name,
        role: m.role,
        phone: m.clinic.phone,
        address: m.clinic.address,
        activePatientsCount: m.clinic.assignments?.length ?? 0,
        staffCount: m.clinic.members?.length ?? 0,
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/clinics', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const { name, phone, address, role } = req.body ?? {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Clinic name is required' });
    }

    const clinic = await prisma.clinic.create({
      data: {
        name: name.trim(),
        phone: phone ? String(phone).trim() : null,
        address: address ? String(address).trim() : null,
      },
    });

    await prisma.clinicMember.create({
      data: {
        doctorId: doctor.id,
        clinicId: clinic.id,
        role: role ? String(role).trim() : 'PHYSICIAN',
      },
    });

    res.status(201).json(clinic);
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── GET /doctor/overview ─────────────────────────────
router.get('/overview', async (_req, res, next) => {
  try {
    const doctor = doc(res);
    const patientIds = await getActivePatientIdsForDoctor(doctor.id);

    const patients = await prisma.patient.findMany({
      where: { id: { in: patientIds } },
      include: rosterInclude,
    });

    const alertScope = {
      status: 'UNREAD' as const,
      patientId: { in: patientIds },
    };

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
      roster: patients.map((p) => toRosterRow(p, doctor.id)),
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

    const patientIds = await getActivePatientIdsForDoctor(doctor.id);

    const where: Prisma.PatientWhereInput = {
      id: { in: patientIds },
    };

    if (search) where.user = { name: { contains: search, mode: 'insensitive' } };
    if (filter === 'critical') where.riskStatus = 'CRITICAL';
    else if (filter === 'needs_review') where.riskStatus = { not: 'NORMAL' };

    const patients = await prisma.patient.findMany({ where, include: rosterInclude });
    res.json(patients.map((p) => toRosterRow(p, doctor.id)));
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

    // Determine clinic for care assignment
    const clinicId = b.clinicId || doctor.clinicMemberships?.[0]?.clinicId || `clinic_${doctor.id}`;
    const specialty = typeof b.specialty === 'string' && b.specialty.trim() ? b.specialty.trim() : 'Primary Care';

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
        message: exists
          ? 'A user with this email already exists'
          : `Could not create the patient's login: ${supaErr?.message}`,
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
            doctorId: doctor.id, // Legacy compatibility
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

        // Create the ACTIVE CareAssignment linking patient to doctor and clinic
        await tx.careAssignment.create({
          data: {
            patientId: patient.id,
            doctorId: doctor.id,
            clinicId,
            specialty,
            status: 'ACTIVE',
            assignedAt: new Date(),
          },
        });

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

    if (initialVital) {
      await publishVitalLoggedEvent({
        vitalId: (initialVital as { id: string }).id,
        patientId,
        recordedAt: (initialVital as { recordedAt: Date }).recordedAt,
      });
    }

    const fresh = await prisma.patient.findUniqueOrThrow({ where: { id: patientId }, include: rosterInclude });

    res.set('Cache-Control', 'no-store');
    res.status(201).json({ ...toRosterRow(fresh, doctor.id), temporaryPassword: tempPassword });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── GET /doctor/patients/:id ─────────────────────────────
router.get('/patients/:id', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const access = await verifyDoctorPatientAccess(doctor.id, req.params.id, {
      user: true,
      conditions: true,
      insight: true,
      careAssignments: {
        include: {
          clinic: true,
          doctor: { include: { user: true } },
        },
      },
    });

    if (!access.authorized) {
      return res.status(access.status).json({ message: access.message });
    }

    const patient = access.patient;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [alerts, vitals] = await Promise.all([
      prisma.alert.findMany({
        where: { patientId: patient.id },
        orderBy: { triggeredAt: 'desc' },
        take: 10,
      }),
      prisma.vital.findMany({
        where: { patientId: patient.id, recordedAt: { gte: since } },
        orderBy: { recordedAt: 'desc' },
        take: 500,
      }),
    ]);

    res.json({
      profile: buildProfile(patient, doctor),
      riskStatus: toLowerRisk(patient.riskStatus),
      aiClinicalInsight: patient.insight
        ? { generatedAt: patient.insight.generatedAt.toISOString(), narrative: patient.insight.narrative }
        : null,
      alertHistory: alerts.map(alertForDoctor),
      vitalsLog: vitals.map((v) => ({
        id: v.id,
        patientId: v.patientId,
        recordedAt: v.recordedAt.toISOString(),
        systolic: v.systolic ?? undefined,
        diastolic: v.diastolic ?? undefined,
        glucose: v.glucose ?? undefined,
        glucoseContext: v.glucoseContext ? v.glucoseContext.toLowerCase() : undefined,
        weightKg: v.weightKg ?? undefined,
        sleepHours: v.sleepHours ?? undefined,
        heartRate: v.heartRate ?? undefined,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── PATCH /doctor/patients/:id (Edit Patient) ─────────────────────────────
router.patch('/patients/:id', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const access = await verifyDoctorPatientAccess(doctor.id, req.params.id, {
      user: true,
      conditions: true,
      careAssignments: { include: { clinic: true, doctor: { include: { user: true } } } },
    });

    if (!access.authorized) {
      return res.status(access.status).json({ message: access.message });
    }

    const patient = access.patient;
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
        // Update specialty or clinic assignment if provided
        if (b.specialty || b.clinicId) {
          await tx.careAssignment.updateMany({
            where: { patientId: patient.id, doctorId: doctor.id, status: 'ACTIVE' },
            data: {
              ...(b.specialty ? { specialty: String(b.specialty).trim() } : {}),
              ...(b.clinicId ? { clinicId: String(b.clinicId).trim() } : {}),
            },
          });
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
      include: {
        user: true,
        conditions: true,
        careAssignments: { include: { clinic: true, doctor: { include: { user: true } } } },
      },
    });
    res.json(buildProfile(fresh, doctor));
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── DELETE /doctor/patients/:id (Remove from care) ─────────────────────────────
// Unassigns the patient from THIS doctor by ending active CareAssignments.
// Other doctors' assignments, patient account, and data remain intact.
router.delete('/patients/:id', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const access = await verifyDoctorPatientAccess(doctor.id, req.params.id);

    if (!access.authorized) {
      return res.status(access.status).json({ message: access.message });
    }

    const patient = access.patient;

    // End all active CareAssignments between this doctor and patient
    await prisma.careAssignment.updateMany({
      where: {
        doctorId: doctor.id,
        patientId: patient.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
      },
    });

    // Clear legacy doctorId if it matched this doctor
    if (patient.doctorId === doctor.id) {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { doctorId: null, doctorAssignedAt: null },
      });
    }

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
      include: {
        user: true,
        clinicMemberships: { include: { clinic: true } },
      },
    });

    // If clinicName was updated and doctor has a primary clinic, keep clinic name synchronized
    if (typeof clinicName === 'string' && clinicName.trim() && updated.clinicMemberships?.[0]?.clinicId) {
      await prisma.clinic.update({
        where: { id: updated.clinicMemberships[0].clinicId },
        data: { name: clinicName.trim() },
      });
    }

    res.json({
      id: updated.id,
      name: updated.user.name,
      email: updated.user.email,
      clinicName: updated.clinicMemberships?.[0]?.clinic?.name ?? updated.clinicName,
      phone: updated.phone,
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── Thresholds ─────────────────────────────
// Shared per patient across all assigned doctors. Uses verifyDoctorPatientAccess.
const INT_FIELDS = [
  'systolicMax',
  'diastolicMax',
  'glucoseFastingMax',
  'glucoseFastingMin',
  'glucosePostMealMax',
  'weightDeltaDays',
  'heartRateMax',
  'heartRateMin',
] as const;
const FLOAT_FIELDS = ['weightDeltaKg'] as const;

router.get('/patients/:id/thresholds', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const access = await verifyDoctorPatientAccess(doctor.id, req.params.id, { threshold: true });

    if (!access.authorized) {
      return res.status(access.status).json({ message: access.message });
    }

    const t = access.patient.threshold;
    res.json({
      patientId: access.patient.id,
      systolicMax: t?.systolicMax ?? 160,
      diastolicMax: t?.diastolicMax ?? 100,
      glucoseFastingMax: t?.glucoseFastingMax ?? 130,
      glucoseFastingMin: t?.glucoseFastingMin ?? 70,
      glucosePostMealMax: t?.glucosePostMealMax ?? 180,
      weightDeltaKg: t?.weightDeltaKg ?? 2,
      weightDeltaDays: t?.weightDeltaDays ?? 7,
      heartRateMax: t?.heartRateMax ?? 120,
      heartRateMin: t?.heartRateMin ?? 50,
    });
  } catch (err) {
    next(err);
  }
});

router.put('/patients/:id/thresholds', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const access = await verifyDoctorPatientAccess(doctor.id, req.params.id, { threshold: true });

    if (!access.authorized) {
      return res.status(access.status).json({ message: access.message });
    }

    const patient = access.patient;
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

    const minGlu = data.glucoseFastingMin ?? patient.threshold?.glucoseFastingMin ?? 70;
    const maxGlu = data.glucoseFastingMax ?? patient.threshold?.glucoseFastingMax ?? 130;
    if (minGlu >= maxGlu) return res.status(400).json({ message: 'Fasting glucose minimum must be below the maximum' });

    const minHr = data.heartRateMin ?? patient.threshold?.heartRateMin ?? 50;
    const maxHr = data.heartRateMax ?? patient.threshold?.heartRateMax ?? 120;
    if (minHr >= maxHr) return res.status(400).json({ message: 'Minimum heart rate must be below maximum heart rate' });

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
      heartRateMax: updated.heartRateMax,
      heartRateMin: updated.heartRateMin,
    });
  } catch (err) {
    next(err);
  }
});

// ───────────────────────────── Manual Weekly Summary Trigger ─────────────────────────────
// "Weekly scheduler: Verify the cron settings, add a manual trigger"
router.post('/patients/:id/generate-summary', async (req, res, next) => {
  try {
    const doctor = doc(res);
    const access = await verifyDoctorPatientAccess(doctor.id, req.params.id);

    if (!access.authorized) {
      return res.status(access.status).json({ message: access.message });
    }

    const patientId = access.patient.id;
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch vitals from the past 7 days
    const vitals = await prisma.vital.findMany({
      where: { patientId, recordedAt: { gte: weekStart } },
      orderBy: { recordedAt: 'desc' },
    });

    const bpReadings = vitals.filter((v) => v.systolic && v.diastolic);
    const avgSys = bpReadings.length
      ? Math.round(bpReadings.reduce((sum, v) => sum + (v.systolic || 0), 0) / bpReadings.length)
      : 120;
    const avgDia = bpReadings.length
      ? Math.round(bpReadings.reduce((sum, v) => sum + (v.diastolic || 0), 0) / bpReadings.length)
      : 80;

    const summary = await prisma.weeklySummary.upsert({
      where: {
        patientId_weekStart: {
          patientId,
          weekStart: new Date(new Date().setUTCHours(12, 0, 0, 0)),
        },
      },
      create: {
        patientId,
        weekStart: new Date(new Date().setUTCHours(12, 0, 0, 0)),
        weekEnd: now,
        narrative: `Manual summary generated on ${now.toLocaleDateString()}. Patient logged ${vitals.length} readings over the monitored period. Blood pressure averaged ${avgSys}/${avgDia} mmHg. Target compliance remains consistent.`,
        takeaways: [
          `${vitals.length} vitals submissions recorded`,
          `Average blood pressure: ${avgSys}/${avgDia} mmHg`,
          `Clinical review initiated by Dr. ${doctor.user.name}`,
        ],
        trend: 'STABLE',
        model: 'manual-trigger',
      },
      update: {
        generatedAt: now,
        narrative: `Manual summary refreshed on ${now.toLocaleDateString()}. Patient logged ${vitals.length} readings over the monitored period. Blood pressure averaged ${avgSys}/${avgDia} mmHg.`,
        takeaways: [
          `${vitals.length} vitals submissions recorded`,
          `Average blood pressure: ${avgSys}/${avgDia} mmHg`,
          `Refreshed by Dr. ${doctor.user.name}`,
        ],
      },
    });

    res.json(summary);
  } catch (err) {
    next(err);
  }
});

export default router;
