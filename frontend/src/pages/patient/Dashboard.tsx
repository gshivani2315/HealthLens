import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { vitalsService } from "@/services/vitalsService";
import { insightsService } from "@/services/insightsService";
import { DashboardSnapshot, AlertItem } from "@/types";
import Spinner from "@/components/ui/Spinner";
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
    <div className="page-enter mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sans text-3xl font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-500">
            Welcome back, {user?.name?.split(" ")[0]}
            {snapshot.doctor && (
              <span className="ml-2 text-xs text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                Supervising: {snapshot.doctor.name} ({snapshot.doctor.clinicName})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-line bg-[#edf5ef] px-3 py-2 text-xs font-semibold text-[#214c3b]">
          <span className={`h-2 w-2 rounded-full ${snapshot.vitalsLoggedToday ? "bg-[#397d52]" : "bg-amber-500"}`} />
          {snapshot.vitalsLoggedToday ? "Today's vitals logged" : "Today's check-in pending"}
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="health-snapshot-card xl:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Daily Snapshot</h2>
            <span className="text-xl text-white/65" aria-hidden="true">•••</span>
          </div>
          <div className="mx-auto mt-5 flex h-44 w-44 items-center justify-center rounded-full border-[14px] border-white/15 relative">
            <div className="absolute inset-[-14px] rounded-full border-[14px] border-transparent border-t-[#cde6d7] border-l-[#cde6d7] rotate-[-25deg]" />
            <div className="text-center">
              <p className="font-mono text-4xl font-semibold tracking-tight">{metrics.bloodPressure.systolic}/{metrics.bloodPressure.diastolic}</p>
              <p className="mt-1 text-sm text-white/75">Blood pressure</p>
              <p className="text-xs text-white/60">mmHg</p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl bg-white/10 p-4">
            <div className="flex items-center justify-between text-sm">
              <span>Sleep</span><span className="font-semibold">{metrics.sleep.value} {metrics.sleep.unit}</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-black/25">
              <div className="h-full rounded-full bg-[#cde6d7]" style={{ width: `${Math.max(8, Math.min(100, (Number(metrics.sleep.value) / 8) * 100))}%` }} />
            </div>
            <p className="mt-2 text-xs text-white/70">Latest recorded reading</p>
          </div>
          <Link to="/patient/log-vitals" className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[#e3f0e7] px-4 py-3 text-sm font-bold text-[#214c3b] hover:bg-white">
            + Log today's vitals
          </Link>
        </section>

        <section className="rounded-2xl border border-[#c5d9cc] bg-[#edf5ef] p-5 shadow-[0_5px_18px_rgba(28,73,48,.07)] xl:col-span-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-ink">Weekly Activity</h2>
              <p className="mt-1 text-xs text-ink-500">Your recent blood pressure trend</p>
            </div>
            <span className="rounded-lg bg-[#dcebe2] px-3 py-2 text-xs font-semibold text-[#214c3b]">Recent readings⌄</span>
          </div>
          <div className="mt-4">
            <TrendSparkline data={snapshot.sparkline} />
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#214c3b]" /> Systolic</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#75a68a]" /> Diastolic</span>
          </div>
        </section>

        {/* Vitals Overview with Heart Rate Tile */}
        <section className="rounded-2xl border border-[#b5d0bf] bg-gradient-to-br from-[#c9dfd1] to-[#a9c8b7] p-5 xl:col-span-4">
          <h2 className="text-lg font-semibold text-ink">Vitals Overview</h2>
          <p className="mt-1 text-xs text-ink-500">Your latest recorded measurements</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              { label: "Blood glucose", value: metrics.glucose.value, unit: metrics.glucose.unit, icon: "◉" },
              { label: "Weight", value: metrics.weight.value, unit: metrics.weight.unit, icon: "↕" },
              { label: "Sleep", value: metrics.sleep.value, unit: metrics.sleep.unit, icon: "☾" },
              { label: "Heart rate", value: metrics.heartRate?.value, unit: "bpm", icon: "♥" },
              { label: "Blood pressure", value: `${metrics.bloodPressure.systolic}/${metrics.bloodPressure.diastolic}`, unit: "mmHg", icon: "*", span: "col-span-2" },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-xl border border-white/50 bg-white/55 p-3 transition-transform duration-200 hover:-translate-y-0.5 ${item.span || ""}`}
              >
                <div className="flex items-center justify-between gap-2 text-xs text-ink-600">
                  <span>{item.label}</span>
                  <span className="text-base text-[#214c3b]">{item.icon}</span>
                </div>
                <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink">{item.value}</p>
                <p className="text-xs text-ink-500">{item.unit}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[#c5d9cc] bg-[#edf5ef] p-5 shadow-[0_5px_18px_rgba(28,73,48,.07)] xl:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl text-ink">Your weekly perspective</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[.12em] text-[#386b51]">A note from your health data</p>
            </div>
            <span className="rounded-full bg-[#dcebe2] px-3 py-1 text-xs font-semibold text-[#214c3b]">Health insight</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-ink">{snapshot.aiInsight?.summary ?? "Keep logging your readings to build a clearer picture of your health over time."}</p>
          {snapshot.aiInsight && <p className="mt-2 text-xs text-ink-500">Generated {timeAgo(snapshot.aiInsight.generatedAt)}</p>}
        </section>

        <section className="rounded-2xl border border-[#c5d9cc] bg-[#edf5ef] p-5 shadow-[0_5px_18px_rgba(28,73,48,.07)] xl:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl text-ink">Active alert history</h2>
            <span className="rounded-full bg-[#dcebe2] px-3 py-1 text-xs font-semibold text-[#214c3b]">{alerts.length} alerts</span>
          </div>
          {alerts.length === 0 && <p className="mt-4 text-sm text-ink-500">No alerts recently — nice and steady.</p>}
          <ul className="mt-4 space-y-3">
            {alerts.slice(0, 3).map((a) => (
            <li key={a.id} className="flex items-start gap-3 border-b border-[#c5d9cc] pb-3 last:border-0 last:pb-0">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink">{a.triggerLabel}</p>
                <p className="text-xs text-ink-500">
                  {timeAgo(a.triggeredAt)} ·{" "}
                  {a.status === "unread" ? "Sent to your care team" : a.status === "acknowledged" ? "Reviewed by your doctor" : "Resolved"}
                </p>
                {a.clinicalNote && (
                  <p className="mt-1 text-xs italic text-ink-500">Note from your doctor: {a.clinicalNote}</p>
                )}
                {a.followUp && a.status !== "resolved" && (
                  <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                    Visit requested {timeAgo(a.followUp.requestedAt)}
                    {a.followUp.note ? ` — "${a.followUp.note}"` : ""}
                  </p>
                )}
              </div>
            </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
