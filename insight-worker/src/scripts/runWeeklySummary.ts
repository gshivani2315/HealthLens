/**
 * Manual trigger for the weekly summary (no waiting for Monday).
 *   npm run test:summary                    -> all patients with readings in the last 7 days
 *   npm run test:summary -- patient_rising  -> one patient, prints the stored row
 */
import { prisma } from "../db";
import { generateAllWeeklySummaries, generateWeeklySummaryForPatient } from "../services/weeklySummary";

async function main() {
  const [patientId] = process.argv.slice(2);
  if (patientId) {
    const result = await generateWeeklySummaryForPatient(patientId);
    console.log(JSON.stringify(result, null, 2));
  } else {
    await generateAllWeeklySummaries();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
