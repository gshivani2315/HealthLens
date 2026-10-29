// frontend/src/pages/LoginPage.tsx
import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import Button from "@/components/ui/Button";
import { cx } from "@/lib/utils";

export default function LoginPage({ defaultMode }: { defaultMode?: "login" | "register" }) {
  const { user, login, registerDoctor, registerPatient } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const initialMode = defaultMode ?? (location.pathname === "/register" ? "register" : "login");
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [registerRole, setRegisterRole] = useState<"patient" | "doctor">("patient");

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Doctor register form state
  const [docName, setDocName] = useState("");
  const [docEmail, setDocEmail] = useState("");
  const [docClinic, setDocClinic] = useState("");
  const [docPhone, setDocPhone] = useState("");
  const [docPassword, setDocPassword] = useState("");
  const [docConfirmPassword, setDocConfirmPassword] = useState("");

  // Patient register form state
  const [patName, setPatName] = useState("");
  const [patEmail, setPatEmail] = useState("");
  const [patPhone, setPatPhone] = useState("");
  const [patDob, setPatDob] = useState("");
  const [patGender, setPatGender] = useState("Male");
  const [patInviteCode, setPatInviteCode] = useState("");
  const [patPassword, setPatPassword] = useState("");
  const [patConfirmPassword, setPatConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (user) {
    return <Navigate to={user.role === "doctor" ? "/doctor/dashboard" : "/patient/dashboard"} replace />;
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const loggedIn = await login({ email, password });
      navigate(loggedIn.role === "doctor" ? "/doctor/dashboard" : "/patient/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDoctorRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (docPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (docPassword !== docConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!docName.trim() || !docEmail.trim() || !docClinic.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsLoading(true);
    try {
      const formattedName = docName.trim().startsWith("Dr.") ? docName.trim() : `Dr. ${docName.trim()}`;
      await registerDoctor({
        name: formattedName,
        email: docEmail.trim(),
        clinicName: docClinic.trim(),
        phone: docPhone.trim() || undefined,
        password: docPassword,
      });
      showToast(`Welcome, ${formattedName}! Your account has been registered.`, "success");
      navigate("/doctor/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register doctor");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePatientRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (patPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (patPassword !== patConfirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!patName.trim() || !patEmail.trim()) {
      setError("Please fill in all required fields.");
      return;
    }

    setIsLoading(true);
    try {
      await registerPatient({
        name: patName.trim(),
        email: patEmail.trim(),
        phone: patPhone.trim() || undefined,
        dateOfBirth: patDob || undefined,
        gender: patGender,
        inviteCode: patInviteCode.trim() || undefined,
        password: patPassword,
      });
      showToast(`Welcome to HealthLens, ${patName.trim()}!`, "success");
      navigate("/patient/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register patient account");
    } finally {
      setIsLoading(false);
    }
  }

  function fillDemo(role: "patient" | "doctor") {
    setEmail(role === "patient" ? "patient@healthlens.demo" : "doctor@healthlens.demo");
    setPassword("demo1234");
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-600 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-teal-500 shadow-sm">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M2 12h4l2-7 4 14 2-9 2 5h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight text-white">HealthLens</span>
        </div>

        <div className="rounded-xl border border-line bg-white p-6 shadow-md">
          {/* Main Mode Toggle: Sign in vs Register */}
          <div className="mb-6 grid grid-cols-2 gap-1 rounded bg-ink-50 p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={cx(
                "rounded py-1.5 text-xs font-semibold transition-all",
                mode === "login" ? "bg-white text-ink shadow-sm" : "text-ink-400 hover:text-ink"
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
              }}
              className={cx(
                "rounded py-1.5 text-xs font-semibold transition-all",
                mode === "register" ? "bg-white text-ink shadow-sm" : "text-ink-400 hover:text-ink"
              )}
            >
              Self Register
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded border border-brick-200 bg-brick-50 p-3 text-xs text-brick-700">
              {error}
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-ink">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                />
              </div>

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Sign in to your account
              </Button>

              <div className="pt-2 text-center">
                <p className="text-xs text-ink-400">Quick sign-in with demo accounts:</p>
                <div className="mt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemo("patient")}
                    className="rounded bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100"
                  >
                    Demo Patient
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemo("doctor")}
                    className="rounded bg-ink-50 px-2.5 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100"
                  >
                    Demo Doctor
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div>
              {/* Role switcher for self registration */}
              <div className="mb-4 flex items-center justify-center gap-2 border-b border-line pb-3">
                <span className="text-xs text-ink-500">I am registering as:</span>
                <button
                  type="button"
                  onClick={() => {
                    setRegisterRole("patient");
                    setError(null);
                  }}
                  className={cx(
                    "rounded px-3 py-1 text-xs font-bold transition-all",
                    registerRole === "patient" ? "bg-teal-600 text-white shadow-sm" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                  )}
                >
                  Patient
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRegisterRole("doctor");
                    setError(null);
                  }}
                  className={cx(
                    "rounded px-3 py-1 text-xs font-bold transition-all",
                    registerRole === "doctor" ? "bg-teal-600 text-white shadow-sm" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
                  )}
                >
                  Physician / Clinic
                </button>
              </div>

              {registerRole === "patient" ? (
                /* Patient Self-Registration Form */
                <form onSubmit={handlePatientRegister} className="space-y-3.5">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={patName}
                      onChange={(e) => setPatName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Email *</label>
                    <input
                      type="email"
                      required
                      value={patEmail}
                      onChange={(e) => setPatEmail(e.target.value)}
                      placeholder="jane.doe@example.com"
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Phone</label>
                      <input
                        type="tel"
                        value={patPhone}
                        onChange={(e) => setPatPhone(e.target.value)}
                        placeholder="+1 (555) 012-3456"
                        className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Date of Birth</label>
                      <input
                        type="date"
                        value={patDob}
                        onChange={(e) => setPatDob(e.target.value)}
                        className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">
                      Doctor Invite Code <span className="text-[11px] font-normal text-ink-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={patInviteCode}
                      onChange={(e) => setPatInviteCode(e.target.value.toUpperCase())}
                      placeholder="e.g. HL-XXXX-XXXX"
                      className="w-full rounded border border-line px-3 py-2 text-sm font-mono text-ink uppercase tracking-wider focus:border-teal-400 focus:outline-none placeholder:normal-case placeholder:font-sans"
                    />
                    <p className="mt-0.5 text-[11px] text-ink-400">
                      If your physician gave you an invite code, enter it here to link automatically.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Password *</label>
                      <input
                        type="password"
                        required
                        value={patPassword}
                        onChange={(e) => setPatPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Confirm Password *</label>
                      <input
                        type="password"
                        required
                        value={patConfirmPassword}
                        onChange={(e) => setPatConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" isLoading={isLoading}>
                    Complete Patient Registration
                  </Button>
                </form>
              ) : (
                /* Doctor Registration Form */
                <form onSubmit={handleDoctorRegister} className="space-y-3.5">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={docName}
                      onChange={(e) => setDocName(e.target.value)}
                      placeholder="Dr. Sarah Jenkins"
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Clinic / Hospital Name *</label>
                    <input
                      type="text"
                      required
                      value={docClinic}
                      onChange={(e) => setDocClinic(e.target.value)}
                      placeholder="Pacific Family Health"
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Work Email *</label>
                    <input
                      type="email"
                      required
                      value={docEmail}
                      onChange={(e) => setDocEmail(e.target.value)}
                      placeholder="dr.jenkins@clinic.example"
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Phone</label>
                    <input
                      type="tel"
                      value={docPhone}
                      onChange={(e) => setDocPhone(e.target.value)}
                      placeholder="+1 (555) 019-8822"
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Password *</label>
                      <input
                        type="password"
                        required
                        value={docPassword}
                        onChange={(e) => setDocPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-ink">Confirm Password *</label>
                      <input
                        type="password"
                        required
                        value={docConfirmPassword}
                        onChange={(e) => setDocConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" isLoading={isLoading}>
                    Complete Doctor Registration
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
