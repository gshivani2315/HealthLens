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
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        roster = roster.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q) ||
            (r.email && r.email.toLowerCase().includes(q)) ||
            (r.phone && r.phone.toLowerCase().includes(q)) ||
            (r.primaryCondition && r.primaryCondition.toLowerCase().includes(q)) ||
            (r.conditions && r.conditions.some((c) => c.label.toLowerCase().includes(q)))
        );
      }
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

  // Clinics APIs
  async getClinics(): Promise<Clinic[]> {
    if (USE_MOCKS) {
      return mockDelay([
        {
          id: "clinic_001",
          name: "Meridian Family Health",
          phone: "+1 (555) 019-2231",
          address: "100 Medical Center Way, Suite 400",
          activePatientsCount: 6,
          staffCount: 3,
        },
      ]);
    }
    return apiClient.get<Clinic[]>("/doctor/clinics");
  },

  async createClinic(data: { name: string; phone?: string; address?: string }): Promise<Clinic> {
    if (USE_MOCKS) {
      return mockDelay({
        id: `clinic_${Date.now()}`,
        name: data.name,
        phone: data.phone,
        address: data.address,
        activePatientsCount: 0,
        staffCount: 1,
      });
    }
    return apiClient.post<Clinic>("/doctor/clinics", data);
  },

  // Care Invites APIs
  async createCareInvite(data: { specialty?: string; patientEmail?: string; daysValid?: number }): Promise<CareInvite> {
    if (USE_MOCKS) {
      return mockDelay({
        id: `inv_${Date.now()}`,
        code: `HL-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        doctorId: "doc_001",
        clinicId: "clinic_001",
        specialty: data.specialty || "Primary Care",
        patientEmail: data.patientEmail,
        status: "PENDING",
        expiresAt: new Date(Date.now() + (data.daysValid || 14) * 86400000).toISOString(),
        createdAt: new Date().toISOString(),
      });
    }
    return apiClient.post<CareInvite>("/invites", data);
  },

  async acceptCareInvite(code: string): Promise<{ message: string; assignmentId: string }> {
    if (USE_MOCKS) {
      return mockDelay({
        message: "Care invite accepted successfully",
        assignmentId: `ca_${Date.now()}`,
      });
    }
    return apiClient.post<{ message: string; assignmentId: string }>("/invites/accept", { code });
  },

  async getDoctorInvites(): Promise<CareInvite[]> {
    if (USE_MOCKS) {
      return mockDelay([]);
    }
    return apiClient.get<CareInvite[]>("/invites");
  },

  // Manual trigger for on-demand weekly summary generation
  async triggerPatientSummary(patientId: string): Promise<WeeklySummary> {
    if (USE_MOCKS) {
      await mockDelay(undefined, 800);
      return {
        id: `sum_${Date.now()}`,
        patientId,
        weekStart: new Date(Date.now() - 7 * 86400000).toISOString(),
        weekEnd: new Date().toISOString(),
        generatedAt: new Date().toISOString(),
        narrative:
          "Manual weekly summary generated on demand. Vitals over the selected period show consistent morning logging with systolic readings remaining well-controlled. Glucose stability remains optimal.",
        takeaways: [
          "Good adherence to daily logging schedule.",
          "Continue monitoring morning blood pressure before meals.",
        ],
      };
    }
    return apiClient.post<WeeklySummary>(`/doctor/patients/${patientId}/generate-summary`);
  },
};
