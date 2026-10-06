import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  KAFKA_BROKER: z.string().default("localhost:9092"),
  KAFKA_GROUP_ID: z.string().default("healthlens-insight-group"),
  KAFKA_TOPIC: z.string().default("vitals.logged"),
  KAFKA_DLQ_TOPIC: z.string().default("vitals.logged.dlq"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().default(15_000),

  AI_COOLDOWN_HOURS: z.coerce.number().default(12),

  ENABLE_SCHEDULER: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  SCHEDULER_TZ: z.string().default("Asia/Kolkata"),
  WEEKLY_CRON: z.string().default("0 8 * * 1"),
});

export const config = schema.parse(process.env);
