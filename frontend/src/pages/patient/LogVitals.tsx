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
  const [recordedAt, setRecordedAt] = useState(() => nowIso().slice(0, 16));
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    try {
      await vitalsService.submitVitals(user.id, {
        systolic: systolic ? Number(systolic) : undefined,
        diastolic: diastolic ? Number(diastolic) : undefined,
        glucose: glucose ? Number(glucose) : undefined,
        glucoseContext,
        weightKg: weight ? Number(weight) : undefined,
        sleepHours,
        recordedAt: new Date(recordedAt).toISOString(),
      });
      showToast("Vitals submitted");
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

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Weight (kg)</legend>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="72.5"
            className="input"
          />
        </fieldset>

        <fieldset>
          <legend className="mb-2 flex items-center justify-between text-sm font-semibold text-ink">
            Sleep duration
            <span className="font-mono tabular text-teal-600">{sleepHours.toFixed(1)} hrs</span>
          </legend>
          <input
            type="range"
            min={0}
            max={12}
            step={0.5}
            value={sleepHours}
            onChange={(e) => setSleepHours(Number(e.target.value))}
            className="w-full accent-teal-500"
          />
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Timestamp</legend>
          <input
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => setRecordedAt(e.target.value)}
            className="input"
          />
        </fieldset>

        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
          Submit vitals
        </Button>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-400">{label}</span>
      {children}
    </label>
  );
}
