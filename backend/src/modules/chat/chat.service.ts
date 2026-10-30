// backend/src/modules/chat/chat.service.ts   (replaces current; same exports, same response shapes)
import { AssignmentStatus } from '@prisma/client';
import { prisma } from '../../db';
import { notifyNewMessage } from '../../lib/notify'; // in-app notification + throttled EmailJS email

// Ended assignments stay READABLE (history) but are closed for new messages. PENDING ones have no chat at all.
// To hide history once care ends, remove ENDED here.
const READABLE_STATUSES = [AssignmentStatus.ACTIVE, AssignmentStatus.ENDED];
const MAX_LENGTH = 2000;
const MAX_PER_MINUTE = 30;
const HISTORY_LIMIT = 500;

export async function getChatAssignmentsForUser(userId: string, role: 'PATIENT' | 'DOCTOR') {
  let whereClause: any = {};

  if (role === 'DOCTOR') {
    const doctor = await prisma.doctor.findUnique({ where: { userId } });
    if (!doctor) return [];
    whereClause = { doctorId: doctor.id };
  } else {
    const patient = await prisma.patient.findUnique({ where: { userId } });
    if (!patient) return [];
    whereClause = { patientId: patient.id };
  }

  const assignments = await prisma.careAssignment.findMany({
    where: { ...whereClause, status: { in: READABLE_STATUSES } },
    include: {
      patient: { include: { user: true } },
      doctor: { include: { user: true } },
      clinic: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      // unread = sent by the OTHER person and not yet read
      _count: { select: { messages: { where: { read: false, senderId: { not: userId } } } } },
    },
  });

  return assignments
    .map((a: any) => {
      const lastMsg = a.messages?.[0] || null;
      return {
        // updatedAt isn't touched by new messages, so sort by the last message instead
        sortKey: (lastMsg?.createdAt ?? a.assignedAt).getTime() as number,
        thread: {
          assignmentId: a.id,
          status: a.status,
          specialty: a.specialty,
          clinic: a.clinic ? { id: a.clinic.id, name: a.clinic.name, phone: a.clinic.phone } : null,
          patient: { id: a.patient.id, name: a.patient.user.name, email: a.patient.user.email },
          doctor: { id: a.doctor.id, name: a.doctor.user.name, email: a.doctor.user.email },
          lastMessage: lastMsg
            ? { content: lastMsg.content, senderId: lastMsg.senderId, createdAt: lastMsg.createdAt.toISOString() }
            : null,
          unreadCount: a._count?.messages ?? 0,
          assignedAt: a.assignedAt.toISOString(),
          endedAt: a.endedAt ? a.endedAt.toISOString() : null,
        },
      };
    })
    .sort((x: any, y: any) => y.sortKey - x.sortKey)
    .map((x: any) => x.thread);
}

export async function getAssignmentMessages(assignmentId: string, userId: string) {
  const assignment = await prisma.careAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      patient: { include: { user: true } },
      doctor: { include: { user: true } },
      clinic: true,
    },
  });

  // Not found, not a party to it, or still PENDING: all the same 404, so ids can't be probed
  // (a 403 would confirm that the conversation exists).
  if (
    !assignment ||
    (assignment.patient.userId !== userId && assignment.doctor.userId !== userId) ||
    !READABLE_STATUSES.includes(assignment.status as any)
  ) {
    return { error: 404, message: 'Conversation not found' };
  }

  // Newest HISTORY_LIMIT messages, shown oldest-first
  const rows = await prisma.message.findMany({
    where: { assignmentId },
    include: { sender: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_LIMIT,
  });

  // Opening the thread marks the other person's messages as read. notifyNewMessage relies on this flag
  // to send at most ONE email per unread burst.
  await prisma.message.updateMany({
    where: { assignmentId, senderId: { not: userId }, read: false },
    data: { read: true },
  });

  return {
    assignment: {
      id: assignment.id,
      status: assignment.status,
      specialty: assignment.specialty,
      clinic: assignment.clinic ? { name: assignment.clinic.name } : null,
      patientName: assignment.patient.user.name,
      doctorName: assignment.doctor.user.name,
      isEnded: assignment.status !== 'ACTIVE',
    },
    messages: rows.reverse().map((m: any) => ({
      id: m.id,
      assignmentId: m.assignmentId,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderRole: m.sender.role.toLowerCase(),
      content: m.content,
      read: m.read,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function sendMessage(assignmentId: string, senderUserId: string, content: string) {
  const assignment = await prisma.careAssignment.findUnique({
    where: { id: assignmentId },
    include: { patient: true, doctor: true },
  });

  if (
    !assignment ||
    (assignment.patient.userId !== senderUserId && assignment.doctor.userId !== senderUserId)
  ) {
    return { error: 404, message: 'Conversation not found' };
  }

  // One thread per doctor-patient assignment: it closes when the assignment ends.
  if (assignment.status !== 'ACTIVE') {
    return {
      error: 403,
      message: 'Access to this thread has ended. Care assignments that are pending or ended cannot exchange messages.',
    };
  }

  const trimmed = content.trim();
  if (!trimmed) return { error: 400, message: 'Message content cannot be empty' };
  if (trimmed.length > MAX_LENGTH) {
    return { error: 400, message: `Message is too long (max ${MAX_LENGTH} characters)` };
  }

  // Stateless flood guard (survives restarts, works across several server instances)
  const recent = await prisma.message.count({
    where: { senderId: senderUserId, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent >= MAX_PER_MINUTE) {
    return { error: 429, message: 'You are sending messages too quickly. Please wait a moment.' };
  }

  const message = await prisma.message.create({
    data: { assignmentId, senderId: senderUserId, content: trimmed, read: false },
    include: { sender: { select: { id: true, name: true, role: true } } },
  });

  // In-app bell for the recipient, plus (doctor -> patient only, throttled) one EmailJS email.
  // Replaces the old inline createNotification, which also linked to the wrong pages
  // (/doctor/patients/:id and /patient/dashboard instead of the chat). Not awaited: a slow or failing
  // email provider must never delay or fail a send.
  notifyNewMessage(message.id);

  return {
    message: {
      id: message.id,
      assignmentId: message.assignmentId,
      senderId: message.senderId,
      senderName: message.sender.name,
      senderRole: message.sender.role.toLowerCase(),
      content: message.content,
      read: message.read,
      createdAt: message.createdAt.toISOString(),
    },
  };
}

/** For a sidebar badge. */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.message.count({
    where: {
      read: false,
      senderId: { not: userId },
      assignment: {
        status: AssignmentStatus.ACTIVE,
        OR: [{ doctor: { userId } }, { patient: { userId } }],
      },
    },
  });
}