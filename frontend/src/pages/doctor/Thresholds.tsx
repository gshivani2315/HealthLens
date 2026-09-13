import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { thresholdsService } from "@/services/thresholdsService";
import { patientsService } from "@/services/patientsService";
import { useToast } from "@/context/ToastContext";
import { ThresholdConfig } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";

export default function Thresholds() {
  const { id } = useParams<{ id: string }>();
  const { showToast } = useToast();
  const [config, setConfig] = useState<ThresholdConfig | null>(null);
  const [patientName, setPatientName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([thresholdsService.get(id), patientsService.getProfile(id)]).then(([cfg, profile]) => {
      setConfig(cfg);
      setPatientName(profile.name);
      setLoading(false);
    });
  }, [id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config || !id) return;
    setSaving(true);
    try {
      const saved = await thresholdsService.save(id, config);
      setConfig(saved);
      showToast("Thresholds saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save thresholds", "error");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof ThresholdConfig>(key: K, value: ThresholdConfig[K]) {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  if (loading || !config) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Threshold &amp; monitoring configuration</h1>
        <p className="text-sm text-ink-400">Baselines for {patientName}</p>
      </div>

      <Card as="form" onSubmit={handleSubmit} className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Blood pressure cut-offs (mmHg)</legend>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Systolic max"
              value={config.systolicMax}
              onChange={(v) => update("systolicMax", v)}
            />
            <NumberField
              label="Diastolic max"
              value={config.diastolicMax}
              onChange={(v) => update("diastolicMax", v)}
            />
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Trigger an immediate alert if systolic exceeds {config.systolicMax} or diastolic exceeds {config.diastolicMax} mmHg.
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Fasting glucose limits (mg/dL)</legend>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Low limit"
              value={config.glucoseFastingMin}
              onChange={(v) => update("glucoseFastingMin", v)}
            />
            <NumberField
              label="High limit"
              value={config.glucoseFastingMax}
              onChange={(v) => update("glucoseFastingMax", v)}
            />
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Post-meal glucose limit (mg/dL)</legend>
          <NumberField
            label="High limit"
            value={config.glucosePostMealMax}
            onChange={(v) => update("glucosePostMealMax", v)}
          />
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Weight fluctuation tolerance</legend>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Δ Weight (kg)"
              value={config.weightDeltaKg}
              step={0.5}
              onChange={(v) => update("weightDeltaKg", v)}
            />
            <NumberField
              label="Within (days)"
              value={config.weightDeltaDays}
              onChange={(v) => update("weightDeltaDays", v)}
            />
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Alert if weight changes by {config.weightDeltaKg}kg or more within {config.weightDeltaDays} days.
          </p>
        </fieldset>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="submit" isLoading={saving}>
            Save thresholds
          </Button>
        </div>
      </Card>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-400">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="input"
      />
    </label>
  );
}
