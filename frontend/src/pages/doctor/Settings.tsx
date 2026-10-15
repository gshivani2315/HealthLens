import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authService } from "@/services/authService";
import Card, { CardHeader } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useToast } from "@/context/ToastContext";

export default function DoctorSettings() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast("New password must be at least 6 characters", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match", "error");
      return;
    }

    setLoading(true);
    try {
      await authService.updatePassword({ currentPassword, newPassword });
      showToast("Password updated successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      showToast(err.message || "Failed to update password", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">Account Settings</h1>
        <p className="text-sm text-ink-400">Manage your clinical account security and credentials</p>
      </div>

      <Card>
        <CardHeader title="Account Security" subtitle="Update your account login password" />
        <form onSubmit={handlePasswordChange} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-ink-400">
              Current Password
            </label>
            <input
              type="password"
              required
              className="mt-1 w-full input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-ink-400">
              New Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              className="mt-1 w-full input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-ink-400">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              className="mt-1 w-full input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Account Information" subtitle="Registered user identity" />
        <div className="space-y-2 text-sm">
          <p className="text-ink">
            <span className="font-medium text-ink-400">Email:</span> {user?.email}
          </p>
          <p className="text-ink">
            <span className="font-medium text-ink-400">Role:</span> Clinical Provider (Doctor)
          </p>
        </div>
      </Card>
    </div>
  );
}

