import { Router } from 'express';
import { prisma } from '../../db';
import { requireAuth } from '../../middleware/auth';
import { AlertStatus, AlertType } from '@prisma/client';

const router = Router();

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
// GET /alerts?status=&type=
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const statusQuery = (req.query.status as string) || '';
    const typeQuery = (req.query.type as string) || '';

    const where: any = {};

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
      include: {
        patient: {
          include: { user: true },
        },
      },
      orderBy: { triggeredAt: 'desc' },
    });

    res.json(
      alerts.map((a) => ({
        id: a.id,
        patientId: a.patientId,
        patientName: a.patient.user.name,
        type: toLowerType(a.type),
        severity: toLowerSeverity(a.severity),
        status: toLowerStatus(a.status),
        triggerLabel: a.triggerLabel,
        detail: a.detail ?? undefined,
        triggeredAt: a.triggeredAt.toISOString(),
        clinicalNote: a.clinicalNote ?? undefined,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /alerts/:id
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, clinicalNote } = req.body ?? {};

    let alertStatus: AlertStatus | undefined;
    if (status) {
      const s = status.toUpperCase();
      if (s === 'ACKNOWLEDGED') alertStatus = AlertStatus.ACKNOWLEDGED;
      else if (s === 'RESOLVED') alertStatus = AlertStatus.RESOLVED;
      else if (s === 'UNREAD') alertStatus = AlertStatus.UNREAD;
    }

    const updated = await prisma.alert.update({
      where: { id },
      data: {
        ...(alertStatus ? { status: alertStatus } : {}),
        ...(alertStatus === AlertStatus.ACKNOWLEDGED ? { acknowledgedAt: new Date() } : {}),
        ...(alertStatus === AlertStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
        ...(clinicalNote !== undefined ? { clinicalNote } : {}),
      },
      include: {
        patient: {
          include: { user: true },
        },
      },
    });

    res.json({
      id: updated.id,
      patientId: updated.patientId,
      patientName: updated.patient.user.name,
      type: toLowerType(updated.type),
      severity: toLowerSeverity(updated.severity),
      status: toLowerStatus(updated.status),
      triggerLabel: updated.triggerLabel,
      detail: updated.detail ?? undefined,
      triggeredAt: updated.triggeredAt.toISOString(),
      clinicalNote: updated.clinicalNote ?? undefined,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /alerts/:id/follow-up
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/follow-up', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const alert = await prisma.alert.findUnique({
      where: { id },
      include: { patient: { include: { user: true } } },
    });

    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    console.log(`[Follow-up] Follow-up reminder triggered for patient ${alert.patient.user.name} (${alert.patientId}) on alert ${alert.id}`);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;

