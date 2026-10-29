import * as cron from "node-cron";
import { config } from "../config";
import { recomputeAllRisk } from "../services/alerts";
import { generateAllWeeklySummaries, generateWeeklySummaryForPatient } from "../services/weeklySummary";

let weeklyRunning = false;
let riskRunning = false;

/**
 * Manual trigger for weekly summary generation.
 * Can be called programmatically, via CLI script, or on demand.
 */
export async function triggerManualWeeklySummary(patientId?: string) {
  if (patientId) {
    console.log(`[ManualScheduler]: Triggering summary for patient ${patientId}`);
    return generateWeeklySummaryForPatient(patientId);
  }
  console.log('[ManualScheduler]: Triggering weekly summary for all patients');
  return generateAllWeeklySummaries();
}

export function startSchedulers(): void {
  if (!config.ENABLE_SCHEDULER) {
    console.log("[Scheduler]: disabled (ENABLE_SCHEDULER=false)");
    return;
  }

  // Cron Verification:
  // "0 8 * * 1" represents:
  // Field 1 (0): Minute 0
  // Field 2 (8): Hour 8 (8:00 AM)
  // Field 3 (*): Every day of the month
  // Field 4 (*): Every month
  // Field 5 (1): Day of week 1 (Monday)
  // Timezone: config.SCHEDULER_TZ (defaults to "Asia/Kolkata")
  cron.schedule(
    config.WEEKLY_CRON,
    async () => {
      if (weeklyRunning) return;
      weeklyRunning = true;
      try {
        console.log(`[WeeklyCron]: Starting scheduled run at ${new Date().toISOString()}`);
        await generateAllWeeklySummaries();
      } catch (err) {
        console.error("[Weekly]: job crashed", err);
      } finally {
        weeklyRunning = false;
      }
    },
    { timezone: config.SCHEDULER_TZ }
  );

  // Hourly: keeps Patient.riskStatus honest after doctors resolve/acknowledge alerts
  cron.schedule(
    "5 * * * *",
    async () => {
      if (riskRunning) return;
      riskRunning = true;
      try {
        await recomputeAllRisk();
      } catch (err) {
        console.error("[Risk]: recompute failed", err);
      } finally {
        riskRunning = false;
      }
    },
    { timezone: config.SCHEDULER_TZ }
  );

  console.log(`[Scheduler]: weekly summaries verified "${config.WEEKLY_CRON}" (${config.SCHEDULER_TZ}); hourly risk recompute`);
}
