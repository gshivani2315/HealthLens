import bcrypt from 'bcrypt';
import { Router } from 'express';
import { prisma } from '../../db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { GlucoseContext, RiskStatus } from '@prisma/client';

const router = Router();

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

// ─────────────────────────────────────────────────────────────────────────────
// GET /doctor/overview
// ─────────────────────────────────────────────────────────────────────────────
router.get('/overview', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [
          { userId: req.user!.sub },
          { userId: req.user!.dbUserId },
          { id: req.user!.sub },
        ],
      },
    });

    const wherePatient = doctor ? { doctorId: doctor.id } : {};

    const patients = await prisma.patient.findMany({
      where: wherePatient,
      include: {
        user: true,
        conditions: true,
        vitals: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      },
    });

    const patientIds = patients.map((p) => p.id);

    const urgentAlerts = await prisma.alert.findMany({
      where: {
        status: 'UNREAD',
        patientId: { in: patientIds },
      },
      include: { patient: { include: { user: true } } },
      orderBy: { triggeredAt: 'desc' },
    });

    const criticalCount = urgentAlerts.filter((a) => a.severity === 'CRITICAL').length;

    const now = Date.now();
    const missing48h = patients.filter((p) => {
      if (!p.lastReadingAt) return true;
      return now - new Date(p.lastReadingAt).getTime() > 48 * 60 * 60 * 1000;
    }).length;

    const roster = patients.map((p) => {
      const latest = p.vitals[0];
      const birthDate = p.dateOfBirth ? new Date(p.dateOfBirth) : new Date('1970-01-01');
      const age = Math.abs(new Date(now - birthDate.getTime()).getUTCFullYear() - 1970);

      return {
        id: p.id,
        doctorId: p.doctorId ?? undefined,
        name: p.user.name,
        email: p.user.email,
        phone: p.phone ?? undefined,
        dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : undefined,
        age,
        gender: p.gender ?? 'Unknown',
        primaryCondition: p.conditions[0]?.label ?? 'General Monitoring',
        conditions: p.conditions.map((c) => ({ id: c.id, label: c.label })),
        latestBloodPressure: latest?.systolic && latest?.diastolic
          ? { systolic: latest.systolic, diastolic: latest.diastolic }
          : null,
        latestGlucose: latest?.glucose ?? null,
        riskStatus: toLowerRisk(p.riskStatus),
        lastReadingAt: p.lastReadingAt ? p.lastReadingAt.toISOString() : null,
      };
    });

    res.json({
      totalPatients: patients.length,
      criticalAlertsPending: criticalCount,
      missingReadings48h: missing48h,
      urgentAlerts: urgentAlerts.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        patientName: a.patient.user.name,
        type: toLowerType(a.type),
        severity: toLowerSeverity(a.severity),
        status: toLowerStatus(a.status),
        triggerLabel: a.triggerLabel,
        detail: a.detail ?? undefined,
        triggeredAt: a.triggeredAt.toISOString(),
      })),
      roster,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /doctor/patients?search=&filter=all|critical|needs_review
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patients', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const search = (req.query.search as string) || '';
    const filter = (req.query.filter as string) || 'all';

    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [
          { userId: req.user!.sub },
          { userId: req.user!.dbUserId },
          { id: req.user!.sub },
        ],
      },
    });

    const where: any = {};
    if (doctor) {
      where.doctorId = doctor.id;
    }
    if (search) {
      where.user = { name: { contains: search, mode: 'insensitive' } };
    }
    if (filter === 'critical') {
      where.riskStatus = 'CRITICAL';
    } else if (filter === 'needs_review') {
      where.riskStatus = { not: 'NORMAL' };
    }

    const patients = await prisma.patient.findMany({
      where,
      include: {
        user: true,
        conditions: true,
        vitals: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
        },
      },
    });

    const now = Date.now();
    const roster = patients.map((p) => {
      const latest = p.vitals[0];
      const birthDate = p.dateOfBirth ? new Date(p.dateOfBirth) : new Date('1970-01-01');
      const age = Math.abs(new Date(now - birthDate.getTime()).getUTCFullYear() - 1970);

      return {
        id: p.id,
        doctorId: p.doctorId ?? undefined,
        name: p.user.name,
        email: p.user.email,
        phone: p.phone ?? undefined,
        dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : undefined,
        age,
        gender: p.gender ?? 'Unknown',
        primaryCondition: p.conditions[0]?.label ?? 'General Monitoring',
        conditions: p.conditions.map((c) => ({ id: c.id, label: c.label })),
        latestBloodPressure: latest?.systolic && latest?.diastolic
          ? { systolic: latest.systolic, diastolic: latest.diastolic }
          : null,
        latestGlucose: latest?.glucose ?? null,
        riskStatus: toLowerRisk(p.riskStatus),
        lastReadingAt: p.lastReadingAt ? p.lastReadingAt.toISOString() : null,
      };
    });

    res.json(roster);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /doctor/patients (Add Patient)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/patients', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const {
      name,
      firstName,
      lastName,
      email,
      dateOfBirth,
      gender,
      phone,
      conditions,
      riskStatus,
      initialSystolic,
      initialDiastolic,
      initialGlucose,
      initialWeightKg,
      initialSleepHours,
    } = req.body ?? {};

    const fullName = name?.trim() || `${firstName?.trim() || ''} ${lastName?.trim() || ''}`.trim();

    if (!fullName || !email || !dateOfBirth) {
      return res.status(400).json({ message: 'Name, email, and date of birth are required' });
    }

    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [
          { userId: req.user!.sub },
          { userId: req.user!.dbUserId },
          { id: req.user!.sub },
        ],
      },
    });

    if (!doctor) {
      return res.status(403).json({ message: 'Doctor profile not found for this account' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists' });
    }

    const initialPasswordHash = await bcrypt.hash('demo1234', 10);

    const conditionLabels: string[] = Array.isArray(conditions)
      ? conditions
      : typeof conditions === 'string'
      ? conditions.split(',').map((c: string) => c.trim()).filter(Boolean)
      : ['General Monitoring'];

    const riskEnum: RiskStatus =
      riskStatus?.toUpperCase() === 'CRITICAL'
        ? RiskStatus.CRITICAL
        : riskStatus?.toUpperCase() === 'MODERATE'
        ? RiskStatus.MODERATE
        : RiskStatus.NORMAL;

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email.trim().toLowerCase(),
          password: initialPasswordHash,
          name: fullName,
          role: 'PATIENT',
        },
      });

      const patient = await tx.patient.create({
        data: {
          userId: user.id,
          doctorId: doctor.id,
          doctorAssignedAt: new Date(),
          gender: gender || 'Unknown',
          phone: phone || '',
          dateOfBirth: new Date(dateOfBirth),
          riskStatus: riskEnum,
          conditions: {
            create: conditionLabels.map((label) => ({ label })),
          },
          threshold: {
            create: {},
          },
        },
        include: {
          conditions: true,
          user: true,
        },
      });

      // If initial telemetry was provided, log first vital reading
      let latestBp = null;
      let latestGlu = null;
      if (initialSystolic || initialDiastolic || initialGlucose || initialWeightKg || initialSleepHours) {
        const vital = await tx.vital.create({
          data: {
            patientId: patient.id,
            systolic: initialSystolic ? Number(initialSystolic) : undefined,
            diastolic: initialDiastolic ? Number(initialDiastolic) : undefined,
            glucose: initialGlucose ? Number(initialGlucose) : undefined,
            glucoseContext: GlucoseContext.FASTING,
            weightKg: initialWeightKg ? Number(initialWeightKg) : undefined,
            sleepHours: initialSleepHours ? Number(initialSleepHours) : undefined,
            recordedAt: new Date(),
          },
        });

        await tx.patient.update({
          where: { id: patient.id },
          data: { lastReadingAt: vital.recordedAt },
        });

        if (vital.systolic && vital.diastolic) {
          latestBp = { systolic: vital.systolic, diastolic: vital.diastolic };
        }
        latestGlu = vital.glucose ?? null;
      }

      const birthDate = new Date(dateOfBirth);
      const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);

      return {
        id: patient.id,
        doctorId: doctor.id,
        name: user.name,
        email: user.email,
        phone: patient.phone,
        dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10),
        age,
        gender: patient.gender,
        primaryCondition: conditionLabels[0] || 'General Monitoring',
        conditions: patient.conditions.map((c) => ({ id: c.id, label: c.label })),
        latestBloodPressure: latestBp,
        latestGlucose: latestGlu,
        riskStatus: toLowerRisk(patient.riskStatus),
        lastReadingAt: patient.lastReadingAt?.toISOString() || null,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /doctor/patients/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patients/:id', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [
          { userId: req.user!.sub },
          { userId: req.user!.dbUserId },
          { id: req.user!.sub },
        ],
      },
    });

    const patient = await prisma.patient.findFirst({
      where: { OR: [{ id }, { userId: id }] },
      include: {
        user: true,
        conditions: true,
        doctor: { include: { user: true } },
        insight: true,
        alerts: {
          orderBy: { triggeredAt: 'desc' },
          take: 10,
        },
        vitals: {
          orderBy: { recordedAt: 'desc' },
          take: 30,
        },
      },
    });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    if (doctor && patient.doctorId && patient.doctorId !== doctor.id) {
      return res.status(403).json({ message: 'Forbidden: patient is assigned to another physician' });
    }

    const birthDate = patient.dateOfBirth ? new Date(patient.dateOfBirth) : new Date('1970-01-01');
    const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);

    const docObj = {
      id: patient.doctor?.id ?? doctor?.id ?? 'doc_001',
      name: patient.doctor?.user?.name ?? doctor?.clinicName ?? 'Dr. Elena Ruiz',
      clinicName: patient.doctor?.clinicName ?? doctor?.clinicName ?? 'Meridian Family Health',
      email: patient.doctor?.user?.email ?? 'doctor@healthlens.demo',
    };

    res.json({
      profile: {
        id: patient.id,
        name: patient.user.name,
        dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : '1970-01-01',
        age,
        gender: patient.gender ?? 'Unknown',
        phone: patient.phone ?? '',
        email: patient.user.email,
        conditions: patient.conditions.map((c) => ({ id: c.id, label: c.label })),
        doctor: docObj,
      },
      riskStatus: toLowerRisk(patient.riskStatus),
      aiClinicalInsight: {
        generatedAt: patient.insight?.generatedAt.toISOString() ?? new Date().toISOString(),
        narrative: patient.insight?.narrative ?? 'Vitals are tracking within monitored targets.',
      },
      alertHistory: patient.alerts.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        type: toLowerType(a.type),
        severity: toLowerSeverity(a.severity),
        status: toLowerStatus(a.status),
        triggerLabel: a.triggerLabel,
        detail: a.detail ?? undefined,
        triggeredAt: a.triggeredAt.toISOString(),
        clinicalNote: a.clinicalNote ?? undefined,
      })),
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

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /doctor/profile
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/profile', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const { name, clinicName, phone } = req.body ?? {};

    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [
          { userId: req.user!.sub },
          { userId: req.user!.dbUserId },
          { id: req.user!.sub },
        ],
      },
      include: { user: true },
    });

    if (!doctor) {
      return res.status(404).json({ message: 'Doctor profile not found' });
    }

    if (name) {
      await prisma.user.update({
        where: { id: doctor.userId },
        data: { name },
      });
    }

    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        ...(clinicName !== undefined ? { clinicName } : {}),
        ...(phone !== undefined ? { phone } : {}),
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /doctor/patients/:id/thresholds
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patients/:id/thresholds', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const patient = await prisma.patient.findFirst({
      where: { OR: [{ id }, { userId: id }] },
      include: { threshold: true },
    });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// PUT /doctor/patients/:id/thresholds
// ─────────────────────────────────────────────────────────────────────────────
router.put('/patients/:id/thresholds', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = req.body ?? {};

    const patient = await prisma.patient.findFirst({
      where: { OR: [{ id }, { userId: id }] },
    });

    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }

    const updated = await prisma.patientThreshold.upsert({
      where: { patientId: patient.id },
      create: {
        patientId: patient.id,
        systolicMax: body.systolicMax !== undefined ? Number(body.systolicMax) : 160,
        diastolicMax: body.diastolicMax !== undefined ? Number(body.diastolicMax) : 100,
        glucoseFastingMax: body.glucoseFastingMax !== undefined ? Number(body.glucoseFastingMax) : 130,
        glucoseFastingMin: body.glucoseFastingMin !== undefined ? Number(body.glucoseFastingMin) : 70,
        glucosePostMealMax: body.glucosePostMealMax !== undefined ? Number(body.glucosePostMealMax) : 180,
        weightDeltaKg: body.weightDeltaKg !== undefined ? Number(body.weightDeltaKg) : 2,
        weightDeltaDays: body.weightDeltaDays !== undefined ? Number(body.weightDeltaDays) : 7,
      },
      update: {
        systolicMax: body.systolicMax !== undefined ? Number(body.systolicMax) : undefined,
        diastolicMax: body.diastolicMax !== undefined ? Number(body.diastolicMax) : undefined,
        glucoseFastingMax: body.glucoseFastingMax !== undefined ? Number(body.glucoseFastingMax) : undefined,
        glucoseFastingMin: body.glucoseFastingMin !== undefined ? Number(body.glucoseFastingMin) : undefined,
        glucosePostMealMax: body.glucosePostMealMax !== undefined ? Number(body.glucosePostMealMax) : undefined,
        weightDeltaKg: body.weightDeltaKg !== undefined ? Number(body.weightDeltaKg) : undefined,
        weightDeltaDays: body.weightDeltaDays !== undefined ? Number(body.weightDeltaDays) : undefined,
      },
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
