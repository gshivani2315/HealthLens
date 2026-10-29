import { PrismaClient, Prisma } from '@prisma/client';

export type AssignmentStatus = 'PENDING' | 'ACTIVE' | 'ENDED';
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
export type NotificationType = 'CRITICAL_ALERT' | 'VISIT_REQUEST' | 'SYSTEM' | 'CHAT' | 'CARE_ASSIGNMENT';

export interface ClinicModel {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicMemberModel {
  id: string;
  doctorId: string;
  clinicId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CareAssignmentModel {
  id: string;
  patientId: string;
  doctorId: string;
  clinicId?: string | null;
  specialty: string;
  status: AssignmentStatus;
  assignedAt: Date;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CareInviteModel {
  id: string;
  code: string;
  doctorId: string;
  clinicId?: string | null;
  specialty?: string | null;
  patientEmail?: string | null;
  status: InviteStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationModel {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  link?: string | null;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageModel {
  id: string;
  assignmentId: string;
  senderId: string;
  content: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Delegate helper interface
export interface ModelDelegate<T> {
  findUnique(args: any): Promise<T | null>;
  findFirst(args?: any): Promise<T | null>;
  findMany(args?: any): Promise<T[]>;
  create(args: any): Promise<T>;
  createMany(args?: any): Promise<{ count: number }>;
  update(args: any): Promise<T>;
  updateMany(args?: any): Promise<{ count: number }>;
  upsert(args: any): Promise<T>;
  delete(args: any): Promise<T>;
  deleteMany(args?: any): Promise<{ count: number }>;
  count(args?: any): Promise<number>;
}

export type ExtendedPrismaClient = PrismaClient & {
  clinic: ModelDelegate<ClinicModel>;
  clinicMember: ModelDelegate<ClinicMemberModel>;
  careAssignment: ModelDelegate<CareAssignmentModel>;
  careInvite: ModelDelegate<CareInviteModel>;
  notification: ModelDelegate<NotificationModel>;
  message: ModelDelegate<MessageModel>;
};

export const prisma = new PrismaClient() as unknown as ExtendedPrismaClient;
