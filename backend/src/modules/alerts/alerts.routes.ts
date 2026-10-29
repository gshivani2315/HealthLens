// backend/src/modules/alerts/alerts.routes.ts
import { Router } from 'express';
import { prisma } from '../../db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { AlertStatus, AlertType } from '@prisma/client';
import { alertForDoctor } from './alertSerializer';
import { hasActiveCareAssignment, getActivePatientIdsForDoctor } from '../../middleware/accessGuard';
import { createNotification } from '../notifications/notification.service';

const router = Router();

async function resolveDoctor(user: any) {
  return prisma.doctor.findFirst({
    where: { OR: [{ userId: user.sub }, { userId: user.dbUserId }, { id: user.sub }] },
  });
}

// Loads an alert and verifies via single access rule guard that the doctor has an ACTIVE CareAssignment
async function loadOwnedAlert(id: string, user: any) {
  const doctor = await resolveDoctor(user);
  if (!doctor) return { error: 403 as const };

  const alert = await prisma.alert.findUnique({
    where: { id },
    include: { patient: { include: { user: true } } },
  });
  if (!alert) return { error: 404 as const };

  // SINGLE ACCESS RULE GUARD:
  const authorized = await hasActiveCareAssignment(doctor.id, alert.patientId);
  if (!authorized) return { error: 403 as const };

  return { alert, doctor };
}

const includePatient = { patient: { include: { user: true } } };

// ─────────────────────────────────────────────────────────────────────────────
// GET /alerts?status=&type=
// Alerts go to every active doctor on the patient.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const statusQuery = (req.query.status as string) || '';
    const typeQuery = (req.query.type as string) || '';

    const doctor = await resolveDoctor(req.user);
    if (!doctor) return res.status(403).json({ message: 'Doctor profile not found' });

    // Patients with an ACTIVE CareAssignment with this doctor
    const patientIds = await getActivePatientIdsForDoctor(doctor.id);

    const where: any = { patientId: { in: patientIds } };

    if (statusQuery && statusQuery !== 'all') {
      const s = statusQuery.toUpperCase();
      if (s === 'UNREAD') where.status = AlertStatus.UNREAD;
      else if (s === 'ACKNOWLEDGED') where.status = AlertStatus.ACKNOWLEDGED;
      else if (s === 'RESOLVED') where.status = AlertStatus.RESOLVED;
    }

    if (typeQuery && typeQuery !== 'all') {
      const t = typeQuery.toUpperCase();
      if (t === 'AI_PATTERN') where.type = AlertType.AI_PATTERN;
      else if (t === 'THRESHOLD') where.type = AlertType.THRESHOLD;
    }

    const alerts = await prisma.alert.findMany({
      where,
      include: includePatient,
      orderBy: { triggeredAt: 'desc' },
    });

    res.json(alerts.map(alertForDoctor));
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /alerts/:id   { status?, clinicalNote?, noteSharedWithPatient? }
// Alert status stays shared, and acknowledgedById records who handled it.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const owned = await loadOwnedAlert(req.params.id, req.user);
    if ('error' in owned) {
      return res.status(owned.error).json({ message: owned.error === 404 ? 'Alert not found' : 'Forbidden' });
    }
    const { doctor } = owned;
    const { status, clinicalNote, noteSharedWithPatient } = req.body ?? {};

    let alertStatus: AlertStatus | undefined;
    if (status !== undefined) {
      const s = String(status).toUpperCase();
      if (s === 'ACKNOWLEDGED') alertStatus = AlertStatus.ACKNOWLEDGED;
      else if (s === 'RESOLVED') alertStatus = AlertStatus.RESOLVED;
      else if (s === 'UNREAD') alertStatus = AlertStatus.UNREAD;
      else return res.status(400).json({ message: 'Invalid status' });
    }

    // Note handling: an empty note clears it and always makes it private again.
    const noteProvided = clinicalNote !== undefined;
    const cleanedNote = noteProvided ? String(clinicalNote).trim() || null : undefined;
    let shared: boolean | undefined;
    if (typeof noteSharedWithPatient === 'boolean') shared = noteSharedWithPatient;
    if (noteProvided && cleanedNote === null) shared = false;

    // Only stamp acknowledged/resolved times on a real transition.
    const changed = alertStatus !== undefined && alertStatus !== owned.alert.status;

    const updated = await prisma.alert.update({
      where: { id: owned.alert.id },
      data: {
        ...(alertStatus ? { status: alertStatus } : {}),
        ...(changed && alertStatus === AlertStatus.ACKNOWLEDGED
          ? { acknowledgedAt: new Date(), acknowledgedById: doctor.id }
          : {}),
        ...(changed && alertStatus === AlertStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
        ...(noteProvided ? { clinicalNote: cleanedNote } : {}),
        ...(shared !== undefined ? { noteSharedWithPatient: shared } : {}),
      },
      include: includePatient,
    });

    res.json(alertForDoctor(updated));
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /alerts/:id/follow-up   { note? }  -> updated AlertItem
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/follow-up', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const owned = await loadOwnedAlert(req.params.id, req.user);
    if ('error' in owned) {
      return res.status(owned.error).json({ message: owned.error === 404 ? 'Alert not found' : 'Forbidden' });
    }

    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

    const updated = await prisma.alert.update({
      where: { id: owned.alert.id },
      data: { followUpRequestedAt: new Date(), followUpNote: note || null },
      include: includePatient,
    });

    console.log(`[Follow-up] requested for patient ${updated.patient.user.name} (${updated.patientId}) on alert ${updated.id}`);

    // Notify Patient via database and email (VISIT_REQUEST)
    await createNotification({
      userId: updated.patient.userId,
      title: 'Doctor visit / follow-up requested',
      message: note
        ? `Dr. ${owned.doctor.user?.name ?? 'Your doctor'} requested a follow-up: "${note}"`
        : `Dr. ${owned.doctor.user?.name ?? 'Your doctor'} requested a clinical follow-up regarding your recent health readings.`,
      type: 'VISIT_REQUEST',
      link: '/patient/dashboard',
      metadata: { alertId: updated.id },
    }).catch(() => {});

    res.json(alertForDoctor(updated));
  } catch (err) {
    next(err);
  }
});

export default router;
