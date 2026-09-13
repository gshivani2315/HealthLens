import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { patientsService } from "@/services/patientsService";
import { PatientProfile } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";

export default function Profile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    patientsService.getProfile(user.id).then(setProfile).finally(() => setLoading(false));
  }, [user]);

  if (loading || !profile) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-display text-xl font-semibold text-ink">Profile &amp; settings</h1>

      <Card>
        <CardHeader title="Personal information" />
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Info label="Name" value={profile.name} />
          <Info label="Gender" value={profile.gender} />
          <Info label="Date of birth" value={formatDate(profile.dateOfBirth)} />
          <Info label="Age" value={String(profile.age)} />
          <Info label="Phone" value={profile.phone} />
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

      <Card>
        <CardHeader title="Assigned doctor" />
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
