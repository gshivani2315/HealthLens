/**
 * Simulates the backend: inserts a Vital row, then publishes `vitals.logged`.
 *
 *   npm run publish:event -- <patientId> <systolic> <diastolic> [glucose] [fasting|post_meal]
 *   npm run publish:event -- patient_stable 118 78
 *   npm run publish:event -- patient_critical 172 105
 *   npm run publish:event -- patient_rising 150 94
 */
import { GlucoseContext } from "@prisma/client";
import { Kafka } from "kafkajs";
import { config } from "../config";
import { prisma } from "../db";

async function main() {
  const [patientId, sys, dia, glucose, ctx] = process.argv.slice(2);
  if (!patientId || !sys || !dia) {
    console.error("Usage: npm run publish:event -- <patientId> <systolic> <diastolic> [glucose] [fasting|post_meal]");
    process.exit(1);
  }

  const vital = await prisma.vital.create({
    data: {
      patientId,
      systolic: Number(sys),
      diastolic: Number(dia),
      glucose: glucose ? Number(glucose) : null,
      glucoseContext: glucose ? (ctx === "post_meal" ? GlucoseContext.POST_MEAL : GlucoseContext.FASTING) : null,
      recordedAt: new Date(),
    },
  });

  const producer = new Kafka({ clientId: "insight-test-publisher", brokers: [config.KAFKA_BROKER] }).producer();
  await producer.connect();
  await producer.send({
    topic: config.KAFKA_TOPIC,
    messages: [
      {
        key: patientId,
        value: JSON.stringify({ vitalId: vital.id, patientId, recordedAt: vital.recordedAt.toISOString() }),
      },
    ],
  });
  await producer.disconnect();
  console.log(`Published vitals.logged for ${patientId} (vital ${vital.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
