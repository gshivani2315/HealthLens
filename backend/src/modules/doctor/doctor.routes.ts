import { Router } from 'express';
import { prisma } from '../../db';
import { requireAuth } from '../../middleware/auth';

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
router.get('/overview', requireAuth, async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findFirst({
      where: { OR: [{ userId: req.user!.sub }, { id: req.user!.sub }] },
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

    const urgentAlerts = await prisma.alert.findMany({
      where: {
        status: 'UNREAD',
        ...(doctor ? { patient: { doctorId: doctor.id } } : {}),
      },
      include: { patient: { include: { user: true } } },
      orderBy: { triggeredAt: 'desc' },
    });

    const criticalCount = urgentAlerts.filter((a) => a.severity === 'CRITICAL').length;

    // Missing readings > 48h
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
router.get('/patients', requireAuth, async (req, res, next) => {
  try {
    const search = (req.query.search as string) || '';
    const filter = (req.query.filter as string) || 'all';

    const doctor = await prisma.doctor.findFirst({
      where: { OR: [{ userId: req.user!.sub }, { id: req.user!.sub }] },
    });

    const where: any = doctor ? { doctorId: doctor.id } : {};
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
// POST /doctor/patients (Add new patient linked to currently authenticated doctor)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/patients', requireAuth, async (req, res, next) => {
  try {
    const doctor = await prisma.doctor.findFirst({
      where: { OR: [{ userId: req.user!.sub }, { id: req.user!.sub }] },
    });

    const {
      name,
      email,
      phone,
      dateOfBirth,
      gender,
      conditions,
      riskStatus,
      initialSystolic,
      initialDiastolic,
      initialGlucose,
      initialWeightKg,
      initialSleepHours,
    } = req.body ?? {};

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name,
          email,
          password: 'temp_patient_password',
          role: 'PATIENT',
        },
      });
    }

    const patient = await prisma.patient.create({
      data: {
        userId: user.id,
        doctorId: doctor?.id,
        doctorAssignedAt: new Date(),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        gender: gender || 'Other',
        phone,
        riskStatus:
          riskStatus?.toUpperCase() === 'CRITICAL'
            ? 'CRITICAL'
            : riskStatus?.toUpperCase() === 'MODERATE'
            ? 'MODERATE'
            : 'NORMAL',
        conditions: {
          create: (conditions && conditions.length > 0 ? conditions : ['General Monitoring']).map(
            (label: string) => ({ label })
          ),
        },
        threshold: {
          create: {
            systolicMax: 160,
            diastolicMax: 100,
            glucoseFastingMax: 130,
            glucoseFastingMin: 70,
            glucosePostMealMax: 180,
            weightDeltaKg: 2,
            weightDeltaDays: 7,
          },
        },
      },
      include: {
        user: true,
        conditions: true,
      },
    });

    if (initialSystolic || initialGlucose || initialWeightKg) {
      await prisma.vital.create({
        data: {
          patientId: patient.id,
          systolic: initialSystolic,
          diastolic: initialDiastolic,
          glucose: initialGlucose,
          weightKg: initialWeightKg,
          sleepHours: initialSleepHours,
          recordedAt: new Date(),
        },
      });
      await prisma.patient.update({
        where: { id: patient.id },
        data: { lastReadingAt: new Date() },
      });
    }

    const now = Date.now();
    const birthDate = patient.dateOfBirth ? new Date(patient.dateOfBirth) : new Date('1970-01-01');
    const age = Math.abs(new Date(now - birthDate.getTime()).getUTCFullYear() - 1970);

    res.status(201).json({
      id: patient.id,
      doctorId: patient.doctorId ?? undefined,
      name: patient.user.name,
      email: patient.user.email,
      phone: patient.phone ?? undefined,
      dateOfBirth: patient.dateOfBirth ? patient.dateOfBirth.toISOString().slice(0, 10) : undefined,
      age,
      gender: patient.gender ?? 'Unknown',
      primaryCondition: patient.conditions[0]?.label ?? 'General Monitoring',
      conditions: patient.conditions.map((c) => ({ id: c.id, label: c.label })),
      latestBloodPressure:
        initialSystolic && initialDiastolic
          ? { systolic: initialSystolic, diastolic: initialDiastolic }
          : null,
      latestGlucose: initialGlucose ?? null,
      riskStatus: toLowerRisk(patient.riskStatus),
      lastReadingAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /doctor/patients/:id (Update patient details)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/patients/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, gender, dateOfBirth, riskStatus, conditions } = req.body ?? {};

    const patient = await prisma.patient.findFirst({
      where: { OR: [{ id }, { userId: id }] },
      include: { user: true, conditions: true, doctor: { include: { user: true } } },
    });

    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    if (name || email) {
      await prisma.user.update({
        where: { id: patient.userId },
        data: {
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
        },
      });
    }

    if (conditions && Array.isArray(conditions)) {
      await prisma.chronicCondition.deleteMany({ where: { patientId: patient.id } });
      await prisma.chronicCondition.createMany({
        data: conditions.map((label: string) => ({ patientId: patient.id, label })),
      });
    }

    const updated = await prisma.patient.update({
      where: { id: patient.id },
      data: {
        ...(phone !== undefined ? { phone } : {}),
        ...(gender !== undefined ? { gender } : {}),
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
        ...(riskStatus ? { riskStatus: riskStatus.toUpperCase() } : {}),
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
        id: updated.doctor?.id ?? 'doc_default',
        name: updated.doctor?.user?.name ?? 'Assigned Physician',
        clinicName: updated.doctor?.clinicName ?? 'Meridian Family Health',
        email: updated.doctor?.user?.email ?? 'doctor@healthlens.demo',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /doctor/patients/:id (Remove/unassign patient from doctor's roster)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/patients/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const patient = await prisma.patient.findFirst({
      where: { OR: [{ id }, { userId: id }] },
    });

    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    // Unassign patient from this doctor
    await prisma.patient.update({
      where: { id: patient.id },
      data: { doctorId: null, doctorAssignedAt: null },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /doctor/patients/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patients/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

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

    const birthDate = patient.dateOfBirth ? new Date(patient.dateOfBirth) : new Date('1970-01-01');
    const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);

    const docObj = {
      id: patient.doctor?.id ?? 'doc_default',
      name: patient.doctor?.user?.name ?? 'Dr. Elena Ruiz',
      clinicName: patient.doctor?.clinicName ?? 'Meridian Family Health',
      email: patient.doctor?.user?.email ?? 'doctor@healthlens.demo',
    };

    res.json({
      profile: {
        id: patient.id,
        doctorId: patient.doctorId ?? undefined,
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
// GET /doctor/patients/:id/thresholds
// ─────────────────────────────────────────────────────────────────────────────
router.get('/patients/:id/thresholds', requireAuth, async (req, res, next) => {
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
router.put('/patients/:id/thresholds', requireAuth, async (req, res, next) => {
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
