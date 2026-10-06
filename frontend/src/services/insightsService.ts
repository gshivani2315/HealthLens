// Backend contract:
//   GET /patients/:id/summaries         -> WeeklySummary[]
//   GET /patients/:id/alerts/history    -> AlertItem[]

import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { AlertItem, WeeklySummary } from "@/types";
import { getAlertsForPatient, getSummariesForPatient } from "./mockData";

export const insightsService = {
  async getWeeklySummaries(patientId: string): Promise<WeeklySummary[]> {
    if (USE_MOCKS) return mockDelay(getSummariesForPatient(patientId));
    return apiClient.get<WeeklySummary[]>(`/patients/${patientId}/summaries`);
  },

  async getAlertHistory(patientId: string): Promise<AlertItem[]> {
    if (USE_MOCKS) return mockDelay(getAlertsForPatient(patientId));
    return apiClient.get<AlertItem[]>(`/patients/${patientId}/alerts/history`);
  },
};
