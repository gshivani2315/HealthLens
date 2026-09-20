import { Kafka, logLevel } from "kafkajs";
import { config } from "./config";
import { prisma } from "./db";
import { vitalsLoggedSchema } from "./events";
import { startSchedulers } from "./schedulers";
import { processVitalEvent } from "./services/analyzer";
import { withRetries } from "./util";

const kafka = new Kafka({ clientId: "insight-worker", brokers: [config.KAFKA_BROKER], logLevel: logLevel.WARN });
const consumer = kafka.consumer({ groupId: config.KAFKA_GROUP_ID });
const producer = kafka.producer();

async function ensureTopics(): Promise<void> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    // Returns false (no error) if the topics already exist
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        { topic: config.KAFKA_TOPIC, numPartitions: 3 },
        { topic: config.KAFKA_DLQ_TOPIC, numPartitions: 1 },
      ],
    });
  } finally {
    await admin.disconnect();
  }
}

async function sendToDlq(raw: string, error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`[DLQ]: ${reason}`);
  await producer.send({
    topic: config.KAFKA_DLQ_TOPIC,
    messages: [{ value: raw, headers: { error: reason.slice(0, 500) } }],
  });
}

async function start(): Promise<void> {
  await prisma.$connect();
  await producer.connect();
  await consumer.connect();
  await ensureTopics();
  await consumer.subscribe({ topic: config.KAFKA_TOPIC, fromBeginning: false });

  console.log(`🚀 Insight Worker listening on "${config.KAFKA_TOPIC}" (group ${config.KAFKA_GROUP_ID})`);
  startSchedulers();

  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString();
      if (!raw) return;

      // Malformed message -> DLQ immediately (retrying won't fix it)
      let event;
      try {
        event = vitalsLoggedSchema.parse(JSON.parse(raw));
      } catch (err) {
        await sendToDlq(raw, err);
        return;
      }

      // Transient failure (DB blip etc.) -> retry with backoff, then DLQ. Processing is idempotent.
      try {
        await withRetries(() => processVitalEvent(event), 3);
      } catch (err) {
        await sendToDlq(raw, err);
      }
    },
  });
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down…`);
  await Promise.allSettled([consumer.disconnect(), producer.disconnect(), prisma.$disconnect()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
