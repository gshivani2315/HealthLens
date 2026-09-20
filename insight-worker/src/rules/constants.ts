import type { PatientThreshold } from "@prisma/client";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type ThresholdValues = Omit<PatientThreshold, "patientId" | "updatedAt">;

/** Used when a patient has no PatientThreshold row. Mirrors the defaults in the frontend mock data. */
export const DEFAULT_THRESHOLDS: ThresholdValues = {
  systolicMax: 160,
  diastolicMax: 100,
  glucoseFastingMax: 130,
  glucoseFastingMin: 70,
  glucosePostMealMax: 180,
  weightDeltaKg: 2,
  weightDeltaDays: 7,
};

export function resolveThresholds(row: PatientThreshold | null): ThresholdValues {
  if (!row) return DEFAULT_THRESHOLDS;
  const { patientId: _patientId, updatedAt: _updatedAt, ...values } = row;
  return values;
}

/**
 * Heuristic knobs for the trend detector and the "is this an emergency" glucose ceiling.
 * These are engineering defaults, NOT clinical guidance – have a clinician review them before
 * anything resembling real use.
 */
export const CLINICAL = {
  historyDays: 30,

  // "Elevated" BP for the consecutive-readings heuristic (independent of the doctor's hard cut-off)
  elevatedSystolic: 140,
  elevatedDiastolic: 90,

  // Glucose at/above this is CRITICAL regardless of the configured fasting/post-meal limits
  glucoseEmergencyHigh: 300,

  // Trend detection
  minReadingsPerWindow: 3,
  minDaysForSlope: 10,
  consecutiveElevatedMin: 5,
  weeklyRiseMmHg: 8,
  slopeMinPerDay: 0.4,
  slopeMinR2: 0.4,
} as const;
