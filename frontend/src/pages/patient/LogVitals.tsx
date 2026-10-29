import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { vitalsService } from "@/services/vitalsService";
import { GlucoseContext } from "@/types";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { cx, nowIso } from "@/lib/utils";

export default function LogVitals() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [glucose, setGlucose] = useState("");
  const [glucoseContext, setGlucoseContext] = useState<GlucoseContext>("fasting");
  const [weight, setWeight] = useState("");
  const [sleepHours, setSleepHours] = useState(7);
  const [heartRate, setHeartRate] = useState("");
  const [recordedAt, setRecordedAt] = useState(() => nowIso().slice(0, 16));
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    const hasAnyVital = systolic || diastolic || glucose || weight || heartRate;
    if (!hasAnyVital) {
      showToast("Please enter at least one reading before submitting.", "error");
      return;
    }

    if ((systolic && !diastolic) || (!systolic && diastolic)) {
      showToast("Please enter both systolic and diastolic blood pressure, or neither.", "error");
      return;
    }

    setIsSubmitting(true);
    try {
      await vitalsService.submitVitals(user.id, {
        systolic: systolic ? Number(systolic) : undefined,
        diastolic: diastolic ? Number(diastolic) : undefined,
        glucose: glucose ? Number(glucose) : undefined,
        glucoseContext,
        weightKg: weight ? Number(weight) : undefined,
        sleepHours,
        heartRate: heartRate ? Number(heartRate) : undefined,
        recordedAt: new Date(recordedAt).toISOString(),
      });
      showToast("Vitals submitted successfully");
      navigate("/patient/dashboard");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't submit vitals", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 font-display text-xl font-semibold text-ink">Log today's vitals</h1>
      <p className="mb-6 text-sm text-ink-400">Fill in what you have — every field is optional except at least one reading.</p>

      <Card as="form" className="space-y-6" onSubmit={handleSubmit}>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Blood pressure (mmHg)</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Systolic">
              <input
                type="number"
                inputMode="numeric"
                value={systolic}
                onChange={(e) => setSystolic(e.target.value)}
                placeholder="120"
                className="input"
              />
            </Field>
            <Field label="Diastolic">
              <input
                type="number"
                inputMode="numeric"
                value={diastolic}
                onChange={(e) => setDiastolic(e.target.value)}
                placeholder="80"
                className="input"
              />
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Blood glucose (mg/dL)</legend>
          <div className="flex gap-3">
            <input
              type="number"
              inputMode="numeric"
              value={glucose}
              onChange={(e) => setGlucose(e.target.value)}
              placeholder="110"
              className="input flex-1"
            />
            <div className="flex overflow-hidden rounded border border-line">
              {(["fasting", "post_meal"] as GlucoseContext[]).map((ctx) => (
                <button
                  type="button"
                  key={ctx}
                  onClick={() => setGlucoseContext(ctx)}
                  className={cx(
                    "px-3 py-2 text-xs font-medium",
                    glucoseContext === ctx ? "bg-teal-500 text-white" : "bg-white text-ink-500 hover:bg-ink-50"
                  )}
                >
                  {ctx === "fasting" ? "Fasting" : "Post-meal"}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* Heart Rate Field */}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Resting Heart Rate (bpm)</legend>
          <Field label="Pulse / Heart rate (beats per minute)">
            <input
              type="number"
              inputMode="numeric"
              value={heartRate}
              onChange={(e) => setHeartRate(e.target.value)}
              placeholder="72"
              className="input"
            />
          </Field>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (kg)">
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="72.5"
              className="input"
            />
          </Field>
          <Field label={`Sleep last night (${sleepHours}h)`}>
            <input
              type="range"
              min="0"
              max="14"
              step="0.5"
              value={sleepHours}
              onChange={(e) => setSleepHours(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>

        <Field label="Date & time of reading">
          <input
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => setRecordedAt(e.target.value)}
            className="input"
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            Save readings
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-500">{label}</label>
      {children}
    </div>
  );
}
