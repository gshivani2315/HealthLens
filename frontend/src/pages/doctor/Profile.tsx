import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { patientsService } from "@/services/patientsService";
import { Doctor } from "@/types";
import Card, { CardHeader } from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";

export default function DoctorProfile() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    clinicName: "",
    phone: "",
  });

  useEffect(() => {
    patientsService
      .getDoctorProfile()
      .then((data) => {
        setProfile(data);
        setFormData({
          name: data.name || user?.name || "",
          clinicName: data.clinicName || "",
          phone: data.phone || "",
        });
      })
      .catch((err) => {
        showToast(err.message || "Failed to load profile", "error");
      })
      .finally(() => setLoading(false));
  }, [user, showToast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await patientsService.updateDoctorProfile({
        name: formData.name,
        clinicName: formData.clinicName,
        phone: formData.phone,
      });
      setProfile((prev) => (prev ? { ...prev, ...updated } : updated));
      setIsEditing(false);
      showToast("Profile updated successfully", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update profile", "error");
    } finally {
      setIsSaving(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Physician Profile</h1>
          <p className="text-sm text-ink-400">View and manage your clinical provider credentials</p>
        </div>
        {!isEditing && (
          <Button variant="secondary" onClick={() => setIsEditing(true)}>
            Edit details
          </Button>
        )}
      </div>

      <Card>
        <CardHeader title="Clinical Credentials" subtitle="Information visible to assigned patients and team" />
        {isEditing ? (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-400">Full Name</label>
              <input
                type="text"
                required
                className="mt-1 w-full input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-400">Clinic / Practice Name</label>
              <input
                type="text"
                required
                className="mt-1 w-full input"
                value={formData.clinicName}
                onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-400">Office Phone</label>
              <input
                type="text"
                className="mt-1 w-full input"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setFormData({
                    name: profile.name,
                    clinicName: profile.clinicName,
                    phone: profile.phone || "",
                  });
                  setIsEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Info label="Full Name" value={profile.name} />
            <Info label="Email Address" value={profile.email} />
            <Info label="Clinic / Practice" value={profile.clinicName || "Not configured"} />
            <Info label="Phone" value={profile.phone || "Not configured"} />
            <Info label="Role" value="Attending Physician" />
            <Info label="Provider ID" value={profile.id} />
          </dl>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}

