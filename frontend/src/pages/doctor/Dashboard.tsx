import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { patientsService } from "@/services/patientsService";
import { alertsService } from "@/services/alertsService";
import { DoctorOverview, RiskStatus } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import { cx, timeAgo } from "@/lib/utils";

type RosterFilter = "all" | "critical" | "needs_review";

export default function DoctorDashboard() {
  const [params] = useSearchParams();
  const [overview, setOverview] = useState<DoctorOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<RosterFilter>("all");

  useEffect(() => {
    patientsService.getDoctorOverview().then(setOverview).finally(() => setLoading(false));
  }, []);

  async function acknowledge(alertId: string) {
    await alertsService.updateStatus(alertId, "acknowledged");
    setOverview((prev) =>
      prev
        ? {
            ...prev,
            urgentAlerts: prev.urgentAlerts.map((a) => (a.id === alertId ? { ...a, status: "acknowledged" } : a)),
          }
        : prev
    );
  }

  const roster = useMemo(() => {
    if (!overview) return [];
    let rows = overview.roster;
    if (filter === "critical") rows = rows.filter((r) => r.riskStatus === "critical");
    if (filter === "needs_review") rows = rows.filter((r) => r.riskStatus !== "normal");
    if (search) rows = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    return rows;
  }, [overview, filter, search]);

  if (loading || !overview) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="page-enter mx-auto max-w-[1500px] space-y-5 sm:space-y-6">
      <section className="editorial-hero health-card-dark relative overflow-hidden rounded-[1.5rem] px-5 py-5 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-6 -top-16 h-56 w-56 rounded-full border border-[#D0D3C7] sm:right-10 sm:h-72 sm:w-72" />
        <div className="pointer-events-none absolute right-8 top-10 h-32 w-32 rounded-full border border-[#D0D3C7] sm:right-28 sm:top-14 sm:h-40 sm:w-40" />
        <div className="pointer-events-none absolute right-20 top-14 hidden h-44 w-44 rounded-full bg-white/35 blur-2xl sm:block" />
        <div className="relative max-w-2xl">
          <p className="section-kicker text-[#B8D0C0]">CLINICAL WORKSPACE · DAILY BRIEFING</p>
          <h1 className="mt-3 font-display text-3xl font-normal tracking-[-.035em] text-white sm:text-4xl">Patient overview</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70">A considered view of your patient roster, emerging risks, and the people who may need your attention today.</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85">
            <span className="h-2 w-2 rounded-full bg-moss-500" /> Live patient monitoring overview
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Monitored patients" value={overview.totalPatients} />
        <StatCard label="Critical alerts pending" value={overview.criticalAlertsPending} tone="critical" />
        <StatCard label="Missing readings >48h" value={overview.missingReadings48h} tone="moderate" />
      </div>

      <Card className="editorial-card">
        <CardHeader title="Urgent action center" subtitle="Active flags that may need your attention" action={<span className="rounded-full border border-[#EBCFC5] bg-[#F7EAE5] px-2.5 py-1 text-[11px] font-semibold text-brick-600">{overview.urgentAlerts.filter((a) => a.status === "unread").length} pending</span>} />
        {overview.urgentAlerts.length === 0 ? (
          <p className="text-sm text-ink-400">No urgent alerts right now.</p>
        ) : (
          <ul className="space-y-3">
            {overview.urgentAlerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-line/80 bg-[#FFFEFC] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D7CFC2] hover:shadow-[0_8px_22px_rgba(53,45,34,.06)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <Badge tone={a.severity}>{a.severity}</Badge>
                  <div>
                    <p className="text-sm font-medium text-ink">
                      {a.patientName} — {a.triggerLabel}
                    </p>
                    <p className="text-xs text-ink-400">{timeAgo(a.triggeredAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acknowledge(a.id)}
                    disabled={a.status !== "unread"}
                    className="rounded-lg border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink-600 hover:border-ink-300 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {a.status === "unread" ? "Acknowledge" : "Acknowledged"}
                  </button>
                  <Link
                    to={`/doctor/patients/${a.patientId}`}
                    className="rounded-lg bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:bg-teal-700"
                  >
                    View patient
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-line/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="font-display text-xl font-normal text-ink">Assigned patients</h3>
            <p className="mt-1 text-sm text-ink-400">{roster.length} {roster.length === 1 ? "patient" : "patients"} in this view</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              className="input sm:w-56"
            />
            <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-paper p-1">
              {(
                [
                  ["all", "All"],
                  ["critical", "Critical only"],
                  ["needs_review", "Needs review"],
                ] as [RosterFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cx(
                    "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                    filter === value ? "bg-white text-ink shadow-sm" : "bg-transparent text-ink-500 hover:bg-white/70"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-[#DDE7DF] text-[10px] uppercase tracking-[0.13em] text-ink-400">
                <th className="px-4 py-3 font-medium">Patient</th>
                <th className="px-4 py-3 font-medium">Age / Gender</th>
                <th className="px-4 py-3 font-medium">Condition</th>
                <th className="px-4 py-3 font-medium">Latest BP</th>
                <th className="px-4 py-3 font-medium">Latest glucose</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.id} className="table-row-hover border-b border-line/70 last:border-0 hover:bg-[#DDE7DF]">
                  <td className="px-4 py-4 font-semibold text-ink">{p.name}</td>
                  <td className="px-4 py-4 text-ink-500">
                    {p.age} / {p.gender}
                  </td>
                  <td className="px-4 py-4 text-ink-500">{p.primaryCondition}</td>
                  <td className="px-4 py-4 font-mono tabular text-ink-500">
                    {p.latestBloodPressure ? `${p.latestBloodPressure.systolic}/${p.latestBloodPressure.diastolic}` : "—"}
                  </td>
                  <td className="px-4 py-4 font-mono tabular text-ink-500">{p.latestGlucose ?? "—"}</td>
                  <td className="px-4 py-4">
                    <Badge tone={p.riskStatus}>{p.riskStatus}</Badge>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link to={`/doctor/patients/${p.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 hover:gap-2">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {roster.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-ink-400">
                    No patients match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: RiskStatus }) {
  return (
    <Card className="editorial-card group relative overflow-hidden border-white/80 bg-[linear-gradient(145deg,#FFFFFF_0%,#FAF7F0_100%)]">
      <div className="absolute right-0 top-0 h-20 w-20 -translate-y-8 translate-x-8 rounded-full border border-line/70 transition-transform duration-500 group-hover:translate-x-5" />
      <p className="relative text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-400">{label}</p>
      <p
        className={cx(
          "relative mt-3 font-mono tabular text-4xl font-medium tracking-tight sm:text-[2.6rem]",
          tone === "critical" ? "text-brick-500" : tone === "moderate" ? "text-amber-600" : "text-ink"
        )}
      >
        {value}
      </p>
    </Card>
  );
}
