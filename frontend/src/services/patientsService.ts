// Backend contract:
//   GET    /patients/:id/profile         -> PatientProfile
//   PATCH  /patients/:id/profile         { partial fields } -> PatientProfile
//   GET    /doctor/overview              -> DoctorOverview
//   GET    /doctor/patients/:id          -> PatientDetail
//   GET    /doctor/patients?search=&filter=critical|needs_review -> PatientRosterRow[]
//   POST   /doctor/patients              { ...CreatePatientPayload } -> PatientRosterRow
//   PATCH  /doctor/patients/:id          { ...UpdatePatientPayload } -> PatientProfile
//   DELETE /doctor/patients/:id          -> 204

import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import {
  CreatePatientPayload,
  DoctorOverview,
  PatientDetail,
  PatientProfile,
  PatientRosterRow,
  UpdatePatientPayload,
} from "@/types";
import {
  createPatientMock,
  deletePatientMock,
  generateVitalsHistory,
  getAlertsForPatient,
  getPatientProfileById,
  getRoster,
  mockAlerts,
  mockPatientProfile,
  updatePatientMock,
} from "./mockData";

export const patientsService = {
  async getProfile(patientId: string): Promise<PatientProfile> {
    if (USE_MOCKS) return mockDelay(getPatientProfileById(patientId));
    return apiClient.get<PatientProfile>(`/patients/${patientId}/profile`);
  },

  async updateProfile(patientId: string, updates: Partial<PatientProfile>): Promise<PatientProfile> {
    if (USE_MOCKS) return mockDelay({ ...mockPatientProfile, ...updates });
    return apiClient.patch<PatientProfile>(`/patients/${patientId}/profile`, updates);
  },

  async getDoctorOverview(doctorId?: string): Promise<DoctorOverview> {
    if (USE_MOCKS) {
      const roster = getRoster(doctorId);
      const patientIds = new Set(roster.map((r) => r.id));
      const alertsForDoctor = mockAlerts.filter((a) => patientIds.has(a.patientId));
      return mockDelay({
        totalPatients: roster.length,
        criticalAlertsPending: alertsForDoctor.filter((a) => a.severity === "critical" && a.status === "unread").length,
        missingReadings48h: roster.length > 0 ? 1 : 0,
        urgentAlerts: alertsForDoctor.filter((a) => a.status === "unread"),
        roster,
      });
    }
    const query = doctorId ? `?doctorId=${encodeURIComponent(doctorId)}` : "";
    return apiClient.get<DoctorOverview>(`/doctor/overview${query}`);
  },

  async getRoster(
    search = "",
    filter: "all" | "critical" | "needs_review" = "all",
    doctorId?: string
  ): Promise<PatientRosterRow[]> {
    if (USE_MOCKS) {
      let roster = getRoster(doctorId);
      if (filter === "critical") roster = roster.filter((r) => r.riskStatus === "critical");
      if (filter === "needs_review") roster = roster.filter((r) => r.riskStatus !== "normal");
      if (search) roster = roster.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
      return mockDelay(roster);
    }
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filter !== "all") params.set("filter", filter);
    if (doctorId) params.set("doctorId", doctorId);
    return apiClient.get<PatientRosterRow[]>(`/doctor/patients?${params.toString()}`);
  },

  async getPatientDetail(patientId: string): Promise<PatientDetail> {
    if (USE_MOCKS) {
      const profile = getPatientProfileById(patientId);
      const roster = getRoster().find((r) => r.id === patientId);
      const vitalsLog = generateVitalsHistory(patientId, 30).reverse();
      return mockDelay({
        profile,
        riskStatus: roster?.riskStatus ?? "normal",
        aiClinicalInsight: {
          generatedAt: vitalsLog[0]?.recordedAt ?? new Date().toISOString(),
          narrative:
            "Over the past 30 days, systolic pressure has risen gradually from a baseline near 138 mmHg to 148 mmHg, with three readings above the configured threshold in the last week. Glucose remains within the expected fasting range. No anomalies detected in sleep or weight.",
        },
        alertHistory: getAlertsForPatient(patientId),
        vitalsLog,
      });
    }
    return apiClient.get<PatientDetail>(`/doctor/patients/${patientId}`);
  },

  async createPatient(payload: CreatePatientPayload, doctorId?: string): Promise<PatientRosterRow> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 300);
      return createPatientMock(payload, doctorId);
    }
    return apiClient.post<PatientRosterRow>("/doctor/patients", { ...payload, doctorId });
  },

  async updatePatient(patientId: string, updates: UpdatePatientPayload): Promise<PatientProfile> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 300);
      return updatePatientMock(patientId, updates);
    }
    return apiClient.patch<PatientProfile>(`/doctor/patients/${patientId}`, updates);
  },

  async deletePatient(patientId: string): Promise<void> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 250);
      deletePatientMock(patientId);
      return;
    }
    return apiClient.delete<void>(`/doctor/patients/${patientId}`);
  },

  async getDoctorProfile(): Promise<Doctor> {
    if (USE_MOCKS) {
      const { getDoctorById } = await import("./mockData");
      return mockDelay(getDoctorById());
    }
    return apiClient.get<Doctor>("/auth/me");
  },

  async updateDoctorProfile(updates: { name?: string; clinicName?: string; phone?: string }): Promise<Doctor> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 300);
      const { mockDoctor } = await import("./mockData");
      Object.assign(mockDoctor, updates);
      return { ...mockDoctor };
    }
    return apiClient.patch<Doctor>("/doctor/profile", updates);
  },
};
