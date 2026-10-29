// frontend/src/context/AuthContext.tsx
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "@/services/authService";
import { SESSION_EXPIRED_EVENT } from "@/services/apiClient";
import { AuthResponse, AuthUser, DoctorRegisterPayload, PatientRegisterPayload, LoginPayload } from "@/types";
import { REFRESH_TOKEN_STORAGE_KEY, TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "@/lib/constants";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  registerDoctor: (payload: DoctorRegisterPayload) => Promise<AuthUser>;
  registerPatient: (payload: PatientRegisterPayload) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function saveSession(res: AuthResponse) {
  localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
  if (res.refreshToken) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, res.refreshToken);
  else localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

function clearSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored && token) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        clearSession();
      }
    } else if (stored || token) {
      clearSession();
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = async (payload: LoginPayload) => {
    const res = await authService.login(payload);
    saveSession(res);
    setUser(res.user);
    return res.user;
  };

  const registerDoctor = async (payload: DoctorRegisterPayload) => {
    const res = await authService.registerDoctor(payload);
    saveSession(res);
    setUser(res.user);
    return res.user;
  };

  const registerPatient = async (payload: PatientRegisterPayload) => {
    const res = await authService.registerPatient(payload);
    saveSession(res);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    authService.logout().catch(() => {});
    clearSession();
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, isLoading, login, registerDoctor, registerPatient, logout }),
    [user, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
