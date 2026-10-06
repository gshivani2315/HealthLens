import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { vitalsService } from "@/services/vitalsService";
import { insightsService } from "@/services/insightsService";
import { DashboardSnapshot, AlertItem } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import StatStrip from "@/components/ui/StatStrip";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";
import TrendSparkline from "@/components/charts/TrendSparkline";
import { timeAgo } from "@/lib/utils";

export default function PatientDashboard() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([vitalsService.getDashboard(user.id), insightsService.getAlertHistory(user.id)])
      .then(([snap, alertHistory]) => {
        setSnapshot(snap);
        setAlerts(alertHistory);
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (loading || !snapshot) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { metrics } = snapshot;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-ink-400">
            {snapshot.vitalsLoggedToday ? "Today's vitals are logged." : "You haven't logged vitals today yet."}
          </p>
          <h1 className="mt-0.5 font-display text-xl font-semibold text-ink">Hi {user?.name?.split(" ")[0]}</h1>
        </div>
        <div className="flex items-center gap-3 rounded border border-line bg-paper px-4 py-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600">
            {snapshot.doctor.name.split(" ").map((p) => p[0]).slice(-2).join("")}
          </div>
          <div className="text-sm">
            <p className="font-medium text-ink">{snapshot.doctor.name}</p>
            <p className="text-ink-400">{snapshot.doctor.clinicName}</p>
          </div>
        </div>
      </Card>

      <StatStrip
        metrics={[
          { ...metrics.bloodPressure, display: `${metrics.bloodPressure.systolic}/${metrics.bloodPressure.diastolic}` },
          { ...metrics.glucose, display: `${metrics.glucose.value}` },
          { ...metrics.weight, display: `${metrics.weight.value}` },
          { ...metrics.sleep, display: `${metrics.sleep.value}` },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="border-teal-100 bg-teal-50/40">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-teal-600">AI weekly insight</p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">{snapshot.aiInsight?.summary}</p>
                {snapshot.aiInsight && (
                  <p className="mt-2 text-xs text-ink-400">Generated {timeAgo(snapshot.aiInsight.generatedAt)}</p>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="7-day glance" subtitle="Systolic and diastolic blood pressure" />
            <TrendSparkline data={snapshot.sparkline} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="flex flex-col items-start gap-3 bg-ink-600 text-white">
            <p className="font-display text-base font-semibold">Log today's vitals</p>
            <p className="text-sm text-ink-100">Takes under a minute. Keeps your trends and AI summaries accurate.</p>
            <Link
              to="/patient/log-vitals"
              className="mt-1 inline-flex w-full items-center justify-center rounded bg-white px-4 py-2.5 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-50"
            >
              Log vitals
            </Link>
          </Card>

          <Card>
            <CardHeader title="Recent alerts & notes" />
            {alerts.length === 0 && <p className="text-sm text-ink-400">No alerts recently — nice and steady.</p>}
            <ul className="space-y-3">
              {alerts.slice(0, 4).map((a) => (
                <li key={a.id} className="flex items-start gap-2.5 border-b border-line pb-3 last:border-0 last:pb-0">
                  <Badge tone={a.severity}>{a.severity}</Badge>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{a.triggerLabel}</p>
                    <p className="text-xs text-ink-400">{timeAgo(a.triggeredAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
