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
    await prisma.alert.create({ data: alert });
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
  for (const p of patients) await recomputeRisk(p.id);
}
