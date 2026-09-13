import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { alertsService } from "@/services/alertsService";
import { useToast } from "@/context/ToastContext";
import { AlertItem, AlertStatus, AlertType } from "@/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import { cx, formatDateTime } from "@/lib/utils";

const statusOptions: { value: AlertStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
];

const typeOptions: { value: AlertType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "ai_pattern", label: "AI pattern alert" },
  { value: "threshold", label: "Instant threshold alert" },
];

export default function Alerts() {
  const { showToast } = useToast();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [status, setStatus] = useState<AlertStatus | "all">("all");
  const [type, setType] = useState<AlertType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [noteTarget, setNoteTarget] = useState<AlertItem | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    setLoading(true);
    alertsService.list(status, type).then(setAlerts).finally(() => setLoading(false));
  }, [status, type]);

  async function updateStatus(id: string, next: AlertStatus) {
    const updated = await alertsService.updateStatus(id, next);
    setAlerts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    showToast(next === "acknowledged" ? "Alert acknowledged" : "Alert resolved");
  }

  async function sendFollowUp(id: string) {
    await alertsService.sendFollowUp(id);
    showToast("Follow-up reminder sent to patient");
  }

  async function saveNote() {
    if (!noteTarget) return;
    const updated = await alertsService.updateStatus(noteTarget.id, noteTarget.status, note);
    setAlerts((prev) => prev.map((a) => (a.id === noteTarget.id ? updated : a)));
    showToast("Clinical note added");
    setNoteTarget(null);
    setNote("");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Alert management console</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex overflow-hidden rounded border border-line bg-white">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={cx(
                "px-3 py-2 text-xs font-medium",
                status === opt.value ? "bg-ink-600 text-white" : "text-ink-500 hover:bg-ink-50"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as AlertType | "all")}
          className="input sm:w-56"
        >
          {typeOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((a) => (
            <Card key={a.id} className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <Badge tone={a.severity}>{a.severity}</Badge>
                <div>
                  <p className="text-sm font-medium text-ink">
                    <Link to={`/doctor/patients/${a.patientId}`} className="hover:underline">
                      {a.patientName}
                    </Link>{" "}
                    — {a.triggerLabel}
                  </p>
                  {a.detail && <p className="mt-0.5 text-sm text-ink-500">{a.detail}</p>}
                  <p className="mt-1 text-xs text-ink-400">
                    {formatDateTime(a.triggeredAt)} · {a.type === "ai_pattern" ? "AI pattern alert" : "Threshold alert"} ·{" "}
                    <span className="capitalize">{a.status}</span>
                  </p>
                  {a.clinicalNote && <p className="mt-1 text-xs italic text-ink-500">Note: {a.clinicalNote}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {a.status === "unread" && (
                  <Button size="sm" variant="secondary" onClick={() => updateStatus(a.id, "acknowledged")}>
                    Mark reviewed
                  </Button>
                )}
                {a.status !== "resolved" && (
                  <Button size="sm" variant="secondary" onClick={() => updateStatus(a.id, "resolved")}>
                    Resolve
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setNoteTarget(a);
                    setNote(a.clinicalNote ?? "");
                  }}
                >
                  Add note
                </Button>
                <Button size="sm" variant="ghost" onClick={() => sendFollowUp(a.id)}>
                  Follow up
                </Button>
              </div>
            </Card>
          ))}
          {alerts.length === 0 && (
            <Card>
              <p className="text-sm text-ink-400">No alerts match these filters.</p>
            </Card>
          )}
        </div>
      )}

      <Modal open={!!noteTarget} onClose={() => setNoteTarget(null)} title="Add clinical note">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="input mb-4 resize-none"
          placeholder="e.g. Discussed medication adherence during call…"
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setNoteTarget(null)}>
            Cancel
          </Button>
          <Button onClick={saveNote}>Save note</Button>
        </div>
      </Modal>
    </div>
  );
}
