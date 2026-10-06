// Backend contract:
//   POST /auth/login        { email, password }        -> { token, user }
//   POST /auth/logout       -                            -> 204
//   GET  /auth/me           (bearer token)                -> { user }

import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { AuthResponse, AuthUser, LoginPayload } from "@/types";

const mockUsers: Record<string, { user: AuthUser; password: string }> = {
  "patient@healthlens.demo": {
    password: "demo1234",
    user: { id: "pat_001", role: "patient", name: "Marcus Bell", email: "patient@healthlens.demo" },
  },
  "doctor@healthlens.demo": {
    password: "demo1234",
    user: { id: "doc_001", role: "doctor", name: "Dr. Elena Ruiz", email: "doctor@healthlens.demo" },
  },
};

export const authService = {
  async login(payload: LoginPayload): Promise<AuthResponse> {
    if (USE_MOCKS) {
      const match = mockUsers[payload.email.toLowerCase()];
      await mockDelay(undefined, 400);
      if (!match || match.password !== payload.password) {
        throw new Error("Invalid email or password");
      }
      return { token: `mock-token-${match.user.id}`, user: match.user };
    }
    return apiClient.post<AuthResponse>("/auth/login", payload);
  },

  async logout(): Promise<void> {
    if (USE_MOCKS) return mockDelay(undefined, 150);
    return apiClient.post<void>("/auth/logout");
  },
};
