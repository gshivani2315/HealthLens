import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "@/services/authService";
import { AuthUser, LoginPayload } from "@/types";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "@/lib/constants";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (payload: LoginPayload) => {
    const res = await authService.login(payload);
    localStorage.setItem(TOKEN_STORAGE_KEY, res.token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    authService.logout().catch(() => {});
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  };

  const value = useMemo(() => ({ user, isLoading, login, logout }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
