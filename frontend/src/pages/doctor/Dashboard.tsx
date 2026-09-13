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
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Patient overview</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Monitored patients" value={overview.totalPatients} />
        <StatCard label="Critical alerts pending" value={overview.criticalAlertsPending} tone="critical" />
        <StatCard label="Missing readings >48h" value={overview.missingReadings48h} tone="moderate" />
      </div>

      <Card>
        <CardHeader title="Urgent action center" subtitle="Active flags awaiting acknowledgment" />
        {overview.urgentAlerts.length === 0 ? (
          <p className="text-sm text-ink-400">No urgent alerts right now.</p>
        ) : (
          <ul className="space-y-3">
            {overview.urgentAlerts.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded border border-line p-3 sm:flex-row sm:items-center sm:justify-between"
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
                    className="rounded border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:border-ink-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {a.status === "unread" ? "Acknowledge" : "Acknowledged"}
                  </button>
                  <Link
                    to={`/doctor/patients/${a.patientId}`}
                    className="rounded bg-ink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-500"
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
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-display text-base font-semibold text-ink">Assigned patients</h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
              className="input sm:w-56"
            />
            <div className="flex overflow-hidden rounded border border-line">
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
                    "whitespace-nowrap px-3 py-2 text-xs font-medium",
                    filter === value ? "bg-ink-600 text-white" : "bg-white text-ink-500 hover:bg-ink-50"
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
              <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-400">
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
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                  <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                  <td className="px-4 py-3 text-ink-500">
                    {p.age} / {p.gender}
                  </td>
                  <td className="px-4 py-3 text-ink-500">{p.primaryCondition}</td>
                  <td className="px-4 py-3 font-mono tabular text-ink-500">
                    {p.latestBloodPressure ? `${p.latestBloodPressure.systolic}/${p.latestBloodPressure.diastolic}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono tabular text-ink-500">{p.latestGlucose ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={p.riskStatus}>{p.riskStatus}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/doctor/patients/${p.id}`} className="text-sm font-medium text-teal-600 hover:underline">
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
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p
        className={cx(
          "mt-1.5 font-mono tabular text-3xl font-semibold",
          tone === "critical" ? "text-brick-500" : tone === "moderate" ? "text-amber-600" : "text-ink"
        )}
      >
        {value}
      </p>
    </Card>
  );
}
