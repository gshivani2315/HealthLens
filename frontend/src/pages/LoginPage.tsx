import { FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import Button from "@/components/ui/Button";
import { cx } from "@/lib/utils";

export default function LoginPage({ defaultMode }: { defaultMode?: "login" | "register" }) {
  const { user, login, registerDoctor } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const initialMode = defaultMode ?? (location.pathname === "/register" ? "register" : "login");
  const [mode, setMode] = useState<"login" | "register">(initialMode);

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

  async function handleRegisterSubmit(e: FormEvent) {
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
      const loggedIn = await registerDoctor({
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
          <span className="font-display text-xl font-semibold text-white">HealthLens</span>
        </div>

        <div className="rounded-xl border border-ink-500 bg-white p-6 shadow-2xl sm:p-7">
          {/* Mode Switcher */}
          <div className="mb-5 flex rounded-lg border border-line bg-paper p-1">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              className={cx(
                "flex-1 rounded-md py-2 text-xs font-semibold transition-all",
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
                "flex-1 rounded-md py-2 text-xs font-semibold transition-all",
                mode === "register" ? "bg-white text-ink shadow-sm" : "text-ink-400 hover:text-ink"
              )}
            >
              Doctor Registration
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLoginSubmit}>
              <h1 className="mb-1 font-display text-lg font-semibold text-ink">Sign in to your account</h1>
              <p className="mb-5 text-sm text-ink-400">Track vitals, review trends, and stay ahead of risk.</p>

              <label className="mb-1 block text-sm font-medium text-ink">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-4 w-full rounded border border-line px-3 py-2.5 text-sm text-ink focus:border-teal-400 focus:outline-none"
                placeholder="you@example.com"
              />

              <label className="mb-1 block text-sm font-medium text-ink">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mb-2 w-full rounded border border-line px-3 py-2.5 text-sm text-ink focus:border-teal-400 focus:outline-none"
                placeholder="••••••••"
              />

              {error && <p className="mb-3 text-sm text-brick-600">{error}</p>}

              <Button type="submit" isLoading={isLoading} className="mt-3 w-full" size="lg">
                Sign in
              </Button>

              <div className="mt-5 rounded border border-dashed border-line bg-paper p-3 text-xs text-ink-500">
                <p className="mb-2 font-medium text-ink">Demo accounts (mock mode)</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemo("patient")}
                    className="rounded border border-line bg-white px-2 py-1 hover:border-teal-400"
                  >
                    Use patient login
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemo("doctor")}
                    className="rounded border border-line bg-white px-2 py-1 hover:border-teal-400"
                  >
                    Use doctor login
                  </button>
                </div>
              </div>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                  className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
                >
                  New physician or clinic? Register as a Doctor →
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit}>
              <h1 className="mb-1 font-display text-lg font-semibold text-ink">Doctor Registration</h1>
              <p className="mb-5 text-sm text-ink-400">
                Register a new physician account to monitor and manage patients.
              </p>

              <div className="space-y-3.5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                    placeholder="e.g. Dr. Sarah Jenkins"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-ink">Clinic or Practice Name *</label>
                  <input
                    type="text"
                    required
                    value={docClinic}
                    onChange={(e) => setDocClinic(e.target.value)}
                    className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                    placeholder="e.g. Pacific Cardiology & Family Health"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Professional Email *</label>
                    <input
                      type="email"
                      required
                      value={docEmail}
                      onChange={(e) => setDocEmail(e.target.value)}
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      placeholder="physician@clinic.com"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Clinic Phone</label>
                    <input
                      type="tel"
                      value={docPhone}
                      onChange={(e) => setDocPhone(e.target.value)}
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Password *</label>
                    <input
                      type="password"
                      required
                      value={docPassword}
                      onChange={(e) => setDocPassword(e.target.value)}
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-ink">Confirm Password *</label>
                    <input
                      type="password"
                      required
                      value={docConfirmPassword}
                      onChange={(e) => setDocConfirmPassword(e.target.value)}
                      className="w-full rounded border border-line px-3 py-2 text-sm text-ink focus:border-teal-400 focus:outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              {error && <p className="mt-3 text-sm text-brick-600">{error}</p>}

              <Button type="submit" isLoading={isLoading} className="mt-5 w-full" size="lg">
                Complete Doctor Registration
              </Button>

              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="text-xs font-medium text-ink-500 hover:text-ink hover:underline"
                >
                  Already have an account? Sign in →
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
