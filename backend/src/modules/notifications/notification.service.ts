import { prisma, NotificationType } from '../../db';
import { getActiveDoctorIdsForPatient } from '../../middleware/accessGuard';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
  metadata?: any;
}

/**
 * Dispatches an email notification for critical events (critical alerts, visit requests).
 * Pluggable email transporter / sender.
 */
export async function sendEmailNotification(toEmail: string, subject: string, body: string): Promise<boolean> {
  // In production, this integrates with SendGrid, AWS SES, Resend, or Supabase mailer.
  // For development and testing, it outputs cleanly formatted notification logs.
  console.log(`\n📧 [EMAIL DISPATCHED] To: ${toEmail} | Subject: ${subject}\n${body}\n`);
  return true;
}

/**
 * Creates an in-app notification stored in the database.
 * If the notification is CRITICAL_ALERT or VISIT_REQUEST, dispatches an email to the user.
 */
export async function createNotification(input: CreateNotificationInput) {
  const notif = await prisma.notification.create({
    data: {
      userId: input.userId,
      title: input.title,
      message: input.message,
      type: input.type || 'SYSTEM',
      link: input.link || null,
      metadata: input.metadata || null,
      read: false,
    },
  });

  // If critical alert or visit request, send email notification
  if (input.type === 'CRITICAL_ALERT' || input.type === 'VISIT_REQUEST') {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true },
    });
    if (user?.email) {
      await sendEmailNotification(
        user.email,
        `[HealthLens Alert] ${input.title}`,
        `Hello ${user.name},\n\n${input.message}\n\nPlease log in to HealthLens immediately to review details: ${input.link || 'https://healthlens.app'}`
      ).catch((err) => console.error('[NotificationService] Email dispatch failed:', err));
    }
  }

  return notif;
}

/**
 * Dispatches notification to ALL active doctors caring for a patient.
 * "Alerts go to every active doctor on the patient."
 */
export async function notifyActiveDoctorsForPatient(
  patientId: string,
  event: {
    title: string;
    message: string;
    type: NotificationType;
    link?: string;
    metadata?: any;
  }
) {
  const doctorIds = await getActiveDoctorIdsForPatient(patientId);
  if (doctorIds.length === 0) return [];

  const doctors = await prisma.doctor.findMany({
    where: { id: { in: doctorIds } },
    select: { userId: true },
  });

  const createdNotifications = [];
  for (const doc of doctors) {
    const n = await createNotification({
      userId: doc.userId,
      title: event.title,
      message: event.message,
      type: event.type,
      link: event.link,
      metadata: event.metadata,
    });
    createdNotifications.push(n);
  }

  return createdNotifications;
}

export async function getUserNotifications(userId: string, limit = 50) {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId, read: false },
    }),
  ]);

  return { notifications, unreadCount };
}

export async function markNotificationAsRead(notificationId: string, userId: string) {
  const notif = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!notif) return null;

  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

export async function markAllNotificationsAsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

