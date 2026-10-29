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

const show = (n?: number | null) => (n === undefined || n === null ? "—" : n);

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
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
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
      await patientsService.updatePatient(id, updates);
      showToast("Patient profile updated successfully", "success");
      setIsEditOpen(false);
      loadDetail();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update patient");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteSubmit() {
    if (!id) return;
    setIsSubmitting(true);
    try {
      await patientsService.deletePatient(id);
      showToast("Care assignment ended. Patient removed from your active roster.", "success");
      setIsDeleteOpen(false);
      navigate("/doctor/dashboard");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove patient", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGenerateSummary() {
    if (!id) return;
    setIsGeneratingSummary(true);
    try {
      await patientsService.generateWeeklySummary(id);
      showToast("Weekly clinical summary generated successfully", "success");
      loadDetail();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to generate summary", "error");
    } finally {
      setIsGeneratingSummary(false);
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

  const points = vitalsLog.map((v) => ({
    date: v.recordedAt,
    systolic: v.systolic,
    diastolic: v.diastolic,
    glucose: v.glucose,
    weightKg: v.weightKg,
    sleepHours: v.sleepHours,
    heartRate: v.heartRate,
  }));

  return (
    <div className="page-enter mx-auto max-w-[1500px] space-y-6">
      {/* Patient Header Card */}
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-sans text-2xl font-bold tracking-tight text-ink">{profile.name}</h1>
            <Badge tone={riskStatus}>{riskStatus}</Badge>
            {profile.specialty && (
              <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 border border-teal-200">
                {profile.specialty}
              </span>
            )}
            {profile.clinic?.name && (
              <span className="rounded-md bg-ink-50 px-2 py-0.5 text-xs text-ink-600 border border-line">
                {profile.clinic.name}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {profile.gender} • {profile.age} years old • Conditions:{" "}
            {profile.conditions.map((c) => c.label).join(", ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/doctor/chat"
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-ink-50"
          >
            Chat Thread
          </Link>
          <button
            type="button"
            onClick={openEditModal}
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-ink-50"
          >
            Edit Profile
          </button>
          <Link
            to={`/doctor/patients/${profile.id}/thresholds`}
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-ink-50"
          >
            Alert Thresholds
          </Link>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-brick-600 shadow-sm hover:border-brick-300 hover:bg-brick-50"
          >
            End Care Assignment
          </button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          {/* Contact patient */}
          <Card>
            <CardHeader title="Contact patient" />
            <div className="space-y-2 text-sm">
              {profile.phone ? (
                <a
                  href={`tel:${profile.phone}`}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2 font-medium text-[#214c3b] hover:bg-ink-50"
                >
                  <span>{profile.phone}</span>
                  <span className="text-xs font-semibold">Call</span>
                </a>
              ) : (
                <p className="text-ink-400">No phone number on file.</p>
              )}
              {profile.email && (
                <a
                  href={`mailto:${profile.email}`}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-ink-600 hover:bg-ink-50"
                >
                  <span className="truncate">{profile.email}</span>
                  <span className="ml-2 text-xs font-semibold">Email</span>
                </a>
              )}
            </div>
          </Card>

          {/* Clinical Team / Multi-Doctor Panel */}
          {profile.careTeam && profile.careTeam.length > 0 && (
            <Card>
              <CardHeader title="Care Team (Active Doctors)" />
              <div className="space-y-2 mt-2">
                {profile.careTeam.map((m: any) => (
                  <div key={m.assignmentId} className="rounded-lg border border-line/70 p-2.5 text-xs bg-ink-50/50">
                    <p className="font-semibold text-ink">{m.doctorName}</p>
                    <p className="text-ink-500 mt-0.5">{m.specialty} • {m.clinicName}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Gemini AI Clinical Assessment & Manual Trigger */}
          <Card className="border-teal-100 bg-teal-50/40">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-teal-700">Gemini Trend Analysis</p>
              <button
                type="button"
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary}
                className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-white/70 px-2 py-1 rounded border border-teal-200"
              >
                {isGeneratingSummary ? "Generating..." : "⚡ Run AI Summary"}
              </button>
            </div>
            {aiClinicalInsight ? (
              <>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">{aiClinicalInsight.narrative}</p>
                <p className="mt-2 text-xs text-ink-400">Generated {timeAgo(aiClinicalInsight.generatedAt)}</p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-400">
                No AI assessment yet. Click "Run AI Summary" or await the scheduled run.
              </p>
            )}
          </Card>

          <Card>
            <div className="flex items-start justify-between">
              <CardHeader title="Active alert history" />
              <Link to="/doctor/alerts" className="text-xs font-semibold text-teal-600 hover:underline">
                Manage in console
              </Link>
            </div>
            <ul className="space-y-3">
              {alertHistory.map((a) => (
                <li key={a.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={a.severity}>{a.severity}</Badge>
                    <span className="text-xs text-ink-400">{timeAgo(a.triggeredAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink">{a.triggerLabel}</p>
                  <p className="mt-0.5 text-xs capitalize text-ink-400">{a.status}</p>
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
                      Visit requested {timeAgo(a.followUp.requestedAt)}
                      {a.followUp.note ? ` — "${a.followUp.note}"` : ""}
                    </p>
                  )}
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

          {/* Doctor Vitals Log with Heart Rate */}
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
                    <th className="px-4 py-2 font-medium">Heart Rate</th>
                    <th className="px-4 py-2 font-medium">Glucose</th>
                    <th className="px-4 py-2 font-medium">Weight</th>
                    <th className="px-4 py-2 font-medium">Sleep</th>
                  </tr>
                </thead>
                <tbody>
                  {vitalsLog.map((v) => (
                    <tr key={v.id} className="border-b border-line last:border-0 hover:bg-ink-50/50">
                      <td className="px-4 py-2 text-ink-500">{formatDateTime(v.recordedAt)}</td>
                      <td className="px-4 py-2 font-mono tabular text-ink">
                        {v.systolic != null && v.diastolic != null ? `${v.systolic}/${v.diastolic}` : "—"}
                      </td>
                      <td className="px-4 py-2 font-mono tabular text-ink">
                        {v.heartRate != null ? `${v.heartRate} bpm` : "—"}
                      </td>
                      <td className="px-4 py-2 font-mono tabular text-ink">{show(v.glucose)}</td>
                      <td className="px-4 py-2 font-mono tabular text-ink">{show(v.weightKg)}</td>
                      <td className="px-4 py-2 font-mono tabular text-ink">{show(v.sleepHours)}</td>
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

      {/* END CARE ASSIGNMENT MODAL */}
      <Modal open={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} title="End Care Assignment">
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Are you sure you want to end your active care assignment for{" "}
            <span className="font-semibold text-ink">{profile.name}</span>?
          </p>
          <p className="text-xs text-ink-400">
            This ends your clinical supervision and locks messaging for this assignment. The patient’s account,
            historical telemetry data, and assignments with other doctors remain intact.
          </p>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={isSubmitting} onClick={handleDeleteSubmit}>
              End Assignment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
