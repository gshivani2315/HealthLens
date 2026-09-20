import { Type, type Schema } from "@google/genai";
import { z } from "zod";

// ───────── Clinical analysis (doctor-facing, runs on the real-time path) ─────────

export const clinicalAnalysisZ = z.object({
  riskLevel: z.enum(["LOW", "MODERATE", "HIGH"]),
  trend: z.enum(["RISING", "FALLING", "STABLE", "VOLATILE"]),
  rationale: z.string().min(1),
});
export type ClinicalAnalysis = z.infer<typeof clinicalAnalysisZ>;

export const clinicalAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    riskLevel: { type: Type.STRING, enum: ["LOW", "MODERATE", "HIGH"] },
    trend: { type: Type.STRING, enum: ["RISING", "FALLING", "STABLE", "VOLATILE"] },
    rationale: { type: Type.STRING },
  },
  required: ["riskLevel", "trend", "rationale"],
};

// ───────── Weekly patient summary ─────────

export const weeklySummaryZ = z.object({
  overallTrend: z.enum(["IMPROVING", "STABLE", "WORSENING"]),
  narrative: z.string().min(1),
  takeaways: z.array(z.string().min(1)).min(1).max(5),
});
export type WeeklySummaryAi = z.infer<typeof weeklySummaryZ>;

export const weeklySummarySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    overallTrend: { type: Type.STRING, enum: ["IMPROVING", "STABLE", "WORSENING"] },
    narrative: { type: Type.STRING },
    takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["overallTrend", "narrative", "takeaways"],
};
