// Backend contract:
//   GET /doctor/patients/:id/thresholds        -> ThresholdConfig
//   PUT /doctor/patients/:id/thresholds        { ThresholdConfig } -> ThresholdConfig

import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { ThresholdConfig } from "@/types";
import { mockThresholds } from "./mockData";

export const thresholdsService = {
  async get(patientId: string): Promise<ThresholdConfig> {
    if (USE_MOCKS) return mockDelay(mockThresholds[patientId] ?? mockThresholds["pat_001"]);
    return apiClient.get<ThresholdConfig>(`/doctor/patients/${patientId}/thresholds`);
  },

  async save(patientId: string, config: ThresholdConfig): Promise<ThresholdConfig> {
    if (USE_MOCKS) {
      mockThresholds[patientId] = config;
      return mockDelay(config);
    }
    return apiClient.put<ThresholdConfig>(`/doctor/patients/${patientId}/thresholds`, config);
  },
};
