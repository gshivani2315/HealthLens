// ---------------------------------------------------------------------------
// Shared domain types. These mirror the tables in the architecture diagram
// (Users, Patients, Vitals, Alerts, Summaries) so the backend team can return
// JSON shaped exactly like this without the frontend needing to change.
// ---------------------------------------------------------------------------

export type UserRole = "patient" | "doctor";

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  email: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export type RiskStatus = "normal" | "moderate" | "critical";
export type AlertSeverity = "info" | "caution" | "critical";
export type AlertType = "threshold" | "ai_pattern";
export type AlertStatus = "unread" | "acknowledged" | "resolved";
export type GlucoseContext = "fasting" | "post_meal";

export interface Doctor {
  id: string;
  name: string;
  clinicName: string;
  phone?: string;
  email: string;
  assignedDate?: string; // ISO date
}

export interface ChronicCondition {
  id: string;
  label: string; // e.g. "Hypertension Stage 1"
}

export interface PatientProfile {
  id: string;
  name: string;
  dateOfBirth: string; // ISO date
  age: number;
  gender: string;
  phone: string;
  email: string;
  conditions: ChronicCondition[];
  doctor: Doctor;
}

export interface PatientRosterRow {
  id: string;
  name: string;
  age: number;
  gender: string;
  primaryCondition: string;
  latestBloodPressure: { systolic: number; diastolic: number } | null;
  latestGlucose: number | null;
  riskStatus: RiskStatus;
  lastReadingAt: string | null; // ISO datetime
}

export interface VitalsEntry {
  id: string;
  patientId: string;
  recordedAt: string; // ISO datetime
  systolic?: number;
  diastolic?: number;
  glucose?: number;
  glucoseContext?: GlucoseContext;
  weightKg?: number;
  sleepHours?: number;
}

export interface VitalsSubmission {
  systolic?: number;
  diastolic?: number;
  glucose?: number;
  glucoseContext?: GlucoseContext;
  weightKg?: number;
  sleepHours?: number;
  recordedAt: string;
}

export interface MetricChange {
  value: number;
  changeVsWeekAvg: number;
  unit: string;
  label: string;
}

export interface DashboardSnapshot {
  patientName: string;
  doctor: Doctor;
  vitalsLoggedToday: boolean;
  metrics: {
    bloodPressure: MetricChange & { systolic: number; diastolic: number };
    glucose: MetricChange;
    weight: MetricChange;
    sleep: MetricChange;
  };
  aiInsight: {
    generatedAt: string;
    summary: string;
  } | null;
  recentAlerts: AlertItem[];
  sparkline: {
    date: string;
    systolic: number;
    diastolic: number;
    glucose: number;
  }[];
}

export interface AlertItem {
  id: string;
  patientId: string;
  patientName?: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  triggerLabel: string;
  detail?: string;
  triggeredAt: string; // ISO datetime
  clinicalNote?: string;
}

export interface WeeklySummary {
  id: string;
  patientId: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  narrative: string;
  takeaways: string[];
}

export interface TrendPoint {
  date: string;
  systolic?: number;
  diastolic?: number;
  glucose?: number;
  weightKg?: number;
  sleepHours?: number;
}

export type TrendRange = "7d" | "30d" | "90d";
export type VitalFilter = "all" | "bp" | "glucose" | "weight" | "sleep";

export interface TrendSummaryStats {
  average: number;
  peak: number;
  lowest: number;
  unit: string;
}

export interface DoctorOverview {
  totalPatients: number;
  criticalAlertsPending: number;
  missingReadings48h: number;
  urgentAlerts: AlertItem[];
  roster: PatientRosterRow[];
}

export interface PatientDetail {
  profile: PatientProfile;
  riskStatus: RiskStatus;
  aiClinicalInsight: {
    generatedAt: string;
    narrative: string;
  };
  alertHistory: AlertItem[];
  vitalsLog: VitalsEntry[];
}

export interface ThresholdConfig {
  patientId: string;
  systolicMax: number;
  diastolicMax: number;
  glucoseFastingMax: number;
  glucoseFastingMin: number;
  glucosePostMealMax: number;
  weightDeltaKg: number;
  weightDeltaDays: number;
}
