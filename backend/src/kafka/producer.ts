import { Kafka, logLevel, Producer } from 'kafkajs';
import { config } from '../config';

let producer: Producer | null = null;
let isConnecting = false;

export async function getKafkaProducer(): Promise<Producer | null> {
  if (producer) return producer;
  if (isConnecting) return null;

  try {
    isConnecting = true;
    const kafka = new Kafka({
      clientId: 'healthlens-backend',
      brokers: [config.kafkaBroker],
      logLevel: logLevel.WARN,
    });

    const p = kafka.producer();
    await p.connect();
    producer = p;
    console.log(`[Kafka] Connected producer to ${config.kafkaBroker}`);
    return producer;
  } catch (err) {
    console.warn(`[Kafka] Could not connect to Kafka (${config.kafkaBroker}). Events will be queued/logged:`, (err as Error).message);
    return null;
  } finally {
    isConnecting = false;
  }
}

export async function publishVitalLoggedEvent(payload: {
  vitalId: string;
  patientId: string;
  recordedAt: Date;
}): Promise<void> {
  try {
    const p = await getKafkaProducer();
    if (!p) {
      console.warn('[Kafka] Skipping publish (producer unavailable):', payload);
      return;
    }

    await p.send({
      topic: 'vitals.logged',
      messages: [
        {
          key: payload.patientId, // Ensures in-order processing per patient
          value: JSON.stringify({
            vitalId: payload.vitalId,
            patientId: payload.patientId,
            recordedAt: payload.recordedAt.toISOString(),
          }),
        },
      ],
    });
  } catch (err) {
    console.error('[Kafka] Failed to publish vitals.logged event:', err);
  }
}

