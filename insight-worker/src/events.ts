import { z } from "zod";

/**
 * Contract between the backend (producer) and the insight-worker (consumer).
 *
 * Topic: `vitals.logged`  |  key: patientId (keeps one patient's events ordered)
 * Published once per submission, AFTER the Vital row is committed. The worker re-reads the row
 * by vitalId, so the DB stays the single source of truth and the payload stays tiny.
 */
export const vitalsLoggedSchema = z.object({
  vitalId: z.string().min(1),
  patientId: z.string().min(1),
  recordedAt: z.coerce.date(),
});

export type VitalsLoggedEvent = z.infer<typeof vitalsLoggedSchema>;
