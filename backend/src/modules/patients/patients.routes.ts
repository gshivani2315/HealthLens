import { Router } from 'express';
import { prisma } from '../../db';
import { requireAuth } from '../../middleware/auth';
import { publishVitalLoggedEvent } from '../../kafka/producer';
import { GlucoseContext } from '@prisma/client';
import { alertForDoctor, alertForPatient } from '../alerts/alertSerializer';
import { hasActiveCareAssignment } from '../../middleware/accessGuard';

const router = Router();

// Helper: map string enums from DB to lowercase for frontend
function toLowerRisk(risk: string): 'normal' | 'moderate' | 'critical' {
  switch (risk.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'MODERATE': return 'moderate';
    default: return 'normal';
  }
}

function computeStats(values: number[], unit: string) {
  if (values.length === 0) return { average: 0, peak: 0, lowest: 0, unit };
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    average: Number(average.toFixed(1)),
    peak: Math.max(...values),
    lowest: Math.min(...values),
    unit,
  };
}

// Single source of truth authorization check for patient data
async function resolvePatientWithAuth(patientIdentifier: string, authUser: any) {
  // If 'me', lookup via auth user id
  if (patientIdentifier === 'me') {
    return prisma.patient.findFirst({
      where: {
        OR: [
          { userId: authUser.sub },
          { userId: authUser.dbUserId },
          { id: authUser.sub },
        ],
      },
      include: {
        user: true,
        conditions: true,
        doctor: { include: { user: true } },
        careAssignments: {
          where: { status: 'ACTIVE' },
          include: {
            doctor: { include: { user: true } },
            clinic: true,
          },
        },
        insight: true,
      },
    });
  }

  // Lookup by patient.id or patient.userId
  const patient = await prisma.patient.findFirst({
    where: {
      OR: [
        { id: patientIdentifier },
        { userId: patientIdentifier },
      ],
    },
    include: {
      user: true,
      conditions: true,
      doctor: { include: { user: true } },
      careAssignments: {
        where: { status: 'ACTIVE' },
        include: {
          doctor: { include: { user: true } },
          clinic: true,
        },
      },
      insight: true,
    },
  });

  if (!patient) return null;

  // Authorization check:
  // Allowed if:
  // 1. User is the patient
  // 2. User is a doctor with an ACTIVE CareAssignment with this patient
  const isOwnPatient =
    authUser.sub === patient.userId ||
    authUser.dbUserId === patient.userId ||
    authUser.sub === patient.id;

  if (isOwnPatient) return patient;

  if (authUser.role === 'DOCTOR') {
    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [
          { id: authUser.sub },
          { userId: authUser.sub },
          { userId: authUser.dbUserId },
        ],
      },
    });

    if (doctor) {
      // SINGLE ACCESS RULE GUARD: Active CareAssignment required
      const authorized = await hasActiveCareAssignment(doctor.id, patient.id);
      if (authorized) {
        return patient;
      }
    }
  }

  return 'FORBIDDEN';
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/profile
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/profile', requireAuth, async (req, res, next) => {
  try {
    const patientResult = await resolvePatientWithAuth(req.params.id, req.user);

    if (patientResult === 'FORBIDDEN') {
      return res.status(403).json({ message: 'Forbidden: access to this patient profile denied' });
    }
    if (!patientResult) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patientResult;
    const birthDate = patient.dateOfBirth ? new Date(patient.dateOfBirth) : new Date('1970-01-01');
    const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);

    const activeAssignments = patient.careAssignments || [];
    const primaryAssignment = activeAssignments[0];

    const docObj = primaryAssignment
      ? {
          id: primaryAssignment.doctor.id,
          name: primaryAssignment.doctor.user.name,
          clinicName: primaryAssignment.clinic?.name ?? 'HealthLens Clinic',
          phone: primaryAssignment.doctor.phone ?? undefined,
          email: primaryAssignment.doctor.user.email,
          specialty: primaryAssignment.specialty,
          assignedDate: primaryAssignment.assignedAt.toISOString(),
        }
      : patient.doctor
      ? {
          id: patient.doctor.id,
          name: patient.doctor.user.name,
          clinicName: patient.doctor.clinicName ?? 'HealthLens Clinic',
          phone: patient.doctor.phone ?? undefined,
          email: patient.doctor.user.email,
          assignedDate: patient.doctorAssignedAt?.toISOString(),
        }
      : {
          id: 'unassigned',
          name: 'No assigned physician',
          clinicName: 'HealthLens Network',
          email: '',
        };

    res.json({
      id: patient.id,
      name: patient.user.name,
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : '1970-01-01',
      age,
      gender: patient.gender ?? 'Unknown',
      phone: patient.phone ?? '',
      email: patient.user.email,
      conditions: patient.conditions.map((c) => ({ id: c.id, label: c.label })),
      doctor: docObj,
      careTeam: activeAssignments.map((ca: any) => ({
        assignmentId: ca.id,
        doctorId: ca.doctorId,
        doctorName: ca.doctor.user.name,
        specialty: ca.specialty,
        clinicName: ca.clinic?.name ?? 'HealthLens Clinic',
        clinicPhone: ca.clinic?.phone,
        assignedAt: ca.assignedAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /patients/:id/profile
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/profile', requireAuth, async (req, res, next) => {
  try {
    const patientResult = await resolvePatientWithAuth(req.params.id, req.user);

    if (patientResult === 'FORBIDDEN') {
      return res.status(403).json({ message: 'Forbidden: access to this patient profile denied' });
    }
    if (!patientResult) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patientResult;
    const { phone, gender, name } = req.body ?? {};

    if (name) {
      await prisma.user.update({
        where: { id: patient.userId },
        data: { name },
      });
    }

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(gender !== undefined ? { gender } : {}),
      },
      include: {
        user: true,
        conditions: true,
        doctor: { include: { user: true } },
        careAssignments: {
          where: { status: 'ACTIVE' },
          include: { doctor: { include: { user: true } }, clinic: true },
        },
      },
    });

    const birthDate = updated.dateOfBirth ? new Date(updated.dateOfBirth) : new Date('1970-01-01');
    const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);
    const primaryAssignment = updated.careAssignments?.[0];

    res.json({
      id: updated.id,
      name: updated.user.name,
      dateOfBirth: updated.dateOfBirth ? updated.dateOfBirth.toISOString().slice(0, 10) : '1970-01-01',
      age,
      gender: updated.gender ?? 'Unknown',
      phone: updated.phone ?? '',
      email: updated.user.email,
      conditions: updated.conditions.map((c) => ({ id: c.id, label: c.label })),
      doctor: {
        id: primaryAssignment?.doctor.id ?? updated.doctor?.id ?? 'unassigned',
        name: primaryAssignment?.doctor.user.name ?? updated.doctor?.user?.name ?? 'Assigned Doctor',
        clinicName: primaryAssignment?.clinic?.name ?? updated.doctor?.clinicName ?? 'HealthLens Clinic',
        email: primaryAssignment?.doctor.user.email ?? updated.doctor?.user?.email ?? '',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/dashboard
// ─────────────────────────────────────────────────────────────────────────────

type NumericVitalKey = 'systolic' | 'diastolic' | 'glucose' | 'weightKg' | 'sleepHours' | 'heartRate';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Mean of the non-null values for a field, or null if there are none. */
function meanOf(rows: Array<Partial<Record<NumericVitalKey, number | null>>>, key: NumericVitalKey): number | null {
  const values = rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Latest value minus prior-week mean. Null unless both sides exist. */
function deltaVsAvg(
  latestValue: number | null | undefined,
  priorRows: Array<Partial<Record<NumericVitalKey, number | null>>>,
  key: NumericVitalKey
): number | null {
  if (typeof latestValue !== 'number' || !Number.isFinite(latestValue)) return null;
  const mean = meanOf(priorRows, key);
  if (mean === null) return null;
  return round1(latestValue - mean);
}

router.get('/:id/dashboard', requireAuth, async (req, res, next) => {
  try {
    const patientResult = await resolvePatientWithAuth(req.params.id, req.user);

    if (patientResult === 'FORBIDDEN') {
      return res.status(403).json({ message: 'Forbidden: access to dashboard denied' });
    }
    if (!patientResult) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patientResult;

    // Last 14 readings, newest first
    const vitals = await prisma.vital.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' },
      take: 14,
    });

    const latest = vitals[0] ?? null;
    const priorWeek = vitals.slice(1, 8);

    const now = new Date();
    const isToday = latest ? latest.recordedAt.toDateString() === now.toDateString() : false;

    const alerts = await prisma.alert.findMany({
      where: { patientId: patient.id },
      orderBy: { triggeredAt: 'desc' },
      take: 5,
    });

    // Sparkline: only real values. Missing fields stay null, never invented.
    const sparkline = vitals
      .slice(0, 7)
      .reverse()
      .map((v) => ({
        date: v.recordedAt.toISOString(),
        systolic: v.systolic ?? null,
        diastolic: v.diastolic ?? null,
        glucose: v.glucose ?? null,
        heartRate: v.heartRate ?? null,
      }));

    const primaryAssignment = patient.careAssignments?.[0];

    const metric = (
      key: NumericVitalKey,
      label: string,
      unit: string,
      value: number | null | undefined
    ) => ({
      value: typeof value === 'number' ? value : null,
      changeVsWeekAvg: deltaVsAvg(value, priorWeek, key),
      unit,
      label,
    });

    res.json({
      patientName: patient.user.name,
      doctor: primaryAssignment
        ? {
            id: primaryAssignment.doctor.id,
            name: primaryAssignment.doctor.user.name,
            clinicName: primaryAssignment.clinic?.name ?? 'HealthLens Clinic',
            phone: primaryAssignment.doctor.phone ?? undefined,
            email: primaryAssignment.doctor.user.email,
            specialty: primaryAssignment.specialty,
            assignedDate: primaryAssignment.assignedAt.toISOString(),
          }
        : patient.doctor
        ? {
            id: patient.doctor.id,
            name: patient.doctor.user?.name ?? 'Your doctor',
            clinicName: patient.doctor.clinicName ?? '',
            phone: patient.doctor.phone ?? undefined,
            email: patient.doctor.user?.email ?? '',
            assignedDate: patient.doctorAssignedAt?.toISOString(),
          }
        : null,
      vitalsLoggedToday: isToday,
      latestReadingAt: latest ? latest.recordedAt.toISOString() : null,
      hasData: vitals.length > 0,
      metrics: {
        bloodPressure: {
          value: latest?.systolic ?? null,
          systolic: latest?.systolic ?? null,
          diastolic: latest?.diastolic ?? null,
          changeVsWeekAvg: deltaVsAvg(latest?.systolic, priorWeek, 'systolic'),
          unit: 'mmHg',
          label: 'Blood pressure',
        },
        glucose: metric('glucose', 'Blood glucose', 'mg/dL', latest?.glucose),
        weight: metric('weightKg', 'Weight', 'kg', latest?.weightKg),
        sleep: metric('sleepHours', 'Sleep', 'hrs', latest?.sleepHours),
        heartRate: metric('heartRate', 'Heart rate', 'bpm', latest?.heartRate),
      },
      aiInsight: patient.insight
        ? {
            generatedAt: patient.insight.generatedAt.toISOString(),
            summary: patient.insight.narrative,
          }
        : null,
      recentAlerts: alerts.map(req.user!.role === 'DOCTOR' ? alertForDoctor : alertForPatient),
      sparkline,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /patients/:id/vitals (Supports Heart Rate!)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/vitals', requireAuth, async (req, res, next) => {
  try {
    const patientResult = await resolvePatientWithAuth(req.params.id, req.user);

    if (patientResult === 'FORBIDDEN') {
      return res.status(403).json({ message: 'Forbidden: cannot log vitals for this patient' });
    }
    if (!patientResult) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patientResult;
    const body = req.body ?? {};

    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();

    let gContext: GlucoseContext | undefined;
    if (body.glucoseContext) {
      gContext = body.glucoseContext.toUpperCase() === 'POST_MEAL' ? GlucoseContext.POST_MEAL : GlucoseContext.FASTING;
    }

    const vital = await prisma.vital.create({
      data: {
        patientId: patient.id,
        systolic: body.systolic !== undefined && body.systolic !== null ? Number(body.systolic) : undefined,
        diastolic: body.diastolic !== undefined && body.diastolic !== null ? Number(body.diastolic) : undefined,
        glucose: body.glucose !== undefined && body.glucose !== null ? Number(body.glucose) : undefined,
        glucoseContext: gContext,
        weightKg: body.weightKg !== undefined && body.weightKg !== null ? Number(body.weightKg) : undefined,
        sleepHours: body.sleepHours !== undefined && body.sleepHours !== null ? Number(body.sleepHours) : undefined,
        heartRate: body.heartRate !== undefined && body.heartRate !== null ? Number(body.heartRate) : undefined,
        recordedAt,
      },
    });

    await prisma.patient.update({
      where: { id: patient.id },
      data: { lastReadingAt: recordedAt },
    });

    // Kafka event emission
    await publishVitalLoggedEvent({
      vitalId: vital.id,
      patientId: patient.id,
      recordedAt: vital.recordedAt,
    });

    res.status(201).json({
      id: vital.id,
      patientId: vital.patientId,
      recordedAt: vital.recordedAt.toISOString(),
      systolic: vital.systolic ?? undefined,
      diastolic: vital.diastolic ?? undefined,
      glucose: vital.glucose ?? undefined,
      glucoseContext: vital.glucoseContext ? vital.glucoseContext.toLowerCase() : undefined,
      weightKg: vital.weightKg ?? undefined,
      sleepHours: vital.sleepHours ?? undefined,
      heartRate: vital.heartRate ?? undefined,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/vitals
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/vitals', requireAuth, async (req, res, next) => {
  try {
    const patientResult = await resolvePatientWithAuth(req.params.id, req.user);

    if (patientResult === 'FORBIDDEN') {
      return res.status(403).json({ message: 'Forbidden: cannot access vitals' });
    }
    if (!patientResult) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patientResult;
    const range = (req.query.range as string) || '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const vitals = await prisma.vital.findMany({
      where: {
        patientId: patient.id,
        recordedAt: { gte: since },
      },
      orderBy: { recordedAt: 'asc' },
    });

    const points = vitals.map((v) => ({
      date: v.recordedAt.toISOString(),
      systolic: v.systolic ?? undefined,
      diastolic: v.diastolic ?? undefined,
      glucose: v.glucose ?? undefined,
      weightKg: v.weightKg ?? undefined,
      sleepHours: v.sleepHours ?? undefined,
      heartRate: v.heartRate ?? undefined,
    }));

    const stats: Record<string, ReturnType<typeof computeStats>> = {
      bp: computeStats(points.map((p) => p.systolic ?? 0).filter((v) => v > 0), 'mmHg'),
      glucose: computeStats(points.map((p) => p.glucose ?? 0).filter((v) => v > 0), 'mg/dL'),
      weight: computeStats(points.map((p) => p.weightKg ?? 0).filter((v) => v > 0), 'kg'),
      sleep: computeStats(points.map((p) => p.sleepHours ?? 0).filter((v) => v > 0), 'hrs'),
      heartRate: computeStats(points.map((p) => p.heartRate ?? 0).filter((v) => v > 0), 'bpm'),
    };

    res.json({ points, stats });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/vitals/log
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/vitals/log', requireAuth, async (req, res, next) => {
  try {
    const patientResult = await resolvePatientWithAuth(req.params.id, req.user);

    if (patientResult === 'FORBIDDEN') {
      return res.status(403).json({ message: 'Forbidden: cannot access vitals log' });
    }
    if (!patientResult) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patientResult;
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.max(1, Number(req.query.pageSize || 20));

    const [entries, total] = await Promise.all([
      prisma.vital.findMany({
        where: { patientId: patient.id },
        orderBy: { recordedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.vital.count({ where: { patientId: patient.id } }),
    ]);

    res.json({
      entries: entries.map((e) => ({
        id: e.id,
        patientId: e.patientId,
        recordedAt: e.recordedAt.toISOString(),
        systolic: e.systolic ?? undefined,
        diastolic: e.diastolic ?? undefined,
        glucose: e.glucose ?? undefined,
        glucoseContext: e.glucoseContext ? e.glucoseContext.toLowerCase() : undefined,
        weightKg: e.weightKg ?? undefined,
        sleepHours: e.sleepHours ?? undefined,
        heartRate: e.heartRate ?? undefined,
      })),
      total,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/summaries
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/summaries', requireAuth, async (req, res, next) => {
  try {
    const patientResult = await resolvePatientWithAuth(req.params.id, req.user);

    if (patientResult === 'FORBIDDEN') {
      return res.status(403).json({ message: 'Forbidden: cannot access summaries' });
    }
    if (!patientResult) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patientResult;
    const summaries = await prisma.weeklySummary.findMany({
      where: { patientId: patient.id },
      orderBy: { weekStart: 'desc' },
    });

    res.json(
      summaries.map((s) => ({
        id: s.id,
        patientId: s.patientId,
        weekStart: s.weekStart.toISOString(),
        weekEnd: s.weekEnd.toISOString(),
        generatedAt: s.generatedAt.toISOString(),
        narrative: s.narrative,
        takeaways: s.takeaways,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/alerts/history
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id/alerts/history', requireAuth, async (req, res, next) => {
  try {
    const patientResult = await resolvePatientWithAuth(req.params.id, req.user);

    if (patientResult === 'FORBIDDEN') {
      return res.status(403).json({ message: 'Forbidden: cannot access alert history' });
    }
    if (!patientResult) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const patient = patientResult;
    const alerts = await prisma.alert.findMany({
      where: { patientId: patient.id },
      orderBy: { triggeredAt: 'desc' },
    });

    const serialize = req.user!.role === 'DOCTOR' ? alertForDoctor : alertForPatient;
    res.json(alerts.map(serialize));
  } catch (err) {
    next(err);
  }
});

export default router;