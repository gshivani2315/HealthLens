// Backend contract:
//   GET   /alerts?status=&type=              -> AlertItem[]
//   PATCH /alerts/:id                         { status, clinicalNote? } -> AlertItem
//   POST  /alerts/:id/follow-up                -> 204

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

  async updateStatus(alertId: string, status: AlertStatus, clinicalNote?: string): Promise<AlertItem> {
    if (USE_MOCKS) {
      alertStore = alertStore.map((a) => (a.id === alertId ? { ...a, status, clinicalNote: clinicalNote ?? a.clinicalNote } : a));
      const updated = alertStore.find((a) => a.id === alertId)!;
      return mockDelay(updated);
    }
    return apiClient.patch<AlertItem>(`/alerts/${alertId}`, { status, clinicalNote });
  },

  async sendFollowUp(alertId: string): Promise<void> {
    if (USE_MOCKS) return mockDelay(undefined, 300);
    return apiClient.post<void>(`/alerts/${alertId}/follow-up`);
  },
};
