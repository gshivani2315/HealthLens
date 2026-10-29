import type { PatientThreshold } from "@prisma/client";

export const DAY_MS = 24 * 60 * 60 * 1000;

export type ThresholdValues = {
  systolicMax: number;
  diastolicMax: number;
  glucoseFastingMax: number;
  glucoseFastingMin: number;
  glucosePostMealMax: number;
  weightDeltaKg: number;
  weightDeltaDays: number;
  heartRateMax?: number;
  heartRateMin?: number;
};

/** Used when a patient has no PatientThreshold row. Mirrors the defaults in the frontend mock data. */
export const DEFAULT_THRESHOLDS: ThresholdValues = {
  systolicMax: 160,
  diastolicMax: 100,
  glucoseFastingMax: 130,
  glucoseFastingMin: 70,
  glucosePostMealMax: 180,
  weightDeltaKg: 2,
  weightDeltaDays: 7,
  heartRateMax: 120,
  heartRateMin: 50,
};

export function resolveThresholds(row: any): ThresholdValues {
  if (!row) return DEFAULT_THRESHOLDS;
  return {
    systolicMax: row.systolicMax ?? DEFAULT_THRESHOLDS.systolicMax,
    diastolicMax: row.diastolicMax ?? DEFAULT_THRESHOLDS.diastolicMax,
    glucoseFastingMax: row.glucoseFastingMax ?? DEFAULT_THRESHOLDS.glucoseFastingMax,
    glucoseFastingMin: row.glucoseFastingMin ?? DEFAULT_THRESHOLDS.glucoseFastingMin,
    glucosePostMealMax: row.glucosePostMealMax ?? DEFAULT_THRESHOLDS.glucosePostMealMax,
    weightDeltaKg: row.weightDeltaKg ?? DEFAULT_THRESHOLDS.weightDeltaKg,
    weightDeltaDays: row.weightDeltaDays ?? DEFAULT_THRESHOLDS.weightDeltaDays,
    heartRateMax: row.heartRateMax ?? DEFAULT_THRESHOLDS.heartRateMax,
    heartRateMin: row.heartRateMin ?? DEFAULT_THRESHOLDS.heartRateMin,
  };
}

/**
 * Heuristic knobs for the trend detector and the "is this an emergency" glucose ceiling.
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
