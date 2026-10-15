import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useToast } from "@/context/ToastContext";
import { patientsService } from "@/services/patientsService";
import { PatientDetail as PatientDetailType, RiskStatus, TrendRange, UpdatePatientPayload } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import BPChart from "@/components/charts/BPChart";
import GlucoseChart from "@/components/charts/GlucoseChart";
import { cx, formatDateTime, timeAgo } from "@/lib/utils";

const ranges: { value: TrendRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [detail, setDetail] = useState<PatientDetailType | null>(null);
  const [range, setRange] = useState<TrendRange>("30d");
  const [loading, setLoading] = useState(true);

  // Modals
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
  const [editGender, setEditGender] = useState("Male");
  const [editConditions, setEditConditions] = useState("");
  const [editRiskStatus, setEditRiskStatus] = useState<RiskStatus>("normal");

  function loadDetail() {
    if (!id) return;
    patientsService
      .getPatientDetail(id)
      .then(setDetail)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDetail();
  }, [id]);

  function openEditModal() {
    if (!detail) return;
    setEditName(detail.profile.name);
    setEditEmail(detail.profile.email);
    setEditPhone(detail.profile.phone);
    setEditDateOfBirth(detail.profile.dateOfBirth);
    setEditGender(detail.profile.gender);
    setEditConditions(detail.profile.conditions.map((c) => c.label).join(", "));
    setEditRiskStatus(detail.riskStatus);
    setFormError(null);
    setIsEditOpen(true);
  }

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setFormError(null);

    if (!editName.trim() || !editEmail.trim() || !editPhone.trim()) {
      setFormError("Please fill in all required fields.");
      return;
    }

    const conditions = editConditions
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const updates: UpdatePatientPayload = {
      name: editName.trim(),
      email: editEmail.trim(),
      phone: editPhone.trim(),
      dateOfBirth: editDateOfBirth,
      gender: editGender,
      conditions: conditions.length > 0 ? conditions : ["General Monitoring"],
      riskStatus: editRiskStatus,
    };

    setIsSubmitting(true);
    try {
      const updatedProfile = await patientsService.updatePatient(id, updates);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              profile: updatedProfile,
              riskStatus: editRiskStatus,
            }
          : prev
      );
      showToast("Patient profile updated successfully.", "success");
      setIsEditOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteSubmit() {
    if (!id) return;
    setIsSubmitting(true);
    try {
      await patientsService.deletePatient(id);
      showToast(`Patient removed from care roster.`, "info");
      navigate("/doctor/dashboard");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove patient", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading || !detail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { profile, riskStatus, aiClinicalInsight, alertHistory, vitalsLog } = detail;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const points = vitalsLog
    .slice(0, days)
    .reverse()
    .map((v) => ({
      date: v.recordedAt,
      systolic: v.systolic,
      diastolic: v.diastolic,
      glucose: v.glucose,
      weightKg: v.weightKg,
      sleepHours: v.sleepHours,
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Patient Header Card */}
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-100 text-lg font-semibold text-ink-600">
            {profile.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-xl font-semibold text-ink">{profile.name}</h1>
              <Badge tone={riskStatus}>{riskStatus}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-400">
              {profile.age} yrs · {profile.gender} · {profile.conditions.map((c) => c.label).join(", ")}
            </p>
            <p className="text-xs text-ink-400">
              Assigned Physician: <span className="font-medium text-ink-600">{profile.doctor?.name ?? "Dr. Elena Ruiz"}</span>
              {profile.doctor?.clinicName && ` (${profile.doctor.clinicName})`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openEditModal}
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-600 shadow-sm hover:border-ink-400 hover:text-ink"
          >
            Edit Profile
          </button>
          <Link
            to={`/doctor/patients/${profile.id}/thresholds`}
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink-600 shadow-sm hover:border-ink-400 hover:text-ink"
          >
            Adjust thresholds
          </Link>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-brick-600 shadow-sm hover:border-brick-300 hover:bg-brick-50"
          >
            Remove Patient
          </button>
        </div>
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

      {/* EDIT PROFILE MODAL */}
      <Modal open={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit Patient: ${profile.name}`}>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Full Name *</label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Email *</label>
              <input
                type="email"
                required
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Phone *</label>
              <input
                type="tel"
                required
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Date of Birth</label>
              <input
                type="date"
                value={editDateOfBirth}
                onChange={(e) => setEditDateOfBirth(e.target.value)}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Gender</label>
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value)}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Conditions (comma-separated)</label>
            <input
              type="text"
              value={editConditions}
              onChange={(e) => setEditConditions(e.target.value)}
              className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">Clinical Risk Assessment</label>
            <select
              value={editRiskStatus}
              onChange={(e) => setEditRiskStatus(e.target.value as RiskStatus)}
              className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
            >
              <option value="normal">Normal</option>
              <option value="moderate">Moderate</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {formError && <p className="text-sm text-brick-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* DELETE MODAL */}
      <Modal open={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="Remove Patient from Care">
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Are you sure you want to remove <span className="font-semibold text-ink">{profile.name}</span> from your care roster?
          </p>
          <p className="text-xs text-ink-400">
            This will unassign the patient from your clinical supervision and remove them from active monitoring.
          </p>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={isSubmitting} onClick={handleDeleteSubmit}>
              Remove Patient
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
