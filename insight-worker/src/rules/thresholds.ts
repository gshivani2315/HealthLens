import { AlertSeverity, GlucoseContext, type Vital } from "@prisma/client";
import { CLINICAL, DAY_MS, type ThresholdValues } from "./constants";

export interface RuleHit {
  rule: string;
  severity: AlertSeverity;
  triggerLabel: string;
  detail: string;
}

export interface WeightPoint {
  recordedAt: Date;
  weightKg: number;
}

/**
 * Deterministic, doctor-configured checks. These decide alerts on their own – Gemini never gates them.
 * `weights` = earlier weight readings for this patient, ascending by time (excluding `vital`).
 */
export function evaluateThresholds(vital: Vital, t: ThresholdValues, weights: WeightPoint[]): RuleHit[] {
  const hits: RuleHit[] = [];

  // Blood pressure: "exceeds" the configured cut-off (matches the wording on the doctor's form)
  const sysHigh = vital.systolic != null && vital.systolic > t.systolicMax;
  const diaHigh = vital.diastolic != null && vital.diastolic > t.diastolicMax;
  if (sysHigh || diaHigh) {
    hits.push({
      rule: "BP_THRESHOLD",
      severity: AlertSeverity.CRITICAL,
      triggerLabel: `Threshold: BP > ${t.systolicMax}/${t.diastolicMax}`,
      detail: `Reading of ${vital.systolic ?? "—"}/${vital.diastolic ?? "—"} mmHg exceeds the configured limit.`,
    });
  }

  // Glucose (missing context is treated as fasting, same default as the LogVitals form)
  if (vital.glucose != null) {
    const g = vital.glucose;
    const postMeal = vital.glucoseContext === GlucoseContext.POST_MEAL;
    const max = postMeal ? t.glucosePostMealMax : t.glucoseFastingMax;

    if (g < t.glucoseFastingMin) {
      hits.push({
        rule: "GLUCOSE_LOW",
        severity: AlertSeverity.CRITICAL,
        triggerLabel: `Threshold: Glucose < ${t.glucoseFastingMin} mg/dL`,
        detail: `Glucose reading of ${g} mg/dL is below the configured low limit.`,
      });
    } else if (g >= CLINICAL.glucoseEmergencyHigh) {
      hits.push({
        rule: "GLUCOSE_VERY_HIGH",
        severity: AlertSeverity.CRITICAL,
        triggerLabel: `Threshold: Glucose ≥ ${CLINICAL.glucoseEmergencyHigh} mg/dL`,
        detail: `Glucose reading of ${g} mg/dL is very high.`,
      });
    } else if (g > max) {
      hits.push({
        rule: postMeal ? "GLUCOSE_POST_MEAL_HIGH" : "GLUCOSE_FASTING_HIGH",
        severity: AlertSeverity.CAUTION,
        triggerLabel: `Threshold: ${postMeal ? "Post-meal" : "Fasting"} glucose > ${max} mg/dL`,
        detail: `${postMeal ? "Post-meal" : "Fasting"} reading of ${g} mg/dL.`,
      });
    }
  }

  // Weight swing vs. the oldest reading inside the tolerance window
  if (vital.weightKg != null) {
    const windowStart = vital.recordedAt.getTime() - t.weightDeltaDays * DAY_MS;
    const baseline = weights.find(
      (w) => w.recordedAt.getTime() >= windowStart && w.recordedAt.getTime() < vital.recordedAt.getTime()
    );
    if (baseline) {
      const delta = vital.weightKg - baseline.weightKg;
      if (Math.abs(delta) >= t.weightDeltaKg) {
        hits.push({
          rule: "WEIGHT_DELTA",
          severity: AlertSeverity.CAUTION,
          triggerLabel: `Threshold: Weight change ≥ ${t.weightDeltaKg} kg in ${t.weightDeltaDays} days`,
          detail: `Weight changed by ${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg since ${baseline.recordedAt
            .toISOString()
            .slice(0, 10)}.`,
        });
      }
    }
  }

  return hits;
}
