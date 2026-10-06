import * as cron from "node-cron";
import { config } from "../config";
import { recomputeAllRisk } from "../services/alerts";
import { generateAllWeeklySummaries } from "../services/weeklySummary";

let weeklyRunning = false;
let riskRunning = false;

export function startSchedulers(): void {
  if (!config.ENABLE_SCHEDULER) {
    console.log("[Scheduler]: disabled (ENABLE_SCHEDULER=false)");
    return;
  }

  cron.schedule(
    config.WEEKLY_CRON,
    async () => {
      if (weeklyRunning) return;
      weeklyRunning = true;
      try {
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

  console.log(`[Scheduler]: weekly summaries "${config.WEEKLY_CRON}" (${config.SCHEDULER_TZ}); hourly risk recompute`);
}
