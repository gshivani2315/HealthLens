// frontend/src/services/vitalsService.ts
import { apiClient, mockDelay, USE_MOCKS } from "./apiClient";
import { DashboardSnapshot, TrendPoint, TrendRange, TrendSummaryStats, VitalFilter, VitalsEntry, VitalsSubmission } from "@/types";
import { generateVitalsHistory, mockDoctor, mockPatientProfile } from "./mockData";

function rangeDays(range: TrendRange): number {
  return range === "7d" ? 7 : range === "30d" ? 30 : 90;
}

function toTrendPoints(entries: VitalsEntry[]): TrendPoint[] {
  return entries.map((e) => ({
    date: e.recordedAt,
    systolic: e.systolic,
    diastolic: e.diastolic,
    glucose: e.glucose,
    weightKg: e.weightKg,
    sleepHours: e.sleepHours,
    heartRate: e.heartRate,
  }));
}

function computeStats(values: number[], unit: string): TrendSummaryStats {
  if (values.length === 0) return { average: 0, peak: 0, lowest: 0, unit };
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    average: Number(average.toFixed(1)),
    peak: Math.max(...values),
    lowest: Math.min(...values),
    unit,
  };
}

export const vitalsService = {
  async getDashboard(patientId: string): Promise<DashboardSnapshot> {
    if (USE_MOCKS) {
      const history = generateVitalsHistory(patientId, 8);
      const latest = history[history.length - 1];
      const weekPrior = history.slice(0, 7);
      const avg = (key: keyof VitalsEntry) =>
        weekPrior.reduce((sum, e) => sum + (Number(e[key]) || 0), 0) / weekPrior.length;

      return mockDelay({
        patientName: mockPatientProfile.name,
        doctor: mockDoctor,
        vitalsLoggedToday: true,
        metrics: {
          bloodPressure: {
            value: latest.systolic!,
            systolic: latest.systolic!,
            diastolic: latest.diastolic!,
            changeVsWeekAvg: Number((latest.systolic! - avg("systolic")).toFixed(1)),
            unit: "mmHg",
            label: "Blood pressure",
          },
          glucose: {
            value: latest.glucose!,
            changeVsWeekAvg: Number((latest.glucose! - avg("glucose")).toFixed(1)),
            unit: "mg/dL",
            label: "Blood glucose",
          },
          weight: {
            value: latest.weightKg!,
            changeVsWeekAvg: Number((latest.weightKg! - avg("weightKg")).toFixed(1)),
            unit: "kg",
            label: "Weight",
          },
          sleep: {
            value: latest.sleepHours!,
            changeVsWeekAvg: Number((latest.sleepHours! - avg("sleepHours")).toFixed(1)),
            unit: "hrs",
            label: "Sleep",
          },
          heartRate: {
            value: latest.heartRate ?? 72,
            changeVsWeekAvg: Number(((latest.heartRate ?? 72) - avg("heartRate")).toFixed(1)),
            unit: "bpm",
            label: "Heart rate",
          },
        },
        aiInsight: {
          generatedAt: latest.recordedAt,
          summary:
            "Your BP has remained slightly elevated this week, averaging 148/94. Resting heart rate is stable at 72 bpm. Sleep improved by about 1 hour compared to last week.",
        },
        recentAlerts: [],
        sparkline: history.slice(-7).map((e) => ({
          date: e.recordedAt,
          systolic: e.systolic!,
          diastolic: e.diastolic!,
          glucose: e.glucose!,
          heartRate: e.heartRate ?? 72,
        })),
      });
    }
    return apiClient.get<DashboardSnapshot>(`/patients/${patientId}/dashboard`);
  },

  async submitVitals(patientId: string, submission: VitalsSubmission): Promise<VitalsEntry> {
    if (USE_MOCKS) {
      return mockDelay(
        {
          id: `vit_${Date.now()}`,
          patientId,
          ...submission,
        },
        450
      );
    }
    return apiClient.post<VitalsEntry>(`/patients/${patientId}/vitals`, submission);
  },

  async getTrends(
    patientId: string,
    range: TrendRange,
    filter: VitalFilter
  ): Promise<{ points: TrendPoint[]; stats: Partial<Record<VitalFilter, TrendSummaryStats>> }> {
    if (USE_MOCKS) {
      const history = generateVitalsHistory(patientId, rangeDays(range));
      const points = toTrendPoints(history);
      const stats: Partial<Record<VitalFilter, TrendSummaryStats>> = {
        bp: computeStats(points.map((p) => p.systolic ?? 0).filter((v) => v > 0), "mmHg"),
        glucose: computeStats(points.map((p) => p.glucose ?? 0).filter((v) => v > 0), "mg/dL"),
        weight: computeStats(points.map((p) => p.weightKg ?? 0).filter((v) => v > 0), "kg"),
        sleep: computeStats(points.map((p) => p.sleepHours ?? 0).filter((v) => v > 0), "hrs"),
        heartRate: computeStats(points.map((p) => p.heartRate ?? 0).filter((v) => v > 0), "bpm"),
      };
      return mockDelay({ points, stats });
    }
    return apiClient.get<{ points: TrendPoint[]; stats: Partial<Record<VitalFilter, TrendSummaryStats>> }>(
      `/patients/${patientId}/vitals?range=${range}&filter=${filter}`
    );
  },

  async getVitalsLog(patientId: string, page = 1, pageSize = 20): Promise<{ entries: VitalsEntry[]; total: number }> {
    if (USE_MOCKS) {
      const all = generateVitalsHistory(patientId, 90).reverse();
      const start = (page - 1) * pageSize;
      return mockDelay({ entries: all.slice(start, start + pageSize), total: all.length });
    }
    return apiClient.get<{ entries: VitalsEntry[]; total: number }>(
      `/patients/${patientId}/vitals/log?page=${page}&pageSize=${pageSize}`
    );
  },
};
