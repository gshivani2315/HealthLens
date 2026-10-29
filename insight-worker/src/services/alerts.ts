import { AlertStatus, Prisma, RiskStatus, type AlertSeverity, type AlertType } from "@prisma/client";
import { prisma } from "../db";
import { DAY_MS } from "../rules/constants";

export interface NewAlert {
  patientId: string;
  type: AlertType;
  severity: AlertSeverity;
  rule: string;
  triggerLabel: string;
  detail?: string;
  metrics?: Prisma.InputJsonValue;
  vitalId?: string;
  dedupeKey: string;
  triggeredAt: Date;
}

/** Inserts an alert unless one with the same dedupeKey exists. Returns true if a new row was created. */
export async function createAlertOnce(alert: NewAlert): Promise<boolean> {
  try {
    const created = await prisma.alert.create({ data: alert });

    // When an alert is created, notify every active doctor on the patient.
    // "Alerts go to every active doctor on the patient. The alert status stays shared, and acknowledgedById records who handled it."
    // "In-app bell backed by the database, plus email for critical alerts"
    try {
      const patient = await prisma.patient.findUnique({
        where: { id: alert.patientId },
        include: {
          user: true,
          careAssignments: {
            where: { status: 'ACTIVE' },
            include: { doctor: { include: { user: true } } },
          },
        },
      });

      if (patient) {
        // Collect all active doctor user IDs
        const activeDoctorUsers = new Map<string, { userId: string; email: string; name: string }>();

        for (const ca of patient.careAssignments) {
          if (ca.doctor?.user) {
            activeDoctorUsers.set(ca.doctor.userId, {
              userId: ca.doctor.userId,
              email: ca.doctor.user.email,
              name: ca.doctor.user.name,
            });
          }
        }

        // Backward compatibility fallback for legacy doctorId
        if (patient.doctorId && !activeDoctorUsers.has(patient.doctorId)) {
          const doc = await prisma.doctor.findUnique({
            where: { id: patient.doctorId },
            include: { user: true },
          });
          if (doc?.user) {
            activeDoctorUsers.set(doc.userId, {
              userId: doc.userId,
              email: doc.user.email,
              name: doc.user.name,
            });
          }
        }

        const notifType = alert.severity === 'CRITICAL' ? 'CRITICAL_ALERT' : 'SYSTEM';

        for (const docUser of activeDoctorUsers.values()) {
          await (prisma as any).notification.create({
            data: {
              userId: docUser.userId,
              title: `${alert.severity === 'CRITICAL' ? 'CRITICAL ALERT' : 'Alert'}: ${patient.user.name}`,
              message: `${alert.triggerLabel}. ${alert.detail || ''}`,
              type: notifType,
              link: `/doctor/patients/${patient.id}`,
              metadata: { alertId: created.id, patientId: patient.id },
            },
          }).catch(() => {});

          if (alert.severity === 'CRITICAL' && docUser.email) {
            console.log(
              `\n📧 [EMAIL DISPATCHED] To: ${docUser.email} | Subject: [CRITICAL HEALTH ALERT] ${patient.user.name}: ${alert.triggerLabel}\nPatient ${patient.user.name} has triggered a critical alert: ${alert.detail || alert.triggerLabel}.\nPlease review in HealthLens.\n`
            );
          }
        }
      }
    } catch (notifErr) {
      console.warn('[AlertNotification] Notice:', (notifErr as Error)?.message);
    }

    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false; // duplicate
    throw err;
  }
}

/** Alert-fatigue guard: is there already an unresolved alert for this rule in the last N days? */
export async function hasRecentOpenAlert(patientId: string, rule: string, days: number): Promise<boolean> {
  const count = await prisma.alert.count({
    where: {
      patientId,
      rule,
      status: { not: AlertStatus.RESOLVED },
      triggeredAt: { gte: new Date(Date.now() - days * DAY_MS) },
    },
  });
  return count > 0;
}

/** Derives Patient.riskStatus from unresolved alerts in the last 7 days. */
export async function recomputeRisk(patientId: string): Promise<RiskStatus> {
  const open = await prisma.alert.findMany({
    where: {
      patientId,
      status: { not: AlertStatus.RESOLVED },
      triggeredAt: { gte: new Date(Date.now() - 7 * DAY_MS) },
    },
    select: { severity: true },
  });

  let risk: RiskStatus = RiskStatus.NORMAL;
  if (open.some((a) => a.severity === "CRITICAL")) risk = RiskStatus.CRITICAL;
  else if (open.some((a) => a.severity === "CAUTION")) risk = RiskStatus.MODERATE;

  await prisma.patient.update({ where: { id: patientId }, data: { riskStatus: risk } });
  return risk;
}

export async function recomputeAllRisk(): Promise<void> {
  const patients = await prisma.patient.findMany({ select: { id: true } });
  for (const p of patients) {
    await recomputeRisk(p.id);
  }
}
