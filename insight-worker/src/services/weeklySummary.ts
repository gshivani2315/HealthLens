import { GlucoseContext, type Vital } from "@prisma/client";
import { generateJson } from "../ai/gemini";
import { WEEKLY_SYSTEM, weeklyPrompt } from "../ai/prompts";
import { weeklySummarySchema, weeklySummaryZ } from "../ai/schemas";
import { config } from "../config";
import { prisma } from "../db";
import { DAY_MS, resolveThresholds } from "../rules/constants";
import { mean, round1, summarize } from "../rules/trends";

/** Date-only value for the given instant in the scheduler timezone, stored at 12:00Z so no timezone shifts the day in the UI. */
function localDateAtNoonUtc(d: Date, tz: string): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return new Date(`${ymd}T12:00:00.000Z`);
}

function weekStats(rows: Vital[]) {
  const bp = rows.filter((r) => r.systolic != null && r.diastolic != null);
  const glucoseRows = rows.filter((r) => r.glucose != null);
  const fasting = glucoseRows.filter((r) => r.glucoseContext !== GlucoseContext.POST_MEAL);
  const postMeal = glucoseRows.filter((r) => r.glucoseContext === GlucoseContext.POST_MEAL);
  return {
    daysLogged: new Set(rows.map((r) => r.recordedAt.toISOString().slice(0, 10))).size,
    readings: rows.length,
    bloodPressure: bp.length
      ? {
          count: bp.length,
          avgSystolic: round1(mean(bp.map((r) => r.systolic as number))),
          avgDiastolic: round1(mean(bp.map((r) => r.diastolic as number))),
          maxSystolic: Math.max(...bp.map((r) => r.systolic as number)),
        }
      : null,
    fastingGlucose: summarize(fasting.map((r) => r.glucose)),
    postMealGlucose: summarize(postMeal.map((r) => r.glucose)),
    weightKg: summarize(rows.map((r) => r.weightKg)),
    sleepHours: summarize(rows.map((r) => r.sleepHours)),
  };
}

const diff = (a?: number | null, b?: number | null) => (a == null || b == null ? null : round1(a - b));
const pct = (a?: number | null, b?: number | null) => (a == null || b == null || b === 0 ? null : round1(((a - b) / b) * 100));

/**
 * Generates (or regenerates) the weekly summary for one patient. Idempotent: upserts on (patientId, weekStart).
 * Window = the 7 days before `now`; the previous 7 days are used for week-over-week comparison.
 * Changes are pre-computed here so the LLM never does arithmetic.
 */
export async function generateWeeklySummaryForPatient(patientId: string, now = new Date()) {
  const from = new Date(now.getTime() - 7 * DAY_MS);
  const prevFrom = new Date(now.getTime() - 14 * DAY_MS);

  const rows = await prisma.vital.findMany({
    where: { patientId, recordedAt: { gte: prevFrom, lte: now } },
    orderBy: { recordedAt: "asc" },
  });
  const current = rows.filter((r) => r.recordedAt >= from);
  const previous = rows.filter((r) => r.recordedAt < from);
  if (current.length === 0) return null; // nothing logged this week -> no summary

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { conditions: true, threshold: true },
  });
  if (!patient) return null;

  const thisWeek = weekStats(current);
  const lastWeek = weekStats(previous);
  const changes = {
    avgSystolicChange: diff(thisWeek.bloodPressure?.avgSystolic, lastWeek.bloodPressure?.avgSystolic),
    avgDiastolicChange: diff(thisWeek.bloodPressure?.avgDiastolic, lastWeek.bloodPressure?.avgDiastolic),
    fastingGlucosePercentChange: pct(thisWeek.fastingGlucose?.mean, lastWeek.fastingGlucose?.mean),
    sleepHoursAvgChange: diff(thisWeek.sleepHours?.mean, lastWeek.sleepHours?.mean),
    weightChangeKgWithinWeek:
      thisWeek.weightKg && thisWeek.weightKg.count >= 2 ? round1(thisWeek.weightKg.last - thisWeek.weightKg.first) : null,
  };

  const payload = {
    conditions: patient.conditions.map((c) => c.label),
    configuredThresholds: resolveThresholds(patient.threshold),
    thisWeek,
    previousWeek: previous.length ? lastWeek : null,
    changes,
  };

  const ai = await generateJson({
    system: WEEKLY_SYSTEM,
    prompt: weeklyPrompt(payload),
    responseSchema: weeklySummarySchema,
    validator: weeklySummaryZ,
  });

  const weekEnd = new Date(localDateAtNoonUtc(now, config.SCHEDULER_TZ).getTime() - DAY_MS); // yesterday
  const weekStart = new Date(weekEnd.getTime() - 6 * DAY_MS);
  const statsJson = JSON.parse(JSON.stringify({ thisWeek, previousWeek: lastWeek, changes }));

  return prisma.weeklySummary.upsert({
    where: { patientId_weekStart: { patientId, weekStart } },
    create: {
      patientId,
      weekStart,
      weekEnd,
      narrative: ai.narrative,
      takeaways: ai.takeaways,
      trend: ai.overallTrend,
      stats: statsJson,
      model: config.GEMINI_MODEL,
    },
    update: {
      narrative: ai.narrative,
      takeaways: ai.takeaways,
      trend: ai.overallTrend,
      stats: statsJson,
      model: config.GEMINI_MODEL,
      generatedAt: new Date(),
    },
  });
}

/** Weekly job body: every patient with at least one reading in the last 7 days. One failure never stops the batch. */
export async function generateAllWeeklySummaries(): Promise<void> {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const active = await prisma.vital.findMany({
    where: { recordedAt: { gte: since } },
    distinct: ["patientId"],
    select: { patientId: true },
  });
  console.log(`[Weekly]: generating summaries for ${active.length} patient(s)`);

  let ok = 0;
  let failed = 0;
  for (const { patientId } of active) {
    try {
      const res = await generateWeeklySummaryForPatient(patientId);
      if (res) ok++;
    } catch (err) {
      failed++;
      console.error(`[Weekly]: failed for ${patientId}`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`[Weekly]: done. ${ok} generated, ${failed} failed.`);
}
