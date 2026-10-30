// backend/src/modules/alerts/alerts.routes.ts   (replaces current)
import { Router } from 'express';
import { prisma } from '../../db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { AlertStatus, AlertType } from '@prisma/client';
import { alertForDoctor } from './alertSerializer';
import { hasActiveCareAssignment, getActivePatientIdsForDoctor } from '../../middleware/accessGuard';
import { notifyAlertEvent } from '../../lib/notify'; // in-app notification + EmailJS, fire-and-forget

const router = Router();

// Doctor.userId is unique, so this is a direct lookup. (notify.ts loads the doctor's name and clinic
// itself, which is what fixes the old "Dr. Your doctor" fallback.)
async function resolveDoctor(user: any) {
  return prisma.doctor.findUnique({ where: { userId: user.dbUserId } });
}

// Loads an alert and verifies, via the single access rule, that this doctor has an ACTIVE CareAssignment.
async function loadOwnedAlert(id: string, user: any) {
  const doctor = await resolveDoctor(user);
  if (!doctor) return { error: 403 as const };

  const alert = await prisma.alert.findUnique({
    where: { id },
    include: { patient: { include: { user: true } } },
  });
  if (!alert) return { error: 404 as const };

  if (!(await hasActiveCareAssignment(doctor.id, alert.patientId))) return { error: 403 as const };

  return { alert, doctor };
}

const includePatient = { patient: { include: { user: true } } };

// ─────────────────────────────────────────────────────────────────────────────
// GET /alerts?status=&type=
// Alerts go to every doctor with an ACTIVE assignment on the patient.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const statusQuery = (req.query.status as string) || '';
    const typeQuery = (req.query.type as string) || '';

    const doctor = await resolveDoctor(req.user);
    if (!doctor) return res.status(403).json({ message: 'Doctor profile not found' });

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
// Alert status stays shared across doctors; acknowledgedById records who handled it.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const owned = await loadOwnedAlert(req.params.id, req.user);
    if ('error' in owned) {
      return res.status(owned.error).json({ message: owned.error === 404 ? 'Alert not found' : 'Forbidden' });
    }
    const { doctor, alert: before } = owned;
    const { status, clinicalNote, noteSharedWithPatient } = req.body ?? {};

    let alertStatus: AlertStatus | undefined;
    if (status !== undefined) {
      const s = String(status).toUpperCase();
      if (s === 'ACKNOWLEDGED') alertStatus = AlertStatus.ACKNOWLEDGED;
      else if (s === 'RESOLVED') alertStatus = AlertStatus.RESOLVED;
      else if (s === 'UNREAD') alertStatus = AlertStatus.UNREAD;
      else return res.status(400).json({ message: 'Invalid status' });
    }

    // An empty note clears it and always makes it private again.
    const noteProvided = clinicalNote !== undefined;
    const cleanedNote = noteProvided ? String(clinicalNote).trim() || null : undefined;
    let shared: boolean | undefined;
    if (typeof noteSharedWithPatient === 'boolean') shared = noteSharedWithPatient;
    if (noteProvided && cleanedNote === null) shared = false;

    // Only stamp times (and notify) on a real status transition.
    const changed = alertStatus !== undefined && alertStatus !== before.status;

    const updated = await prisma.alert.update({
      where: { id: before.id },
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

    // ── Notify the patient (in-app + EmailJS). Not awaited: the response never waits on email. ──
    if (changed && alertStatus === AlertStatus.ACKNOWLEDGED) {
      notifyAlertEvent(updated.id, doctor.id, 'alert_acknowledged');
    }
    if (changed && alertStatus === AlertStatus.RESOLVED) {
      notifyAlertEvent(updated.id, doctor.id, 'alert_resolved');
    }

    // A note is "newly visible" if it is shared now AND either it wasn't shared before or its text changed.
    // (Editing a note that is already shared also tells the patient; saving with no change does not.)
    const nowShared = updated.noteSharedWithPatient && !!updated.clinicalNote;
    const wasShared = before.noteSharedWithPatient && !!before.clinicalNote;
    const textChanged = (before.clinicalNote ?? null) !== (updated.clinicalNote ?? null);
    if (nowShared && (!wasShared || textChanged)) {
      notifyAlertEvent(updated.id, doctor.id, 'note_shared');
    }

    res.json(alertForDoctor(updated));
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /alerts/:id/follow-up   { note? }  -> updated AlertItem
// The follow-up note is ALWAYS patient-visible (it is a message to the patient).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/follow-up', requireAuth, requireRole('DOCTOR'), async (req, res, next) => {
  try {
    const owned = await loadOwnedAlert(req.params.id, req.user);
    if ('error' in owned) {
      return res.status(owned.error).json({ message: owned.error === 404 ? 'Alert not found' : 'Forbidden' });
    }
    const { doctor, alert: before } = owned;

    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';

    const updated = await prisma.alert.update({
      where: { id: before.id },
      data: { followUpRequestedAt: new Date(), followUpNote: note || null },
      include: includePatient,
    });

    console.log(`[Follow-up] requested for patient ${updated.patient.user.name} (${updated.patientId}) on alert ${updated.id}`);

    // Double-click guard: the same request within a minute must not email the patient twice.
    const duplicate =
      !!before.followUpRequestedAt &&
      Date.now() - before.followUpRequestedAt.getTime() < 60_000 &&
      (before.followUpNote ?? '') === note;
    if (!duplicate) notifyAlertEvent(updated.id, doctor.id, 'follow_up_requested');

    res.json(alertForDoctor(updated));
  } catch (err) {
    next(err);
  }
});

export default router;