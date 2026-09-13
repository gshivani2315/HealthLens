// Backend contract:
//   GET   /patients/:id/profile         -> PatientProfile
//   PATCH /patients/:id/profile         { partial fields } -> PatientProfile
//   GET   /doctor/overview              -> DoctorOverview
//   GET   /doctor/patients/:id          -> PatientDetail
//   GET   /doctor/patients?search=&filter=critical|needs_review -> PatientRosterRow[]

import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { DoctorOverview, PatientDetail, PatientProfile, PatientRosterRow } from "@/types";
import {
  generateVitalsHistory,
  getAlertsForPatient,
  getPatientProfileById,
  getRoster,
  mockAlerts,
  mockPatientProfile,
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

  async getDoctorOverview(): Promise<DoctorOverview> {
    if (USE_MOCKS) {
      const roster = getRoster();
      return mockDelay({
        totalPatients: roster.length,
        criticalAlertsPending: mockAlerts.filter((a) => a.severity === "critical" && a.status === "unread").length,
        missingReadings48h: 1,
        urgentAlerts: mockAlerts.filter((a) => a.status === "unread"),
        roster,
      });
    }
    return apiClient.get<DoctorOverview>("/doctor/overview");
  },

  async getRoster(search = "", filter: "all" | "critical" | "needs_review" = "all"): Promise<PatientRosterRow[]> {
    if (USE_MOCKS) {
      let roster = getRoster();
      if (filter === "critical") roster = roster.filter((r) => r.riskStatus === "critical");
      if (filter === "needs_review") roster = roster.filter((r) => r.riskStatus !== "normal");
      if (search) roster = roster.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
      return mockDelay(roster);
    }
    return apiClient.get<PatientRosterRow[]>(`/doctor/patients?search=${encodeURIComponent(search)}&filter=${filter}`);
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
};
