import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { insightsService } from "@/services/insightsService";
import { AlertItem, WeeklySummary } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import { formatDate, formatDateTime } from "@/lib/utils";

export default function Insights() {
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [showAlertDrawer, setShowAlertDrawer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([insightsService.getWeeklySummaries(user.id), insightsService.getAlertHistory(user.id)])
      .then(([s, a]) => {
        setSummaries(s);
        setAlerts(a);
      })
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">AI health summaries</h1>
        <button
          onClick={() => setShowAlertDrawer((s) => !s)}
          className="rounded border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink-500 hover:border-ink-300"
        >
          {showAlertDrawer ? "Hide alert history" : "View alert history"}
        </button>
      </div>

      {showAlertDrawer && (
        <Card>
          <CardHeader title="Alert history" subtitle="Past pattern notifications and threshold warnings" />
          <ul className="divide-y divide-line">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{a.triggerLabel}</p>
                  <p className="text-xs text-ink-400">{formatDateTime(a.triggeredAt)}</p>
                </div>
                <Badge tone={a.severity}>{a.severity}</Badge>
              </li>
            ))}
            {alerts.length === 0 && <p className="py-3 text-sm text-ink-400">No alerts on record.</p>}
          </ul>
        </Card>
      )}

      <div className="space-y-5">
        {summaries.map((s) => (
          <Card key={s.id}>
            <div className="mb-3 flex items-center justify-between text-xs text-ink-400">
              <span>
                Week of {formatDate(s.weekStart)} – {formatDate(s.weekEnd)}
              </span>
              <span>Generated {formatDate(s.generatedAt)}</span>
            </div>
            <p className="text-[15px] leading-relaxed text-ink">{s.narrative}</p>
            {s.takeaways.length > 0 && (
              <div className="mt-4 rounded border border-teal-100 bg-teal-50/50 p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-teal-600">Lifestyle takeaways</p>
                <ul className="space-y-1 text-sm text-ink">
                  {s.takeaways.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-teal-500">·</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}
        {summaries.length === 0 && (
          <Card>
            <p className="text-sm text-ink-400">No weekly summaries yet — check back after your first full week of logging.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
