import { GoogleGenAI, type Schema } from "@google/genai";
import type { z } from "zod";
import { config } from "../config";
import { sleep, withTimeout } from "../util";

const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });

interface GenerateJsonOptions<T> {
  system: string;
  prompt: string;
  responseSchema: Schema; // constrains Gemini's output
  validator: z.ZodType<T>; // we still validate – never trust model output blindly
}

/** Structured-output call with timeout, one retry, and strict validation. Throws if it can't produce valid JSON. */
export async function generateJson<T>({ system, prompt, responseSchema, validator }: GenerateJsonOptions<T>): Promise<T> {
  const maxAttempts = 2;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await withTimeout(
        ai.models.generateContent({
          model: config.GEMINI_MODEL,
          contents: prompt,
          config: {
            systemInstruction: system,
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.2,
          },
        }),
        config.GEMINI_TIMEOUT_MS,
        "Gemini request"
      );

      const text = res.text;
      if (!text) throw new Error("Gemini returned an empty response");
      return validator.parse(JSON.parse(text));
    } catch (err) {
      lastErr = err;
      console.warn(`[Gemini]: attempt ${attempt}/${maxAttempts} failed:`, err instanceof Error ? err.message : err);
      if (attempt < maxAttempts) await sleep(1000 * attempt);
    }
  }
  throw lastErr;
}
