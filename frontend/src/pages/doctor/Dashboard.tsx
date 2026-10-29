// frontend/src/pages/doctor/Dashboard.tsx
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { patientsService } from "@/services/patientsService";
import { alertsService } from "@/services/alertsService";
import { CareInvite, CreatePatientPayload, DoctorOverview, PatientRosterRow, RiskStatus, UpdatePatientPayload } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { cx, timeAgo } from "@/lib/utils";

type RosterFilter = "all" | "critical" | "needs_review";

export default function DoctorDashboard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const doctorId = user?.id;

  const [params] = useSearchParams();
  const [overview, setOverview] = useState<DoctorOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<RosterFilter>("all");

  // Modal states
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<PatientRosterRow | null>(null);
  const [deletingPatient, setDeletingPatient] = useState<PatientRosterRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ name: string; email: string; password: string } | null>(null);

  // Invite creation state
  const [inviteSpecialty, setInviteSpecialty] = useState("Primary Care");
  const [invitePatientEmail, setInvitePatientEmail] = useState("");
  const [generatedInvite, setGeneratedInvite] = useState<CareInvite | null>(null);

  // Add Patient Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("1980-01-01");
  const [gender, setGender] = useState("Male");
  const [conditionsInput, setConditionsInput] = useState("Hypertension Stage 1");
  const [specialty, setSpecialty] = useState("Primary Care");
  const [riskStatus, setRiskStatus] = useState<RiskStatus>("normal");
  const [sys, setSys] = useState<number | "">("");
  const [dia, setDia] = useState<number | "">("");
  const [glu, setGlu] = useState<number | "">("");
  const [weight, setWeight] = useState<number | "">("");
  const [hr, setHr] = useState<number | "">("");

  // Edit Patient Form State
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
  const [editGender, setEditGender] = useState("Male");
  const [editConditions, setEditConditions] = useState("");
  const [editRiskStatus, setEditRiskStatus] = useState<RiskStatus>("normal");

  function loadOverview() {
    patientsService
      .getDoctorOverview(doctorId)
      .then(setOverview)
      .catch((err) => console.error("Error loading overview:", err))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadOverview();
  }, [doctorId]);

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

  function resetAddForm() {
    setName("");
    setEmail("");
    setPhone("");
    setDateOfBirth("1980-01-01");
    setGender("Male");
    setConditionsInput("Hypertension Stage 1");
    setSpecialty("Primary Care");
    setRiskStatus("normal");
    setSys("");
    setDia("");
    setGlu("");
    setWeight("");
    setHr("");
    setFormError(null);
  }

  function openEditModal(patient: PatientRosterRow) {
    setEditingPatient(patient);
    setEditName(patient.name);
    setEditEmail(patient.email ?? "");
    setEditPhone(patient.phone ?? "");
    setEditDateOfBirth(patient.dateOfBirth || "1980-01-01");
    setEditGender(patient.gender);
    setEditConditions(patient.conditions?.map((c) => c.label).join(", ") ?? patient.primaryCondition);
    setEditRiskStatus(patient.riskStatus);
    setFormError(null);
  }

  async function handleAddPatient(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !email.trim() || !phone.trim() || !dateOfBirth) {
      setFormError("Please fill in all required patient fields.");
      return;
    }

    const conditions = conditionsInput
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    const payload: CreatePatientPayload = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      dateOfBirth,
      gender,
      conditions: conditions.length > 0 ? conditions : ["General Monitoring"],
      specialty: specialty.trim() || "Primary Care",
      riskStatus,
      initialSystolic: typeof sys === "number" ? sys : undefined,
      initialDiastolic: typeof dia === "number" ? dia : undefined,
      initialGlucose: typeof glu === "number" ? glu : undefined,
      initialWeightKg: typeof weight === "number" ? weight : undefined,
      initialHeartRate: typeof hr === "number" ? hr : undefined,
    };

    setIsSubmitting(true);
    try {
      const created = await patientsService.createPatient(payload, doctorId);
      if (created.temporaryPassword) {
        setCredentials({ name: payload.name, email: payload.email, password: created.temporaryPassword });
      }
      showToast(`Patient ${name.trim()} added successfully with active care assignment.`, "success");
      setIsAddOpen(false);
      resetAddForm();
      loadOverview();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add patient");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateInvite(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const inv = await patientsService.createCareInvite({
        specialty: inviteSpecialty,
        patientEmail: invitePatientEmail || undefined,
        daysValid: 14,
      });
      setGeneratedInvite(inv);
      showToast("Invite code generated", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to generate invite code", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditPatient(e: FormEvent) {
    e.preventDefault();
    if (!editingPatient) return;
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
      await patientsService.updatePatient(editingPatient.id, updates);
      showToast(`Patient ${editName.trim()} updated successfully.`, "success");
      setEditingPatient(null);
      loadOverview();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update patient");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeletePatient() {
    if (!deletingPatient) return;
    setIsSubmitting(true);
    try {
      await patientsService.deletePatient(deletingPatient.id);
      showToast(`Care assignment ended for ${deletingPatient.name}.`, "info");
      setDeletingPatient(null);
      loadOverview();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to remove patient", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading || !overview) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="page-enter mx-auto max-w-[1500px] space-y-5 sm:space-y-6">
      {/* Hero Header */}
      <section className="editorial-hero health-card-dark relative overflow-hidden rounded-[1.5rem] px-5 py-5 sm:px-7 sm:py-6">
        <div className="pointer-events-none absolute -right-6 -top-16 h-56 w-56 rounded-full border border-[#D0D3C7] sm:right-10 sm:h-72 sm:w-72" />
        <div className="pointer-events-none absolute right-8 top-10 h-32 w-32 rounded-full border border-[#D0D3C7] sm:right-28 sm:top-14 sm:h-40 sm:w-40" />
        <div className="pointer-events-none absolute right-20 top-14 hidden h-44 w-44 rounded-full bg-white/35 blur-2xl sm:block" />
        <div className="relative max-w-2xl">
          <p className="section-kicker text-[#B8D0C0]">CLINICAL WORKSPACE · DAILY BRIEFING</p>
          <h1 className="mt-3 font-display text-3xl font-normal tracking-[-.035em] text-white sm:text-4xl">Patient overview</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/70">
            Multi-clinic & multi-doctor care management. Review your roster, active threshold alerts, and care assignments.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85">
              <span className="h-2 w-2 rounded-full bg-moss-500" /> Physician: {user?.name ?? "Doctor"}
            </span>
            <Link
              to="/doctor/chat"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/20 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/30"
            >
              Clinical Messages →
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Monitored patients" value={overview.totalPatients} />
        <StatCard label="Critical alerts pending" value={overview.criticalAlertsPending} tone="critical" />
        <StatCard label="Missing readings >48h" value={overview.missingReadings48h} tone="moderate" />
      </div>

      {/* Urgent Alerts Section */}
      <Card className="editorial-card">
        <CardHeader
          title="Urgent action center"
          subtitle="Active flags that may need your attention"
          action={
            <span className="rounded-full border border-[#EBCFC5] bg-[#F7EAE5] px-2.5 py-1 text-[11px] font-semibold text-brick-600">
              {overview.urgentAlerts.filter((a) => a.status === "unread").length} pending
            </span>
          }
        />
        {overview.urgentAlerts.length === 0 ? (
          <p className="text-sm text-ink-400">No urgent alerts for your patients right now.</p>
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

      {/* Patient Care Roster */}
      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-line/80 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-xl font-normal text-ink">Assigned patients</h3>
              <button
                type="button"
                onClick={() => {
                  resetAddForm();
                  setIsAddOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-teal-700"
              >
                + Add Patient
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeneratedInvite(null);
                  setIsInviteOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 bg-white px-3 py-1.5 text-xs font-semibold text-teal-700 shadow-sm transition-all hover:bg-teal-50"
              >
                🎟️ Issue Invite Code
              </button>
            </div>
            <p className="mt-1 text-sm text-ink-400">
              {roster.length} {roster.length === 1 ? "patient" : "patients"} with active care assignments
            </p>
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
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={cx(
                    "whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-all",
                    filter === val ? "bg-white text-ink shadow-sm" : "bg-transparent text-ink-500 hover:bg-white/70"
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
                <th className="px-4 py-3 font-medium">Specialty / Clinic</th>
                <th className="px-4 py-3 font-medium">Age / Gender</th>
                <th className="px-4 py-3 font-medium">Condition</th>
                <th className="px-4 py-3 font-medium">Latest BP</th>
                <th className="px-4 py-3 font-medium">Heart Rate</th>
                <th className="px-4 py-3 font-medium">Glucose</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 text-right font-medium">Manage</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.id} className="table-row-hover border-b border-line/70 last:border-0 hover:bg-[#DDE7DF]">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-ink">{p.name}</p>
                    {p.email && <p className="text-xs text-ink-400">{p.email}</p>}
                  </td>
                  <td className="px-4 py-4 text-xs text-ink-500">
                    <p className="font-medium text-ink">{p.specialty || "Primary Care"}</p>
                    <p className="text-[11px] text-ink-400">{p.clinicName || "HealthLens Clinic"}</p>
                  </td>
                  <td className="px-4 py-4 text-ink-500">
                    {p.age} / {p.gender}
                  </td>
                  <td className="px-4 py-4 text-ink-500">{p.primaryCondition}</td>
                  <td className="px-4 py-4 font-mono tabular text-ink-500">
                    {p.latestBloodPressure ? `${p.latestBloodPressure.systolic}/${p.latestBloodPressure.diastolic}` : "—"}
                  </td>
                  <td className="px-4 py-4 font-mono tabular text-ink-500">
                    {p.latestHeartRate != null ? `${p.latestHeartRate} bpm` : "—"}
                  </td>
                  <td className="px-4 py-4 font-mono tabular text-ink-500">{p.latestGlucose ?? "—"}</td>
                  <td className="px-4 py-4">
                    <Badge tone={p.riskStatus}>{p.riskStatus}</Badge>
                  </td>
                  <td className="px-4 py-4 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        to={`/doctor/patients/${p.id}`}
                        className="rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-teal-600 shadow-sm hover:border-teal-400 hover:text-teal-700"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEditModal(p)}
                        className="rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink-600 shadow-sm hover:border-ink-400 hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingPatient(p)}
                        className="rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-brick-600 shadow-sm hover:border-brick-400 hover:bg-brick-50"
                      >
                        End
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {roster.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-xs text-ink-400">
                    No active patients matching your filter. Use "Add Patient" or "Issue Invite Code" to link patients.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ISSUE INVITE CODE MODAL */}
      <Modal open={isInviteOpen} onClose={() => setIsInviteOpen(false)} title="Issue Patient Invite Code">
        {generatedInvite ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-800">Invite Code</p>
              <p className="mt-2 font-mono text-3xl font-bold tracking-widest text-teal-900 select-all">
                {generatedInvite.code}
              </p>
              <p className="mt-2 text-xs text-teal-700">
                Specialty: {generatedInvite.specialty} • Valid for 14 days
              </p>
            </div>
            <p className="text-xs text-ink-500 leading-relaxed">
              Give this code to your patient. When they self-register at{" "}
              <span className="font-semibold text-ink">/register</span> or submit the code in their profile,
              an active care assignment will be automatically established between you.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(generatedInvite.code);
                  showToast("Invite code copied to clipboard", "success");
                }}
              >
                Copy Code
              </Button>
              <Button onClick={() => setIsInviteOpen(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreateInvite} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Specialty Label *</label>
              <input
                type="text"
                required
                value={inviteSpecialty}
                onChange={(e) => setInviteSpecialty(e.target.value)}
                placeholder="e.g. Cardiology, Endocrinology, Primary Care"
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">
                Patient Email Restriction <span className="text-xs font-normal text-ink-400">(optional)</span>
              </label>
              <input
                type="email"
                value={invitePatientEmail}
                onChange={(e) => setInvitePatientEmail(e.target.value)}
                placeholder="patient@example.com (leave blank for any patient)"
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsInviteOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                Generate Invite Code
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ADD PATIENT MODAL */}
      <Modal open={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add Patient to Care Roster">
        <form onSubmit={handleAddPatient} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Eleanor Vance"
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="eleanor.vance@example.com"
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 012-3456"
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Date of Birth *</label>
              <input
                type="date"
                required
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Gender *</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Care Specialty *</label>
              <input
                type="text"
                required
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="e.g. Cardiology, Primary Care"
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Initial Clinical Risk</label>
              <select
                value={riskStatus}
                onChange={(e) => setRiskStatus(e.target.value as RiskStatus)}
                className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
              >
                <option value="normal">Normal</option>
                <option value="moderate">Moderate</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink">
              Chronic Conditions (comma-separated) *
            </label>
            <input
              type="text"
              required
              value={conditionsInput}
              onChange={(e) => setConditionsInput(e.target.value)}
              placeholder="e.g. Hypertension Stage 1, Type 2 Diabetes"
              className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
            />
          </div>

          {/* Initial Baseline Readings with Heart Rate */}
          <div className="rounded-lg border border-dashed border-line bg-paper p-3">
            <p className="mb-2 text-xs font-semibold text-ink">Initial Baseline Readings (Optional)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <div>
                <label className="block text-[11px] text-ink-500">Systolic</label>
                <input
                  type="number"
                  placeholder="120"
                  value={sys}
                  onChange={(e) => setSys(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded border border-line px-2 py-1.5 text-xs text-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-500">Diastolic</label>
                <input
                  type="number"
                  placeholder="80"
                  value={dia}
                  onChange={(e) => setDia(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded border border-line px-2 py-1.5 text-xs text-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-500">Heart Rate (bpm)</label>
                <input
                  type="number"
                  placeholder="72"
                  value={hr}
                  onChange={(e) => setHr(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded border border-line px-2 py-1.5 text-xs text-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-500">Glucose (mg/dL)</label>
                <input
                  type="number"
                  placeholder="100"
                  value={glu}
                  onChange={(e) => setGlu(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded border border-line px-2 py-1.5 text-xs text-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] text-ink-500">Weight (kg)</label>
                <input
                  type="number"
                  placeholder="70"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded border border-line px-2 py-1.5 text-xs text-ink"
                />
              </div>
            </div>
          </div>

          {formError && <p className="text-sm text-brick-600">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Add Patient with Care Assignment
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT PATIENT MODAL */}
      <Modal open={!!editingPatient} onClose={() => setEditingPatient(null)} title={`Edit Patient: ${editingPatient?.name}`}>
        <form onSubmit={handleEditPatient} className="space-y-4">
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
            <Button type="button" variant="secondary" onClick={() => setEditingPatient(null)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Save Profile Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* END CARE ASSIGNMENT MODAL */}
      <Modal open={!!deletingPatient} onClose={() => setDeletingPatient(null)} title="End Care Assignment">
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Are you sure you want to end your active care assignment for{" "}
            <span className="font-semibold text-ink">{deletingPatient?.name}</span>?
          </p>
          <p className="text-xs text-ink-400">
            This closes your active supervision and locks messaging for this assignment. The patient’s account,
            historical telemetry, and care assignments with other physicians remain unaffected.
          </p>
          <div className="flex justify-end gap-2 pt-3">
            <Button variant="secondary" onClick={() => setDeletingPatient(null)}>
              Cancel
            </Button>
            <Button variant="danger" isLoading={isSubmitting} onClick={handleDeletePatient}>
              End Care Assignment
            </Button>
          </div>
        </div>
      </Modal>

      {/* CREDENTIALS MODAL */}
      <Modal open={!!credentials} onClose={() => setCredentials(null)} title="Patient Login Credentials">
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Account created for <span className="font-semibold">{credentials?.name}</span>. Provide these login details
            to the patient so they can sign in:
          </p>
          <div className="rounded-lg border border-line bg-paper p-4 font-mono text-xs space-y-2">
            <p>
              <span className="text-ink-400 select-none">Email: </span>
              <span className="font-semibold text-ink select-all">{credentials?.email}</span>
            </p>
            <p>
              <span className="text-ink-400 select-none">Temporary Password: </span>
              <span className="font-semibold text-ink select-all">{credentials?.password}</span>
            </p>
          </div>
          <p className="text-xs text-brick-600">
            ⚠️ This password is shown only once. Please copy or share it before closing this window.
          </p>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setCredentials(null)}>Done</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ label, value, tone = "normal" }: { label: string; value: number; tone?: "normal" | "critical" | "moderate" }) {
  return (
    <Card className="flex flex-col justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-ink-400">{label}</span>
      <p
        className={cx(
          "mt-2 font-mono text-3xl font-bold tracking-tight",
          tone === "critical" && value > 0 ? "text-brick-600" : tone === "moderate" && value > 0 ? "text-amber-600" : "text-ink"
        )}
      >
        {value}
      </p>
    </Card>
  );
}
