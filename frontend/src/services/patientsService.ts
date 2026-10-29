// frontend/src/services/patientsService.ts
import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import {
  Clinic,
  CareInvite,
  CreatePatientPayload,
  CreatePatientResult,
  Doctor,
  DoctorOverview,
  PatientDetail,
  PatientProfile,
  PatientRosterRow,
  UpdatePatientPayload,
  WeeklySummary,
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

  async createPatient(payload: CreatePatientPayload, doctorId?: string): Promise<CreatePatientResult> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 300);
      return createPatientMock(payload, doctorId);
    }
    return apiClient.post<CreatePatientResult>("/doctor/patients", { ...payload, doctorId });
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

  // ── Clinics & Memberships ──
  async getClinics(): Promise<Clinic[]> {
    if (USE_MOCKS) {
      return mockDelay([
        {
          id: "clinic_001",
          name: "Meridian Family Health",
          phone: "+1 (555) 019-2231",
          address: "1200 Healthcare Blvd, Suite 400",
          role: "PHYSICIAN",
          activePatientsCount: 6,
          staffCount: 3,
        },
      ]);
    }
    return apiClient.get<Clinic[]>("/doctor/clinics");
  },

  async createClinic(payload: { name: string; phone?: string; address?: string }): Promise<Clinic> {
    if (USE_MOCKS) {
      return mockDelay({
        id: `clinic_${Date.now()}`,
        name: payload.name,
        phone: payload.phone,
        address: payload.address,
        role: "PHYSICIAN",
        activePatientsCount: 0,
        staffCount: 1,
      });
    }
    return apiClient.post<Clinic>("/doctor/clinics", payload);
  },

  // ── Invites (Patient Self-registration linking) ──
  async getDoctorInvites(): Promise<CareInvite[]> {
    if (USE_MOCKS) {
      return mockDelay([
        {
          id: "inv_1",
          code: "HL-DEMO-2026",
          doctorId: "doc_001",
          doctorName: "Dr. Elena Ruiz",
          specialty: "Primary Care",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    return apiClient.get<CareInvite[]>("/invites");
  },

  async createCareInvite(payload: {
    clinicId?: string;
    specialty?: string;
    patientEmail?: string;
    daysValid?: number;
  }): Promise<CareInvite> {
    if (USE_MOCKS) {
      const code = `HL-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      return mockDelay({
        id: `inv_${Date.now()}`,
        code,
        doctorId: "doc_001",
        doctorName: "Dr. Elena Ruiz",
        specialty: payload.specialty || "Primary Care",
        patientEmail: payload.patientEmail,
        status: "PENDING",
        expiresAt: new Date(Date.now() + (payload.daysValid || 14) * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
    return apiClient.post<CareInvite>("/invites", payload);
  },

  async acceptCareInvite(code: string): Promise<any> {
    if (USE_MOCKS) {
      return mockDelay({ success: true, message: "Connected to doctor" });
    }
    return apiClient.post<any>("/invites/accept", { code });
  },

  // ── Manual Weekly Summary Trigger ──
  async generateWeeklySummary(patientId: string): Promise<WeeklySummary> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 800);
      return {
        id: `sum_${Date.now()}`,
        patientId,
        weekStart: new Date().toISOString(),
        weekEnd: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        narrative: "Manual summary generated. Patient vitals tracking within targets.",
        takeaways: ["Readings steady", "Manual clinical assessment completed"],
      };
    }
    return apiClient.post<WeeklySummary>(`/doctor/patients/${patientId}/generate-summary`);
  },
};
