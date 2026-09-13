import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { vitalsService } from "@/services/vitalsService";
import { TrendPoint, TrendRange, TrendSummaryStats, VitalFilter } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import BPChart from "@/components/charts/BPChart";
import GlucoseChart from "@/components/charts/GlucoseChart";
import WeightSleepChart from "@/components/charts/WeightSleepChart";
import { cx } from "@/lib/utils";

const ranges: { value: TrendRange; label: string }[] = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
];

const filters: { value: VitalFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bp", label: "Blood pressure" },
  { value: "glucose", label: "Glucose" },
  { value: "weight", label: "Weight" },
  { value: "sleep", label: "Sleep" },
];

export default function Trends() {
  const { user } = useAuth();
  const [range, setRange] = useState<TrendRange>("30d");
  const [filter, setFilter] = useState<VitalFilter>("all");
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [stats, setStats] = useState<Partial<Record<VitalFilter, TrendSummaryStats>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    vitalsService
      .getTrends(user.id, range, filter)
      .then((res) => {
        setPoints(res.points);
        setStats(res.stats);
      })
      .finally(() => setLoading(false));
  }, [user, range, filter]);

  const showBp = filter === "all" || filter === "bp";
  const showGlucose = filter === "all" || filter === "glucose";
  const showWeightSleep = filter === "all" || filter === "weight" || filter === "sleep";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">Trends &amp; analytics</h1>
        <div className="flex gap-2">
          <SegmentedControl value={range} onChange={setRange} options={ranges} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cx(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f.value ? "border-teal-500 bg-teal-500 text-white" : "border-line bg-white text-ink-500 hover:border-ink-300"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {showBp && (
              <Card>
                <CardHeader title="Blood pressure" subtitle="Systolic (orange) vs diastolic (teal), with normal reference zones" />
                <BPChart data={points} showThreshold />
              </Card>
            )}
            {showGlucose && (
              <Card>
                <CardHeader title="Blood glucose" subtitle="Daily readings against threshold bands" />
                <GlucoseChart data={points} />
              </Card>
            )}
            {showWeightSleep && (
              <Card>
                <CardHeader title="Weight &amp; sleep" subtitle="Sleep hours (bars) alongside body weight (line)" />
                <WeightSleepChart data={points} />
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Summary" subtitle={`Selected period: ${ranges.find((r) => r.value === range)?.label}`} />
              <div className="space-y-4">
                {summaryRows(showBp, showGlucose, showWeightSleep).map(([key, label]) => {
                  const s = stats[key];
                  if (!s) return null;
                  return (
                    <div key={key} className="border-b border-line pb-3 last:border-0 last:pb-0">
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <Stat label="Avg" value={s.average} unit={s.unit} />
                        <Stat label="Peak" value={s.peak} unit={s.unit} />
                        <Stat label="Low" value={s.lowest} unit={s.unit} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function summaryRows(showBp: boolean, showGlucose: boolean, showWeightSleep: boolean): [VitalFilter, string][] {
  const rows: [VitalFilter, string][] = [];
  if (showBp) rows.push(["bp", "Systolic BP"]);
  if (showGlucose) rows.push(["glucose", "Glucose"]);
  if (showWeightSleep) rows.push(["weight", "Weight"], ["sleep", "Sleep"]);
  return rows;
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <p className="font-mono tabular text-base font-semibold text-ink">{value}</p>
      <p className="text-[11px] text-ink-400">
        {label} {unit}
      </p>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex overflow-hidden rounded border border-line bg-white">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cx(
            "px-3 py-1.5 text-xs font-medium transition-colors",
            value === opt.value ? "bg-ink-600 text-white" : "text-ink-500 hover:bg-ink-50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
