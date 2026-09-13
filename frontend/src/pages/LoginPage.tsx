import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Button from "@/components/ui/Button";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (user) {
    return <Navigate to={user.role === "doctor" ? "/doctor/dashboard" : "/patient/dashboard"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
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

  function fillDemo(role: "patient" | "doctor") {
    setEmail(role === "patient" ? "patient@healthlens.demo" : "doctor@healthlens.demo");
    setPassword("demo1234");
    setError(null);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-600 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-teal-500">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M2 12h4l2-7 4 14 2-9 2 5h6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-display text-xl font-semibold text-white">HealthLens</span>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-ink-500 bg-white p-6 shadow-xl">
          <h1 className="mb-1 font-display text-lg font-semibold text-ink">Sign in</h1>
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
              <button type="button" onClick={() => fillDemo("patient")} className="rounded border border-line bg-white px-2 py-1 hover:border-teal-400">
                Use patient login
              </button>
              <button type="button" onClick={() => fillDemo("doctor")} className="rounded border border-line bg-white px-2 py-1 hover:border-teal-400">
                Use doctor login
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
