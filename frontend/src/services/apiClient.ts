// ---------------------------------------------------------------------------
// Thin fetch wrapper. This is the ONLY file that needs to know how requests
// are made — every service module calls through `apiClient`, so once the
// backend is live, swapping VITE_USE_MOCKS to "false" in .env is enough to
// point the whole app at real endpoints. No component ever calls fetch()
// directly.
//
// Expected backend contract:
//   - Base URL comes from VITE_API_BASE_URL (e.g. http://localhost:4000/api)
//   - Auth: send `Authorization: Bearer <token>` on every request after login
//   - Errors: return a JSON body `{ message: string }` with a 4xx/5xx status
// ---------------------------------------------------------------------------

import { TOKEN_STORAGE_KEY } from "@/lib/constants";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== "false";

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

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();

  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // response had no JSON body — keep the generic message
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
