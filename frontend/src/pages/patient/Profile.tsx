import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { patientsService } from "@/services/patientsService";
import { PatientProfile } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { formatDate } from "@/lib/utils";

export default function Profile() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Invite code linking state
  const [inviteCode, setInviteCode] = useState("");
  const [linking, setLinking] = useState(false);

  function loadProfile() {
    if (!user) return;
    patientsService.getProfile(user.id).then(setProfile).finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProfile();
  }, [user]);

  async function handleLinkInvite(e: FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setLinking(true);
    try {
      await patientsService.acceptCareInvite(inviteCode.trim().toUpperCase());
      showToast("Successfully connected to your doctor!", "success");
      setInviteCode("");
      loadProfile();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to link invite code", "error");
    } finally {
      setLinking(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">My Profile</h1>

      <Card>
        <CardHeader title="Personal information" />
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Info label="Name" value={profile.name} />
          <Info label="Gender" value={profile.gender} />
          <Info label="Date of birth" value={formatDate(profile.dateOfBirth)} />
          <Info label="Age" value={String(profile.age)} />
          <Info label="Phone" value={profile.phone || "Not set"} />
          <Info label="Email" value={profile.email} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="Medical profile" subtitle="Diagnosed chronic conditions" />
        <div className="flex flex-wrap gap-2">
          {profile.conditions.map((c) => (
            <Badge key={c.id} tone="moderate">
              {c.label}
            </Badge>
          ))}
          {profile.conditions.length === 0 && <p className="text-sm text-ink-400">No conditions on file.</p>}
        </div>
      </Card>

      {/* Primary & Active Care Team Physicians */}
      <Card>
        <CardHeader
          title="Care Team (Active Doctors)"
          subtitle="Your physicians with active clinical care assignments"
        />
        <div className="space-y-3 mt-1">
          {profile.careTeam && profile.careTeam.length > 0 ? (
            profile.careTeam.map((ca: any) => (
              <div
                key={ca.assignmentId}
                className="flex items-center justify-between rounded-xl border border-line bg-paper p-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
                    {ca.doctorName.split(" ").map((p: string) => p[0]).slice(-2).join("")}
                  </div>
                  <div>
                    <p className="font-semibold text-ink">{ca.doctorName}</p>
                    <p className="text-xs text-ink-500">{ca.specialty} • {ca.clinicName}</p>
                  </div>
                </div>
                {ca.assignedAt && (
                  <span className="text-[11px] text-ink-400">Since {formatDate(ca.assignedAt)}</span>
                )}
              </div>
            ))
          ) : profile.doctor && profile.doctor.id !== "unassigned" ? (
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600">
                {profile.doctor.name.split(" ").map((p) => p[0]).slice(-2).join("")}
              </div>
              <div className="text-sm">
                <p className="font-medium text-ink">{profile.doctor.name}</p>
                <p className="text-ink-400">{profile.doctor.clinicName}</p>
                {profile.doctor.assignedDate && (
                  <p className="text-xs text-ink-300">Assigned {formatDate(profile.doctor.assignedDate)}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-400">No doctors currently linked to your profile.</p>
          )}
        </div>
      </Card>

      {/* Link New Doctor with Invite Code */}
      <Card>
        <CardHeader
          title="Connect to a Doctor"
          subtitle="Enter a doctor-issued invite code to establish a care assignment"
        />
        <form onSubmit={handleLinkInvite} className="mt-3 flex gap-2">
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="e.g. HL-8F2A-9C4B"
            className="flex-1 rounded-xl border border-line px-3.5 py-2 font-mono text-sm tracking-wider uppercase text-ink focus:border-teal-400 focus:outline-none"
          />
          <Button type="submit" isLoading={linking} disabled={!inviteCode.trim()}>
            Connect
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
