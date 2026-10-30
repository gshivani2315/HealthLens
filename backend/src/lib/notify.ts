import { prisma } from '../db';
import { config } from '../config';
import { sendEmail } from './email';
import { createNotification } from '../modules/notifications/notification.service';

export type AlertEvent = 'alert_acknowledged' | 'alert_resolved' | 'note_shared' | 'follow_up_requested';

// Names are stored with "Dr." already; this only guards against a double or missing prefix.
const withDr = (name: string) => (/^(dr\.?|doctor)\s/i.test(name.trim()) ? name.trim() : `Dr. ${name.trim()}`);

const COPY: Record<AlertEvent, { type: 'SYSTEM' | 'VISIT_REQUEST'; title: string; headline: string; body: (d: string) => string }> = {
  alert_acknowledged: {
    type: 'SYSTEM',
    title: 'Your doctor reviewed an alert',
    headline: 'Alert reviewed',
    body: (d) => `${d} has acknowledged an alert on your account.`,
  },
  alert_resolved: {
    type: 'SYSTEM',
    title: 'An alert was resolved',
    headline: 'Alert resolved',
    body: (d) => `${d} has marked an alert as resolved.`,
  },
  note_shared: {
    type: 'SYSTEM',
    title: 'A doctor shared a note with you',
    headline: 'New note from your doctor',
    body: (d) => `${d} shared a note with you. Log in to read it.`,
  },
  follow_up_requested: {
    type: 'VISIT_REQUEST',
    title: 'Doctor visit / follow-up requested',
    headline: 'Follow-up requested',
    body: (d) => `${d} has requested a follow-up. Log in for details.`,
  },
};

/**
 * Fire-and-forget: call WITHOUT await, after the DB write succeeded.
 * Emails never include free-text notes/messages (email is not a secure channel);
 * the in-app notification may, since it is only visible after login.
 */
export function notifyAlertEvent(alertId: string, doctorId: string, event: AlertEvent): void {
  void (async () => {
    const [alert, doctor] = await Promise.all([
      prisma.alert.findUnique({ where: { id: alertId }, include: { patient: { include: { user: true } } } }),
      prisma.doctor.findUnique({ where: { id: doctorId }, include: { user: true, clinic: true } }),
    ]);
    if (!alert || !doctor) return;

    const patientUser = alert.patient.user;
    const doctorName = withDr(doctor.user.name);
    const copy = COPY[event];
    const emailBody = copy.body(doctorName);

    const inAppMessage =
      event === 'follow_up_requested' && alert.followUpNote
        ? `${doctorName} requested a follow-up: "${alert.followUpNote}"`
        : event === 'note_shared' && alert.noteSharedWithPatient && alert.clinicalNote
        ? `${doctorName} shared a note with you: "${alert.clinicalNote}"`
        : emailBody;

    await Promise.allSettled([
      createNotification({
        userId: patientUser.id,
        title: copy.title,
        message: inAppMessage,
        type: copy.type,
        link: '/patient/dashboard',
        metadata: { alertId, event, doctorId },
      }),
      sendEmail({
        to_email: patientUser.email,
        to_name: patientUser.name,
        doctor_name: doctorName,
        reply_to: doctor.user.email,
        clinic_name: doctor.clinic?.name ? ` · ${doctor.clinic.name}` : '',
        subject_line: `${copy.headline} - ${doctorName}`,
        headline: copy.headline,
        body_text: emailBody,
        portal_url: config.frontendUrl,
      }),
    ]);
  })().catch((err) => console.error('[notify] alert event failed:', err));
}

/** For the future chat route: call after a Message row is created. Emails doctor -> patient only, throttled. */
export function notifyNewMessage(messageId: string): void {
  void (async () => {
    const msg = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: true,
        assignment: {
          include: {
            clinic: true,
            patient: { include: { user: true } },
            doctor: { include: { user: true, clinic: true } },
          },
        },
      },
    });
    if (!msg) return;

    const { assignment } = msg;
    const fromDoctor = msg.senderId === assignment.doctor.userId;
    const recipient = fromDoctor ? assignment.patient.user : assignment.doctor.user;
    const senderName = fromDoctor ? withDr(assignment.doctor.user.name) : msg.sender.name;

    await createNotification({
      userId: recipient.id,
      title: `New message from ${senderName}`,
      message: 'You have a new message. Open Messages to read it.',
      type: 'CHAT',
      link: fromDoctor ? '/patient/chat' : '/doctor/chat',
      metadata: { messageId, assignmentId: assignment.id },
    });

    if (!fromDoctor) return;

    // One email per unread burst, to protect the EmailJS monthly quota.
    const earlierUnread = await prisma.message.count({
      where: { assignmentId: assignment.id, senderId: msg.senderId, read: false, id: { not: msg.id } },
    });
    if (earlierUnread > 0) return;

    const clinic = assignment.clinic?.name ?? assignment.doctor.clinic?.name;
    await sendEmail({
      to_email: recipient.email,
      to_name: recipient.name,
      doctor_name: senderName,
      reply_to: assignment.doctor.user.email,
      clinic_name: clinic ? ` · ${clinic}` : '',
      subject_line: `New message from ${senderName}`,
      headline: 'New message',
      body_text: `You have a new message from ${senderName}. Log in to read and reply.`,
      portal_url: config.frontendUrl,
    });
  })().catch((err) => console.error('[notify] message failed:', err));
}