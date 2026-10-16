// frontend/src/services/apiClient.ts   (replaces current)
// ---------------------------------------------------------------------------
// Thin fetch wrapper. Every service goes through `apiClient`.
//
// Auth: sends `Authorization: Bearer <access token>`. Supabase access tokens last about an hour,
// so on a 401 it silently exchanges the refresh token (POST /auth/refresh) ONCE and retries the
// original request. If that fails, it ends the session and fires SESSION_EXPIRED_EVENT so the
// AuthContext can send the user back to the login page.
// ---------------------------------------------------------------------------

import { REFRESH_TOKEN_STORAGE_KEY, TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "@/lib/constants";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

export const SESSION_EXPIRED_EVENT = "healthlens:session-expired";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

// A 401 from these is a real answer (wrong password, expired refresh token), not a stale access token.
const NO_REFRESH_PATHS = ["/auth/login", "/auth/register", "/auth/register-doctor", "/auth/refresh"];

function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
}

async function doRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    // Supabase rotates refresh tokens: the old one is now dead, so always store the new one.
    if (data.refreshToken) localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

// Single flight: if several requests 401 at once, they share ONE refresh. Rotating tokens would
// otherwise make the second refresh attempt fail and log the user out.
let refreshInFlight: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function endSession() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(USER_STORAGE_KEY);
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let res = await send(path, options, getToken());

  if (res.status === 401 && !NO_REFRESH_PATHS.some((p) => path.startsWith(p))) {
    if (await refreshSession()) {
      res = await send(path, options, getToken());
    } else {
      endSession();
    }
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // response had no JSON body, keep the generic message
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};

/** Small helper mock services use to simulate realistic network latency. */
export function mockDelay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}