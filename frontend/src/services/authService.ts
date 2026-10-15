// Backend contract:
//   POST /auth/login        { email, password }        -> { token, user }
//   POST /auth/logout       -                            -> 204
//   GET  /auth/me           (bearer token)                -> { user }

import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { AuthResponse, AuthUser, DoctorRegisterPayload, LoginPayload } from "@/types";
import { registerDoctorMock } from "./mockData";

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

  async registerDoctor(payload: DoctorRegisterPayload): Promise<AuthResponse> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 400);
      const emailLower = payload.email.toLowerCase();
      if (mockUsers[emailLower]) {
        throw new Error("An account with this email already exists");
      }
      const newDoctorId = `doc_${Date.now()}`;
      const newUser: AuthUser = {
        id: newDoctorId,
        role: "doctor",
        name: payload.name,
        email: payload.email,
      };
      mockUsers[emailLower] = {
        password: payload.password,
        user: newUser,
      };
      registerDoctorMock({
        id: newDoctorId,
        name: payload.name,
        clinicName: payload.clinicName,
        phone: payload.phone,
        email: payload.email,
        assignedDate: new Date().toISOString().slice(0, 10),
      });
      return { token: `mock-token-${newDoctorId}`, user: newUser };
    }
    return apiClient.post<AuthResponse>("/auth/register-doctor", payload);
  },

  async logout(): Promise<void> {
    if (USE_MOCKS) return mockDelay(undefined, 150);
    return apiClient.post<void>("/auth/logout");
  },

  async updatePassword(payload: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 300);
      return { message: "Password updated successfully" };
    }
    return apiClient.patch<{ message: string }>("/auth/password", payload);
  },
};
