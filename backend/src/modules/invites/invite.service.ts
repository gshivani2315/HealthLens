import crypto from 'crypto';
import { prisma } from '../../db';
import { createNotification } from '../notifications/notification.service';

function generateInviteCode(): string {
  // Format: HL-XXXX-XXXX (e.g. HL-8F2A-9C4B)
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `HL-${part1}-${part2}`;
}

export async function createCareInvite(input: {
  doctorId: string;
  clinicId?: string;
  specialty?: string;
  patientEmail?: string;
  daysValid?: number;
}) {
  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + (input.daysValid || 14) * 24 * 60 * 60 * 1000);

  const invite = await prisma.careInvite.create({
    data: {
      code,
      doctorId: input.doctorId,
      clinicId: input.clinicId || null,
      specialty: input.specialty || 'General Practice',
      patientEmail: input.patientEmail ? input.patientEmail.trim().toLowerCase() : null,
      status: 'PENDING',
      expiresAt,
    },
    include: {
      clinic: true,
      doctor: { include: { user: true } },
    },
  });

  return invite;
}

export async function getDoctorInvites(doctorId: string) {
  return prisma.careInvite.findMany({
    where: { doctorId },
    include: { clinic: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getInviteDetails(code: string) {
  const invite = await prisma.careInvite.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: {
      clinic: true,
      doctor: { include: { user: true } },
    },
  });
  if (!invite) return null;

  return {
    code: invite.code,
    doctorName: invite.doctor.user.name,
    specialty: invite.specialty,
    clinicName: invite.clinic?.name || 'HealthLens Clinic',
    status: invite.status,
    isExpired: new Date() > invite.expiresAt,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function acceptCareInvite(code: string, patientUserId: string) {
  const cleanedCode = code.trim().toUpperCase();
  const invite = await prisma.careInvite.findUnique({
    where: { code: cleanedCode },
    include: {
      clinic: true,
      doctor: { include: { user: true } },
    },
  });

  if (!invite) {
    return { error: 404, message: 'Invalid invite code' };
  }

  if (invite.status !== 'PENDING') {
    return { error: 400, message: `Invite code has already been ${invite.status.toLowerCase()}` };
  }

  if (new Date() > invite.expiresAt) {
    await prisma.careInvite.update({
      where: { id: invite.id },
      data: { status: 'EXPIRED' },
    });
    return { error: 400, message: 'Invite code has expired' };
  }

  const patient = await prisma.patient.findUnique({
    where: { userId: patientUserId },
    include: { user: true },
  });

  if (!patient) {
    return { error: 404, message: 'Patient profile not found' };
  }

  if (invite.patientEmail && invite.patientEmail.toLowerCase() !== patient.user.email.toLowerCase()) {
    return { error: 403, message: `This invite code was issued specifically for ${invite.patientEmail}` };
  }

  // Create or reactivate CareAssignment
  const existing = await prisma.careAssignment.findFirst({
    where: {
      patientId: patient.id,
      doctorId: invite.doctorId,
    },
  });

  let assignment;
  if (existing) {
    assignment = await prisma.careAssignment.update({
      where: { id: existing.id },
      data: {
        status: 'ACTIVE',
        clinicId: invite.clinicId || existing.clinicId,
        specialty: invite.specialty || existing.specialty,
        assignedAt: new Date(),
        endedAt: null,
      },
    });
  } else {
    assignment = await prisma.careAssignment.create({
      data: {
        patientId: patient.id,
        doctorId: invite.doctorId,
        clinicId: invite.clinicId || null,
        specialty: invite.specialty || 'General Practice',
        status: 'ACTIVE',
        assignedAt: new Date(),
      },
    });
  }

  // Also update legacy doctorId if empty for backward compatibility
  if (!patient.doctorId) {
    await prisma.patient.update({
      where: { id: patient.id },
      data: { doctorId: invite.doctorId, doctorAssignedAt: new Date() },
    });
  }

  // Mark invite accepted
  await prisma.careInvite.update({
    where: { id: invite.id },
    data: { status: 'ACCEPTED' },
  });

  // Notify Doctor
  await createNotification({
    userId: invite.doctor.userId,
    title: 'New patient linked',
    message: `${patient.user.name} has joined your care roster via invite code ${cleanedCode}.`,
    type: 'CARE_ASSIGNMENT',
    link: `/doctor/patients/${patient.id}`,
    metadata: { patientId: patient.id, assignmentId: assignment.id },
  }).catch(() => {});

  // Notify Patient
  await createNotification({
    userId: patient.userId,
    title: 'Connected to doctor',
    message: `You are now under the clinical care of ${invite.doctor.user.name} (${invite.specialty || 'General Practice'}).`,
    type: 'CARE_ASSIGNMENT',
    link: `/patient/dashboard`,
    metadata: { doctorId: invite.doctorId, assignmentId: assignment.id },
  }).catch(() => {});

  return {
    assignment,
    doctor: {
      id: invite.doctor.id,
      name: invite.doctor.user.name,
      specialty: invite.specialty,
      clinic: invite.clinic ? { name: invite.clinic.name, phone: invite.clinic.phone } : null,
    },
  };
}

