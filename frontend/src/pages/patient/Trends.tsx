// frontend/src/pages/patient/Trends.tsx
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { vitalsService } from "@/services/vitalsService";
import { TrendPoint, TrendRange, TrendSummaryStats, VitalFilter, VitalsEntry } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import BPChart from "@/components/charts/BPChart";
import GlucoseChart from "@/components/charts/GlucoseChart";
import WeightSleepChart from "@/components/charts/WeightSleepChart";
import { cx, formatDateTime } from "@/lib/utils";

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

type ViewTab = "charts" | "history";

export default function Trends() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ViewTab>("charts");
  const [range, setRange] = useState<TrendRange>("30d");
  const [filter, setFilter] = useState<VitalFilter>("all");
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [stats, setStats] = useState<Partial<Record<VitalFilter, TrendSummaryStats>>>({});
  const [loading, setLoading] = useState(true);

  // Raw vitals history log state
  const [vitalsLog, setVitalsLog] = useState<VitalsEntry[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [logLoading, setLogLoading] = useState(false);
  const pageSize = 15;

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

  useEffect(() => {
    if (!user || activeTab !== "history") return;
    setLogLoading(true);
    vitalsService
      .getVitalsLog(user.id, logPage, pageSize)
      .then((res) => {
        setVitalsLog(res.entries);
        setLogTotal(res.total);
      })
      .finally(() => setLogLoading(false));
  }, [user, activeTab, logPage]);

  const showBp = filter === "all" || filter === "bp";
  const showGlucose = filter === "all" || filter === "glucose";
  const showWeightSleep = filter === "all" || filter === "weight" || filter === "sleep";

  const totalPages = Math.max(1, Math.ceil(logTotal / pageSize));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Vitals &amp; analytics</h1>
          <p className="mt-0.5 text-xs text-ink-400">
            Track trends over time or inspect your full timestamped reading history.
          </p>
        </div>

        {/* Tab Switcher: Analytics vs Full History */}
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line bg-white p-0.5 shadow-sm">
            <button
              onClick={() => setActiveTab("charts")}
              className={cx(
                "rounded px-3 py-1.5 text-xs font-semibold transition-all",
                activeTab === "charts" ? "bg-teal-600 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50"
              )}
            >
              📈 Trends &amp; Charts
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={cx(
                "rounded px-3 py-1.5 text-xs font-semibold transition-all",
                activeTab === "history" ? "bg-teal-600 text-white shadow-sm" : "text-ink-600 hover:bg-ink-50"
              )}
            >
              📋 Reading History
            </button>
          </div>
          {activeTab === "charts" && (
            <SegmentedControl value={range} onChange={setRange} options={ranges} />
          )}
        </div>
      </div>

      {activeTab === "charts" ? (
        <>
          <div className="flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cx(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "border-teal-500 bg-teal-500 text-white"
                    : "border-line bg-white text-ink-500 hover:border-ink-300"
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
                    <CardHeader
                      title="Blood pressure"
                      subtitle="Systolic (orange) vs diastolic (teal), with normal reference zones"
                    />
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
                  <CardHeader
                    title="Summary"
                    subtitle={`Selected period: ${ranges.find((r) => r.value === range)?.label}`}
                  />
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
        </>
      ) : (
        /* Full Reading History Table */
        <Card padded={false}>
          <div className="flex flex-col gap-2 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Past Submitted Vitals</h3>
              <p className="text-xs text-ink-400">
                Detailed record of all logged entries ({logTotal} total readings)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-400">
                Page {logPage} of {totalPages}
              </span>
              <button
                disabled={logPage <= 1 || logLoading}
                onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                className="rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-600 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={logPage >= totalPages || logLoading}
                onClick={() => setLogPage((p) => p + 1)}
                className="rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-600 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          {logLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner />
            </div>
          ) : vitalsLog.length === 0 ? (
            <div className="p-12 text-center text-sm text-ink-400">
              No vitals logged yet. Start by logging today's vitals!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-[#DDE7DF] text-[10px] uppercase tracking-[0.13em] text-ink-400">
                    <th className="px-4 py-3 font-medium">Recorded At</th>
                    <th className="px-4 py-3 font-medium">Blood Pressure</th>
                    <th className="px-4 py-3 font-medium">Heart Rate</th>
                    <th className="px-4 py-3 font-medium">Glucose</th>
                    <th className="px-4 py-3 font-medium">Weight</th>
                    <th className="px-4 py-3 font-medium">Sleep</th>
                  </tr>
                </thead>
                <tbody>
                  {vitalsLog.map((v) => (
                    <tr key={v.id} className="table-row-hover border-b border-line/70 last:border-0 hover:bg-[#DDE7DF]">
                      <td className="px-4 py-3.5 text-xs text-ink-600 font-medium">
                        {formatDateTime(v.recordedAt)}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs tabular text-ink">
                        {v.systolic != null && v.diastolic != null ? (
                          <span className="font-semibold text-ink">
                            {v.systolic}/{v.diastolic}{" "}
                            <span className="text-[10px] font-normal text-ink-400">mmHg</span>
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs tabular text-ink">
                        {v.heartRate != null ? (
                          <span>
                            {v.heartRate} <span className="text-[10px] font-normal text-ink-400">bpm</span>
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs tabular text-ink">
                        {v.glucose != null ? (
                          <span>
                            {v.glucose} <span className="text-[10px] font-normal text-ink-400">mg/dL</span>
                            {v.glucoseContext && (
                              <span className="ml-1.5 rounded bg-ink-100 px-1.5 py-0.5 text-[9px] font-sans font-medium text-ink-600 capitalize">
                                {v.glucoseContext.replace("_", " ")}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs tabular text-ink">
                        {v.weightKg != null ? (
                          <span>
                            {v.weightKg} <span className="text-[10px] font-normal text-ink-400">kg</span>
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs tabular text-ink">
                        {v.sleepHours != null ? (
                          <span>
                            {v.sleepHours} <span className="text-[10px] font-normal text-ink-400">hrs</span>
                          </span>
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
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
