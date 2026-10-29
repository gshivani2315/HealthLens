import { prisma } from '../../db';
import { createNotification } from '../notifications/notification.service';

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
    where: whereClause,
    include: {
      patient: { include: { user: true } },
      doctor: { include: { user: true } },
      clinic: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return assignments.map((a: any) => {
    const lastMsg = a.messages?.[0] || null;
    return {
      assignmentId: a.id,
      status: a.status,
      specialty: a.specialty,
      clinic: a.clinic ? { id: a.clinic.id, name: a.clinic.name, phone: a.clinic.phone } : null,
      patient: {
        id: a.patient.id,
        name: a.patient.user.name,
        email: a.patient.user.email,
      },
      doctor: {
        id: a.doctor.id,
        name: a.doctor.user.name,
        email: a.doctor.user.email,
      },
      lastMessage: lastMsg
        ? {
            content: lastMsg.content,
            senderId: lastMsg.senderId,
            createdAt: lastMsg.createdAt.toISOString(),
          }
        : null,
      assignedAt: a.assignedAt.toISOString(),
      endedAt: a.endedAt ? a.endedAt.toISOString() : null,
    };
  });
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

  if (!assignment) return { error: 404, message: 'Care assignment not found' };

  // Verify access: user must be either the assigned patient or the assigned doctor
  const isPatient = assignment.patient.userId === userId;
  const isDoctor = assignment.doctor.userId === userId;

  if (!isPatient && !isDoctor) {
    return { error: 403, message: 'Forbidden: You are not authorized to view messages for this care assignment' };
  }

  // Mark unread messages sent by the other party as read
  await prisma.message.updateMany({
    where: {
      assignmentId,
      senderId: { not: userId },
      read: false,
    },
    data: { read: true },
  });

  const messages = await prisma.message.findMany({
    where: { assignmentId },
    include: {
      sender: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: 'asc' },
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
    messages: messages.map((m: any) => ({
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
    include: {
      patient: { include: { user: true } },
      doctor: { include: { user: true } },
    },
  });

  if (!assignment) return { error: 404, message: 'Care assignment not found' };

  // Access check
  const isPatient = assignment.patient.userId === senderUserId;
  const isDoctor = assignment.doctor.userId === senderUserId;

  if (!isPatient && !isDoctor) {
    return { error: 403, message: 'Forbidden: You are not part of this care assignment' };
  }

  // CRITICAL REQUIREMENT: "One thread per doctor–patient assignment, so it ends when access ends"
  if (assignment.status !== 'ACTIVE') {
    return {
      error: 403,
      message: 'Access to this thread has ended. Care assignments that are pending or ended cannot exchange messages.',
    };
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return { error: 400, message: 'Message content cannot be empty' };
  }

  const message = await prisma.message.create({
    data: {
      assignmentId,
      senderId: senderUserId,
      content: trimmed,
      read: false,
    },
    include: {
      sender: { select: { id: true, name: true, role: true } },
    },
  });

  // Notify the other party
  const recipientUserId = isPatient ? assignment.doctor.userId : assignment.patient.userId;
  const senderName = message.sender.name;

  await createNotification({
    userId: recipientUserId,
    title: `New message from ${senderName}`,
    message: trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed,
    type: 'CHAT',
    link: isPatient ? `/doctor/patients/${assignment.patient.id}` : `/patient/dashboard`,
    metadata: { assignmentId, messageId: message.id },
  }).catch((err) => console.error('[Chat] Notification failed:', err));

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

