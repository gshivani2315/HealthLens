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
  const [saving, setSaving] = useState(false);
  const [noteTarget, setNoteTarget] = useState<AlertItem | null>(null);
  const [note, setNote] = useState("");
  const [noteShared, setNoteShared] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<AlertItem | null>(null);
  const [followUpNote, setFollowUpNote] = useState("");

  useEffect(() => {
    setLoading(true);
    alertsService.list(status, type).then(setAlerts).finally(() => setLoading(false));
  }, [status, type]);

  function replace(updated: AlertItem) {
    setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function updateStatus(id: string, next: AlertStatus) {
    try {
      replace(await alertsService.updateStatus(id, next));
      showToast(next === "acknowledged" ? "Alert marked reviewed" : "Alert resolved");
    } catch {
      showToast("Could not update the alert. Please try again.");
    }
  }

  async function saveNote() {
    if (!noteTarget) return;
    setSaving(true);
    try {
      replace(await alertsService.saveNote(noteTarget.id, note, noteShared));
      showToast(noteShared && note.trim() ? "Note saved and shared with patient" : "Private note saved");
      setNoteTarget(null);
      setNote("");
    } catch {
      showToast("Could not save the note. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveFollowUp() {
    if (!followUpTarget) return;
    setSaving(true);
    try {
      replace(await alertsService.sendFollowUp(followUpTarget.id, followUpNote.trim() || undefined));
      showToast("Follow-up request sent to patient");
      setFollowUpTarget(null);
      setFollowUpNote("");
    } catch {
      showToast("Could not send the request. Please try again.");
    } finally {
      setSaving(false);
    }
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
                  {(a.patientPhone || a.patientEmail) && (
                    <p className="mt-1 text-xs text-ink-500">
                      Contact patient:{" "}
                      {a.patientPhone && (
                        <a href={`tel:${a.patientPhone}`} className="font-medium text-[#214c3b] hover:underline">
                          {a.patientPhone}
                        </a>
                      )}
                      {a.patientPhone && a.patientEmail && " · "}
                      {a.patientEmail && (
                        <a href={`mailto:${a.patientEmail}`} className="hover:underline">
                          {a.patientEmail}
                        </a>
                      )}
                    </p>
                  )}
                  {a.clinicalNote && (
                    <p className="mt-1 text-xs italic text-ink-500">
                      Note: {a.clinicalNote}{" "}
                      <span
                        className={cx(
                          "ml-1 rounded px-1.5 py-0.5 align-middle text-[10px] font-semibold not-italic",
                          a.noteSharedWithPatient ? "bg-teal-50 text-teal-700" : "bg-ink-50 text-ink-500"
                        )}
                      >
                        {a.noteSharedWithPatient ? "Shared with patient" : "Private"}
                      </span>
                    </p>
                  )}
                  {a.followUp && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      Follow-up requested {formatDateTime(a.followUp.requestedAt)}
                      {a.followUp.note ? ` — "${a.followUp.note}"` : ""}
                    </p>
                  )}
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
                    setNoteShared(!!a.noteSharedWithPatient);
                  }}
                >
                  {a.clinicalNote ? "Edit note" : "Add note"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFollowUpTarget(a);
                    setFollowUpNote(a.followUp?.note ?? "");
                  }}
                >
                  {a.followUp ? "Update follow-up" : "Request visit"}
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

      <Modal open={!!noteTarget} onClose={() => setNoteTarget(null)} title="Clinical note">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="input mb-3 resize-none"
          placeholder="e.g. Discussed medication adherence during call…"
        />
        <label className="mb-1 flex cursor-pointer items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={noteShared}
            onChange={(e) => setNoteShared(e.target.checked)}
            className="mt-1"
          />
          <span>
            Share this note with the patient
            <span className="block text-xs text-ink-400">
              {noteShared
                ? "The patient will see this note on their dashboard."
                : "Private: only you and other clinicians can see this note."}
            </span>
          </span>
        </label>
        <p className="mb-4 text-xs text-ink-400">Saving an empty note removes it.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setNoteTarget(null)}>
            Cancel
          </Button>
          <Button onClick={saveNote} disabled={saving}>
            Save note
          </Button>
        </div>
      </Modal>

      <Modal open={!!followUpTarget} onClose={() => setFollowUpTarget(null)} title="Request a follow-up visit">
        <p className="mb-3 text-sm text-ink-500">
          The patient will see this request on their dashboard, along with your clinic's contact details.
        </p>
        <textarea
          value={followUpNote}
          onChange={(e) => setFollowUpNote(e.target.value)}
          rows={3}
          className="input mb-4 resize-none"
          placeholder="e.g. Let's review your BP trend in person this week."
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setFollowUpTarget(null)}>
            Cancel
          </Button>
          <Button onClick={saveFollowUp} disabled={saving}>
            Send request
          </Button>
        </div>
      </Modal>
    </div>
  );
}