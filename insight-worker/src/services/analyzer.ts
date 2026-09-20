import { AlertSeverity, AlertType } from "@prisma/client";
import { generateJson } from "../ai/gemini";
import { CLINICAL_SYSTEM, clinicalPrompt } from "../ai/prompts";
import { clinicalAnalysisSchema, clinicalAnalysisZ } from "../ai/schemas";
import { config } from "../config";
import { prisma } from "../db";
import type { VitalsLoggedEvent } from "../events";
import { CLINICAL, DAY_MS, resolveThresholds } from "../rules/constants";
import { evaluateThresholds, type RuleHit } from "../rules/thresholds";
import { analyzeBpTrend, round1, shouldAskAi, summarize, type BpTrend } from "../rules/trends";
import { createAlertOnce, hasRecentOpenAlert, recomputeRisk } from "./alerts";

const AI_PATTERN_RULE = "AI_PATTERN";
const AI_ALERT_SUPPRESS_DAYS = 3;

/**
 * Real-time pipeline for one `vitals.logged` event.
 * Order matters: deterministic alerts are written FIRST, so a Gemini outage can never hide a critical reading.
 * Every write is idempotent (dedupeKey / upsert), so Kafka redelivery and retries are safe.
 */
export async function processVitalEvent(evt: VitalsLoggedEvent): Promise<void> {
  console.log(`[Received Event]: Vitals ${evt.vitalId} for ${evt.patientId}`);

  const vital = await prisma.vital.findUnique({ where: { id: evt.vitalId } });
  if (!vital || vital.patientId !== evt.patientId) {
    console.warn(`[Skip]: vital ${evt.vitalId} not found for patient ${evt.patientId}`);
    return;
  }

  const patient = await prisma.patient.findUnique({
    where: { id: vital.patientId },
    include: { threshold: true, conditions: true },
  });
  if (!patient) {
    console.warn(`[Skip]: patient ${vital.patientId} not found`);
    return;
  }

  // Keep the roster's "last reading" fresh (cheap; only moves forward)
  await prisma.patient.updateMany({
    where: { id: patient.id, OR: [{ lastReadingAt: null }, { lastReadingAt: { lt: vital.recordedAt } }] },
    data: { lastReadingAt: vital.recordedAt },
  });

  const thresholds = resolveThresholds(patient.threshold);
  const history = await prisma.vital.findMany({
    where: {
      patientId: patient.id,
      recordedAt: { gte: new Date(vital.recordedAt.getTime() - CLINICAL.historyDays * DAY_MS), lte: vital.recordedAt },
    },
    orderBy: { recordedAt: "asc" },
  });

  // ── 1. Deterministic rules ────────────────────────────────────────────────
  const weights = history
    .filter((h) => h.weightKg != null && h.id !== vital.id)
    .map((h) => ({ recordedAt: h.recordedAt, weightKg: h.weightKg as number }));

  const hits = evaluateThresholds(vital, thresholds, weights);
  let criticalHit = false;

  if (hits.length === 0) {
    console.log("[Deterministic Check]: Passed. Values within normal range.");
  } else {
    console.log(`[Deterministic Check]: Breached -> ${hits.map((h) => h.rule).join(", ")}`);
    for (const hit of hits) {
      if (hit.severity === AlertSeverity.CRITICAL) criticalHit = true;
      await createAlertOnce({
        patientId: patient.id,
        type: AlertType.THRESHOLD,
        severity: hit.severity,
        rule: hit.rule,
        triggerLabel: hit.triggerLabel,
        detail: hit.detail,
        vitalId: vital.id,
        dedupeKey: `${patient.id}:${hit.rule}:${vital.id}`,
        triggeredAt: vital.recordedAt,
      });
    }
  }

  // ── 2. Trend heuristic (decides whether Gemini is worth calling) ──────────
  const bpPoints = history
    .filter((h) => h.systolic != null && h.diastolic != null)
    .map((h) => ({ recordedAt: h.recordedAt, systolic: h.systolic as number, diastolic: h.diastolic as number }));
  const trend = analyzeBpTrend(bpPoints);
  const reason = hits.length > 0 ? "threshold_breach" : shouldAskAi(trend);

  if (!reason) {
    console.log("[Trend Evaluation]: Baseline stable. No alert created.");
    await recomputeRisk(patient.id);
    return;
  }
  console.log(`[Trend Evaluation]: Flagged (${reason}).`);

  // ── 3. Cooldown: don't burn LLM calls re-analysing the same patient ───────
  const existing = await prisma.patientInsight.findUnique({ where: { patientId: patient.id } });
  const cooling =
    existing && Date.now() - existing.generatedAt.getTime() < config.AI_COOLDOWN_HOURS * 60 * 60 * 1000;
  if (cooling && !criticalHit) {
    console.log("[AI]: Cooldown active, skipping Gemini.");
    await recomputeRisk(patient.id);
    return;
  }

  // ── 4. Gemini analysis (best-effort – failures never undo step 1) ─────────
  const payload = buildClinicalPayload({
    conditions: patient.conditions.map((c) => c.label),
    thresholds,
    reason,
    hits,
    trend,
    history,
    latest: vital,
  });

  try {
    const ai = await generateJson({
      system: CLINICAL_SYSTEM,
      prompt: clinicalPrompt(payload),
      responseSchema: clinicalAnalysisSchema,
      validator: clinicalAnalysisZ,
    });
    console.log(`[AI]: riskLevel=${ai.riskLevel} trend=${ai.trend}`);

    const now = new Date();
    const statsJson = JSON.parse(JSON.stringify(payload.bloodPressure));
    await prisma.patientInsight.upsert({
      where: { patientId: patient.id },
      create: {
        patientId: patient.id,
        narrative: ai.rationale,
        riskLevel: ai.riskLevel,
        trend: ai.trend,
        stats: statsJson,
        generatedAt: now,
      },
      update: { narrative: ai.rationale, riskLevel: ai.riskLevel, trend: ai.trend, stats: statsJson, generatedAt: now },
    });

    if (hits.length > 0) {
      await prisma.alert.updateMany({
        where: { patientId: patient.id, vitalId: vital.id, type: AlertType.THRESHOLD },
        data: { aiRationale: ai.rationale },
      });
    }

    // AI pattern alert: only when Gemini says HIGH, no critical threshold already covers it,
    // and we haven't raised the same pattern in the last few days.
    if (ai.riskLevel === "HIGH" && !criticalHit) {
      const suppressed = await hasRecentOpenAlert(patient.id, AI_PATTERN_RULE, AI_ALERT_SUPPRESS_DAYS);
      if (!suppressed) {
        await createAlertOnce({
          patientId: patient.id,
          type: AlertType.AI_PATTERN,
          severity: AlertSeverity.CAUTION,
          rule: AI_PATTERN_RULE,
          triggerLabel: aiTriggerLabel(trend, ai.trend),
          detail: ai.rationale,
          metrics: JSON.parse(
            JSON.stringify({
              reason,
              currentAverage: trend.currentAvg,
              previousAverage: trend.previousAvg,
              consecutiveElevated: trend.consecutiveElevated,
              slopeMmHgPerDay: round1(trend.slopePerDay),
              r2: Math.round(trend.r2 * 100) / 100,
              trend: ai.trend,
            })
          ),
          dedupeKey: `${patient.id}:${AI_PATTERN_RULE}:${vital.recordedAt.toISOString().slice(0, 10)}`,
          triggeredAt: vital.recordedAt,
        });
        console.log("[AI]: AI_PATTERN alert created.");
      }
    }
  } catch (err) {
    console.error("[AI]: analysis failed; deterministic alerts (if any) are already saved.", err);
  }

  await recomputeRisk(patient.id);
}

function aiTriggerLabel(trend: BpTrend, aiTrend: string): string {
  if (aiTrend === "RISING" && trend.slopePerDay > 0 && trend.spanDays >= 7) {
    return `AI Pattern: ${trend.spanDays}-day upward trend in blood pressure`;
  }
  return `AI Pattern: ${aiTrend.toLowerCase()} blood pressure pattern`;
}

// Only aggregated numbers + condition labels go to Gemini. No name, email, phone or DOB.
function buildClinicalPayload(args: {
  conditions: string[];
  thresholds: unknown;
  reason: string;
  hits: RuleHit[];
  trend: BpTrend;
  history: Array<{
    glucose: number | null;
    weightKg: number | null;
    sleepHours: number | null;
  }>;
  latest: {
    systolic: number | null;
    diastolic: number | null;
    glucose: number | null;
    glucoseContext: string | null;
    weightKg: number | null;
    sleepHours: number | null;
    recordedAt: Date;
  };
}) {
  const { trend, history, latest } = args;
  return {
    conditions: args.conditions,
    configuredThresholds: args.thresholds,
    trigger: { reason: args.reason, ruleHits: args.hits.map((h) => h.triggerLabel) },
    latestReading: {
      recordedAt: latest.recordedAt.toISOString(),
      systolic: latest.systolic,
      diastolic: latest.diastolic,
      glucose: latest.glucose,
      glucoseContext: latest.glucoseContext,
      weightKg: latest.weightKg,
      sleepHours: latest.sleepHours,
    },
    bloodPressure: {
      readings: trend.readingCount,
      daysCovered: trend.spanDays,
      currentAvg7d: trend.currentAvg,
      previousAvg7d: trend.previousAvg,
      systolicChangeVsPreviousWeek: trend.systolicChange,
      slopeMmHgPerDay: round1(trend.slopePerDay),
      r2: Math.round(trend.r2 * 100) / 100,
      consecutiveElevatedReadings: trend.consecutiveElevated,
      dailyMeans: trend.daily,
    },
    glucose: summarize(history.map((h) => h.glucose)),
    weightKg: summarize(history.map((h) => h.weightKg)),
    sleepHours: summarize(history.map((h) => h.sleepHours)),
  };
}
