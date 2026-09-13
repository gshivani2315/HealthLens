import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { patientsService } from "@/services/patientsService";
import { PatientDetail as PatientDetailType, TrendRange } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import BPChart from "@/components/charts/BPChart";
import GlucoseChart from "@/components/charts/GlucoseChart";
import { cx, formatDate, formatDateTime, timeAgo } from "@/lib/utils";

const ranges: { value: TrendRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<PatientDetailType | null>(null);
  const [range, setRange] = useState<TrendRange>("30d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    patientsService.getPatientDetail(id).then(setDetail).finally(() => setLoading(false));
  }, [id]);

  if (loading || !detail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { profile, riskStatus, aiClinicalInsight, alertHistory, vitalsLog } = detail;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const points = vitalsLog.slice(0, days).slice().reverse();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-lg font-semibold text-ink-600">
            {profile.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </div>
          <div>
            <h1 className="font-display text-lg font-semibold text-ink">{profile.name}</h1>
            <p className="text-sm text-ink-400">
              {profile.age} yrs · {profile.gender} · {profile.conditions.map((c) => c.label).join(", ")}
            </p>
          </div>
          <Badge tone={riskStatus}>{riskStatus}</Badge>
        </div>
        <Link
          to={`/doctor/patients/${profile.id}/thresholds`}
          className="rounded border border-line bg-white px-3 py-2 text-sm font-medium text-ink-600 hover:border-ink-300"
        >
          Adjust thresholds
        </Link>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card className="border-teal-100 bg-teal-50/40">
            <p className="text-xs font-medium uppercase tracking-wide text-teal-600">Gemini trend analysis</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink">{aiClinicalInsight.narrative}</p>
            <p className="mt-2 text-xs text-ink-400">Generated {timeAgo(aiClinicalInsight.generatedAt)}</p>
          </Card>

          <Card>
            <CardHeader title="Active alert history" />
            <ul className="space-y-3">
              {alertHistory.map((a) => (
                <li key={a.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={a.severity}>{a.severity}</Badge>
                    <span className="text-xs text-ink-400">{timeAgo(a.triggeredAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink">{a.triggerLabel}</p>
                  {a.clinicalNote && <p className="mt-1 text-xs italic text-ink-400">Note: {a.clinicalNote}</p>}
                </li>
              ))}
              {alertHistory.length === 0 && <p className="text-sm text-ink-400">No alerts on record.</p>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <CardHeader title="Blood pressure" />
              <div className="mb-4 flex overflow-hidden rounded border border-line">
                {ranges.map((r) => (
                  <button
                    key={r.value}
                    onClick={() => setRange(r.value)}
                    className={cx(
                      "px-3 py-1.5 text-xs font-medium",
                      range === r.value ? "bg-ink-600 text-white" : "bg-white text-ink-500 hover:bg-ink-50"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <BPChart data={points} showThreshold />
          </Card>

          <Card>
            <CardHeader title="Glucose" />
            <GlucoseChart data={points} />
          </Card>

          <Card padded={false}>
            <div className="border-b border-line p-4">
              <h3 className="font-display text-base font-semibold text-ink">Raw vitals log</h3>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-4 py-2 font-medium">Timestamp</th>
                    <th className="px-4 py-2 font-medium">BP</th>
                    <th className="px-4 py-2 font-medium">Glucose</th>
                    <th className="px-4 py-2 font-medium">Weight</th>
                    <th className="px-4 py-2 font-medium">Sleep</th>
                  </tr>
                </thead>
                <tbody>
                  {vitalsLog.map((v) => (
                    <tr key={v.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 text-ink-500">{formatDateTime(v.recordedAt)}</td>
                      <td className="px-4 py-2 font-mono tabular text-ink">
                        {v.systolic}/{v.diastolic}
                      </td>
                      <td className="px-4 py-2 font-mono tabular text-ink">{v.glucose}</td>
                      <td className="px-4 py-2 font-mono tabular text-ink">{v.weightKg}</td>
                      <td className="px-4 py-2 font-mono tabular text-ink">{v.sleepHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
