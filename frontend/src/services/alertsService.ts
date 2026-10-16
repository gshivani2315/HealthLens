// Backend contract:
//   GET   /alerts?status=&type=              -> AlertItem[]
//   PATCH /alerts/:id   { status?, clinicalNote?, noteSharedWithPatient? } -> AlertItem
//   POST  /alerts/:id/follow-up               { note? } -> AlertItem

import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { AlertItem, AlertStatus, AlertType } from "@/types";
import { mockAlerts } from "./mockData";

let alertStore = [...mockAlerts];

export const alertsService = {
  async list(status?: AlertStatus | "all", type?: AlertType | "all"): Promise<AlertItem[]> {
    if (USE_MOCKS) {
      let results = alertStore;
      if (status && status !== "all") results = results.filter((a) => a.status === status);
      if (type && type !== "all") results = results.filter((a) => a.type === type);
      return mockDelay([...results]);
    }
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (type && type !== "all") params.set("type", type);
    return apiClient.get<AlertItem[]>(`/alerts?${params.toString()}`);
  },

  async updateStatus(alertId: string, status: AlertStatus): Promise<AlertItem> {
    if (USE_MOCKS) {
      alertStore = alertStore.map((a) => (a.id === alertId ? { ...a, status } : a));
      return mockDelay(alertStore.find((a) => a.id === alertId)!);
    }
    return apiClient.patch<AlertItem>(`/alerts/${alertId}`, { status });
  },

  /** Save (or clear, with empty text) the clinical note and choose whether the patient can see it. */
  async saveNote(alertId: string, note: string, sharedWithPatient: boolean): Promise<AlertItem> {
    if (USE_MOCKS) {
      const cleaned = note.trim();
      alertStore = alertStore.map((a) =>
        a.id === alertId
          ? { ...a, clinicalNote: cleaned || undefined, noteSharedWithPatient: cleaned ? sharedWithPatient : false }
          : a
      );
      return mockDelay(alertStore.find((a) => a.id === alertId)!);
    }
    return apiClient.patch<AlertItem>(`/alerts/${alertId}`, {
      clinicalNote: note,
      noteSharedWithPatient: sharedWithPatient,
    });
  },

  async sendFollowUp(alertId: string, note?: string): Promise<AlertItem> {
    if (USE_MOCKS) {
      alertStore = alertStore.map((a) =>
        a.id === alertId ? { ...a, followUp: { requestedAt: new Date().toISOString(), note } } : a
      );
      return mockDelay(alertStore.find((a) => a.id === alertId)!, 300);
    }
    return apiClient.post<AlertItem>(`/alerts/${alertId}/follow-up`, { note });
  },
};