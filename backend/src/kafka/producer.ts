// backend/src/kafka/producer.ts   (replaces current)
import { Kafka, logLevel, Producer } from 'kafkajs';
import { config } from '../config';

let producer: Producer | null = null;
let connecting: Promise<Producer | null> | null = null;

async function connectProducer(): Promise<Producer | null> {
  try {
    const kafka = new Kafka({
      clientId: 'healthlens-backend',
      brokers: [config.kafkaBroker],
      logLevel: logLevel.WARN,
      // Fail fast: with the defaults, every vitals POST can stall for several seconds while Kafka is down.
      connectionTimeout: 2000,
      requestTimeout: 5000,
      retry: { retries: 2, initialRetryTime: 200 },
    });
    const p = kafka.producer();
    await p.connect();
    console.log(`[Kafka] Connected producer to ${config.kafkaBroker}`);
    return p;
  } catch (err) {
    console.warn(`[Kafka] Could not connect to ${config.kafkaBroker}:`, (err as Error).message);
    return null;
  }
}

export async function getKafkaProducer(): Promise<Producer | null> {
  if (producer) return producer;
  // Shared in-flight promise: concurrent callers wait for the same connection attempt.
  // (Before, a second request arriving mid-connect got null and its event was silently dropped.)
  if (!connecting) {
    connecting = connectProducer()
      .then((p) => {
        producer = p;
        return p;
      })
      .finally(() => {
        connecting = null;
      });
  }
  return connecting;
}

/**
 * Publishes the claim-check event. Returns true if the broker accepted it, false otherwise.
 * It never throws, so a Kafka outage cannot fail a patient's reading submission; the reading is
 * already saved. NOTE: a `false` means that reading will not be analysed unless something
 * re-drives it (see the optional catch-up sweep in REVIEW_CHANGES.md).
 */
export async function publishVitalLoggedEvent(payload: {
  vitalId: string;
  patientId: string;
  recordedAt: Date;
}): Promise<boolean> {
  const p = await getKafkaProducer();
  if (!p) {
    console.warn('[Kafka] Producer unavailable, event NOT published:', payload);
    return false;
  }

  try {
    await p.send({
      topic: 'vitals.logged',
      messages: [
        {
          key: payload.patientId, // same patient -> same partition -> processed in order
          value: JSON.stringify({
            vitalId: payload.vitalId,
            patientId: payload.patientId,
            recordedAt: payload.recordedAt.toISOString(),
          }),
        },
      ],
    });
    return true;
  } catch (err) {
    console.error('[Kafka] Failed to publish vitals.logged event:', err);
    // Drop the handle so the next call builds a fresh connection instead of reusing a broken one.
    producer = null;
    await p.disconnect().catch(() => {});
    return false;
  }
}

export async function disconnectKafkaProducer(): Promise<void> {
  if (producer) await producer.disconnect().catch(() => {});
  producer = null;
}