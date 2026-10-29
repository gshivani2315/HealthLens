// frontend/src/types/index.ts
// Shared domain types mirroring the HealthLens database schema & API contracts

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

export interface DoctorRegisterPayload {
  name: string;
  email: string;
  password: string;
  clinicName: string;
  phone?: string;
}

export interface PatientRegisterPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  inviteCode?: string;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  expiresAt?: number;
  user: AuthUser;
  linkedCare?: any;
}

export type RiskStatus = "normal" | "moderate" | "critical";
export type AlertSeverity = "info" | "caution" | "critical";
export type AlertType = "threshold" | "ai_pattern";
export type AlertStatus = "unread" | "acknowledged" | "resolved";
export type GlucoseContext = "fasting" | "post_meal";
export type AssignmentStatus = "PENDING" | "ACTIVE" | "ENDED";
export type InviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";
export type NotificationType = "CRITICAL_ALERT" | "VISIT_REQUEST" | "SYSTEM" | "CHAT" | "CARE_ASSIGNMENT";

export interface Clinic {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  role?: string;
  activePatientsCount?: number;
  staffCount?: number;
}

export interface CareAssignment {
  assignmentId: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  clinicName?: string;
  clinicPhone?: string;
  assignedAt?: string | null;
  status?: AssignmentStatus;
}

export interface CareInvite {
  id: string;
  code: string;
  doctorId: string;
  doctorName?: string;
  clinicId?: string;
  clinicName?: string;
  specialty?: string;
  patientEmail?: string;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  link?: string;
  metadata?: any;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  assignmentId: string;
  senderId: string;
  senderName: string;
  senderRole: "patient" | "doctor";
  content: string;
  read: boolean;
  createdAt: string;
}

export interface ChatThread {
  assignmentId: string;
  status: AssignmentStatus;
  specialty: string;
  clinic?: { id?: string; name: string; phone?: string } | null;
  patient: { id: string; name: string; email: string };
  doctor: { id: string; name: string; email: string };
  lastMessage?: { content: string; senderId: string; createdAt: string } | null;
  assignedAt: string;
  endedAt?: string | null;
}

export interface Doctor {
  id: string;
  name: string;
  clinicName: string;
  phone?: string;
  email: string;
  specialty?: string;
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
  doctorId?: string;
  specialty?: string;
  clinic?: { id?: string; name: string; phone?: string } | null;
  careTeam?: CareAssignment[];
}

export interface PatientRosterRow {
  id: string;
  doctorId?: string;
  name: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  age: number;
  gender: string;
  primaryCondition: string;
  specialty?: string;
  clinicName?: string;
  careTeamCount?: number;
  conditions?: ChronicCondition[];
  latestBloodPressure: { systolic: number; diastolic: number } | null;
  latestGlucose: number | null;
  latestHeartRate?: number | null;
  riskStatus: RiskStatus;
  lastReadingAt: string | null; // ISO datetime
}

export interface CreatePatientPayload {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string; // YYYY-MM-DD
  gender: string;
  conditions: string[];
  riskStatus?: RiskStatus;
  clinicId?: string;
  specialty?: string;
  initialSystolic?: number;
  initialDiastolic?: number;
  initialGlucose?: number;
  initialWeightKg?: number;
  initialSleepHours?: number;
  initialHeartRate?: number;
}

export interface UpdatePatientPayload {
  name?: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  conditions?: string[];
  riskStatus?: RiskStatus;
  clinicId?: string;
  specialty?: string;
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
  heartRate?: number;
}

export interface VitalsSubmission {
  systolic?: number;
  diastolic?: number;
  glucose?: number;
  glucoseContext?: GlucoseContext;
  weightKg?: number;
  sleepHours?: number;
  heartRate?: number;
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
  doctor: Doctor | null;
  vitalsLoggedToday: boolean;
  metrics: {
    bloodPressure: MetricChange & { systolic: number; diastolic: number };
    glucose: MetricChange;
    weight: MetricChange;
    sleep: MetricChange;
    heartRate?: MetricChange;
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
    heartRate?: number;
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
  patientPhone?: string;
  patientEmail?: string;
  noteSharedWithPatient?: boolean;
  followUp?: { requestedAt: string; note?: string } | null;
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
  heartRate?: number;
}

export type TrendRange = "7d" | "30d" | "90d";
export type VitalFilter = "all" | "bp" | "glucose" | "weight" | "sleep" | "heartRate";

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
  aiClinicalInsight: { generatedAt: string; narrative: string } | null;
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
  heartRateMax?: number;
  heartRateMin?: number;
}

export type CreatePatientResult = PatientRosterRow & { temporaryPassword?: string };
