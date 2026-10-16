import { Router } from 'express';
import { prisma } from '../../db';
import { requireAuth } from '../../middleware/auth';
import { publishVitalLoggedEvent } from '../../kafka/producer';
import { GlucoseContext } from '@prisma/client';
import { alertForDoctor, alertForPatient } from '../alerts/alertSerializer';

const router = Router();

// Helper: map string enums from DB to lowercase for frontend
function toLowerRisk(risk: string): 'normal' | 'moderate' | 'critical' {
  switch (risk.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'MODERATE': return 'moderate';
    default: return 'normal';
  }
}

function toLowerSeverity(sev: string): 'info' | 'caution' | 'critical' {
  switch (sev.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'CAUTION': return 'caution';
    default: return 'info';
  }
}

function toLowerStatus(status: string): 'unread' | 'acknowledged' | 'resolved' {
  switch (status.toUpperCase()) {
    case 'ACKNOWLEDGED': return 'acknowledged';
    case 'RESOLVED': return 'resolved';
    default: return 'unread';
  }
}

function toLowerType(type: string): 'threshold' | 'ai_pattern' {
  return type.toUpperCase() === 'AI_PATTERN' ? 'ai_pattern' : 'threshold';
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

// Helper to resolve patient by id or userId with authorization
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
      insight: true,
    },
  });

  if (!patient) return null;

  // Authorization check:
  // Allowed if:
  // 1. User is the patient
  // 2. User is a doctor assigned to this patient
  const isOwnPatient =
    authUser.sub === patient.userId ||
    authUser.dbUserId === patient.userId ||
    authUser.sub === patient.id;

  if (isOwnPatient) return patient;

  if (authUser.role === 'DOCTOR') {
    // Check if doctor matches
    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [
          { id: authUser.sub },
          { userId: authUser.sub },
          { userId: authUser.dbUserId },
        ],
      },
    });
    if (doctor && patient.doctorId === doctor.id) {
      return patient;
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

    const docUser = patient.doctor?.user;
    const docObj = {
      id: patient.doctor?.id ?? 'doc_001',
      name: docUser?.name ?? 'Dr. Elena Ruiz',
      clinicName: patient.doctor?.clinicName ?? 'Meridian Family Health',
      phone: patient.doctor?.phone ?? undefined,
      email: docUser?.email ?? 'doctor@healthlens.demo',
      assignedDate: patient.doctorAssignedAt?.toISOString(),
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
      },
    });

    const birthDate = updated.dateOfBirth ? new Date(updated.dateOfBirth) : new Date('1970-01-01');
    const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);

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
        id: updated.doctor?.id ?? 'doc_001',
        name: updated.doctor?.user?.name ?? 'Dr. Elena Ruiz',
        clinicName: updated.doctor?.clinicName ?? 'Meridian Family Health',
        email: updated.doctor?.user?.email ?? 'doctor@healthlens.demo',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/dashboard
// ─────────────────────────────────────────────────────────────────────────────
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

    // Fetch last 14 days of vitals
    const vitals = await prisma.vital.findMany({
      where: { patientId: patient.id },
      orderBy: { recordedAt: 'desc' },
      take: 14,
    });

    const latest = vitals[0] ?? null;
    const priorWeek = vitals.slice(1, 8);

    const avg = (key: 'systolic' | 'glucose' | 'weightKg' | 'sleepHours') => {
      const valid = priorWeek.filter((v) => v[key] != null);
      if (valid.length === 0) return 0;
      return valid.reduce((sum, v) => sum + (Number(v[key]) || 0), 0) / valid.length;
    };

    const now = new Date();
    const isToday = latest
      ? new Date(latest.recordedAt).toDateString() === now.toDateString()
      : false;

    const alerts = await prisma.alert.findMany({
      where: { patientId: patient.id },
      orderBy: { triggeredAt: 'desc' },
      take: 5,
    });

    const sparkline = vitals
      .slice(0, 7)
      .reverse()
      .map((v) => ({
        date: v.recordedAt.toISOString(),
        systolic: v.systolic ?? 120,
        diastolic: v.diastolic ?? 80,
        glucose: v.glucose ?? 100,
      }));

    res.json({
      patientName: patient.user.name,
      // doctor: {
      //   id: patient.doctor?.id ?? 'doc_001',
      //   name: patient.doctor?.user?.name ?? 'Dr. Elena Ruiz',
      //   clinicName: patient.doctor?.clinicName ?? 'Meridian Family Health',
      //   email: patient.doctor?.user?.email ?? 'doctor@healthlens.demo',
      // }, 
      doctor: patient.doctor
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
      metrics: {
        bloodPressure: {
          value: latest?.systolic ?? 120,
          systolic: latest?.systolic ?? 120,
          diastolic: latest?.diastolic ?? 80,
          changeVsWeekAvg: latest?.systolic ? Number((latest.systolic - avg('systolic')).toFixed(1)) : 0,
          unit: 'mmHg',
          label: 'Blood pressure',
        },
        glucose: {
          value: latest?.glucose ?? 100,
          changeVsWeekAvg: latest?.glucose ? Number((latest.glucose - avg('glucose')).toFixed(1)) : 0,
          unit: 'mg/dL',
          label: 'Blood glucose',
        },
        weight: {
          value: latest?.weightKg ?? 70,
          changeVsWeekAvg: latest?.weightKg ? Number((latest.weightKg - avg('weightKg')).toFixed(1)) : 0,
          unit: 'kg',
          label: 'Weight',
        },
        sleep: {
          value: latest?.sleepHours ?? 7,
          changeVsWeekAvg: latest?.sleepHours ? Number((latest.sleepHours - avg('sleepHours')).toFixed(1)) : 0,
          unit: 'hrs',
          label: 'Sleep',
        },
      },
      aiInsight: patient.insight
        ? {
            generatedAt: patient.insight.generatedAt.toISOString(),
            summary: patient.insight.narrative,
          }
        : null,
      // recentAlerts: alerts.map((a) => ({
      //   id: a.id,
      //   patientId: a.patientId,
      //   type: toLowerType(a.type),
      //   severity: toLowerSeverity(a.severity),
      //   status: toLowerStatus(a.status),
      //   triggerLabel: a.triggerLabel,
      //   detail: a.detail ?? undefined,
      //   triggeredAt: a.triggeredAt.toISOString(),
      // }))
      recentAlerts: alerts.map(req.user!.role === 'DOCTOR' ? alertForDoctor : alertForPatient),
      sparkline,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /patients/:id/vitals
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
        systolic: body.systolic !== undefined ? Number(body.systolic) : undefined,
        diastolic: body.diastolic !== undefined ? Number(body.diastolic) : undefined,
        glucose: body.glucose !== undefined ? Number(body.glucose) : undefined,
        glucoseContext: gContext,
        weightKg: body.weightKg !== undefined ? Number(body.weightKg) : undefined,
        sleepHours: body.sleepHours !== undefined ? Number(body.sleepHours) : undefined,
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
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/vitals?range=7d|30d|90d&filter=all|bp|glucose|weight|sleep
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
    }));

    const stats: Record<string, ReturnType<typeof computeStats>> = {
      bp: computeStats(points.map((p) => p.systolic ?? 0).filter((v) => v > 0), 'mmHg'),
      glucose: computeStats(points.map((p) => p.glucose ?? 0).filter((v) => v > 0), 'mg/dL'),
      weight: computeStats(points.map((p) => p.weightKg ?? 0).filter((v) => v > 0), 'kg'),
      sleep: computeStats(points.map((p) => p.sleepHours ?? 0).filter((v) => v > 0), 'hrs'),
    };

    res.json({ points, stats });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /patients/:id/vitals/log?page=1&pageSize=20
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

    // res.json(
    //   alerts.map((a) => ({
    //     id: a.id,
    //     patientId: a.patientId,
    //     type: toLowerType(a.type),
    //     severity: toLowerSeverity(a.severity),
    //     status: toLowerStatus(a.status),
    //     triggerLabel: a.triggerLabel,
    //     detail: a.detail ?? undefined,
    //     triggeredAt: a.triggeredAt.toISOString(),
    //     clinicalNote: a.clinicalNote ?? undefined,
    //   }))
    // );
    const serialize = req.user!.role === 'DOCTOR' ? alertForDoctor : alertForPatient;
    res.json(alerts.map(serialize));
  } catch (err) {
    next(err);
  }
});

export default router;
