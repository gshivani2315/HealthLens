import { prisma } from '../db';

/**
 * HealthLens Care Access Guard
 *
 * Single Source of Truth for Clinical Access:
 * A doctor can access a patient ONLY IF an ACTIVE CareAssignment exists between them.
 * Every doctor route, alert route, and patient route calls this single guard.
 *
 * Invariant: Clinic membership alone grants nothing. Two doctors in the same clinic
 * cannot access each other's patients without an active assignment.
 */

export interface AccessResult {
  authorized: boolean;
  status: 200 | 403 | 404;
  message?: string;
  patient?: any;
  assignment?: any;
}

/**
 * Core check: Does an ACTIVE CareAssignment exist between this doctor and patient?
 * Checks both CareAssignment table and fallback to legacy doctorId during migration.
 */
export async function hasActiveCareAssignment(doctorId: string, patientId: string): Promise<boolean> {
  if (!doctorId || !patientId) return false;

  // 1. Primary check: Active CareAssignment
  const assignment = await prisma.careAssignment.findFirst({
    where: {
      doctorId,
      patientId,
      status: 'ACTIVE',
    },
  });

  if (assignment) return true;

  // 2. Backward compatibility fallback during data migration transition:
  // If CareAssignment has not yet synced, check legacy patient.doctorId
  const legacyPatient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      doctorId,
    },
    select: { id: true },
  });

  return !!legacyPatient;
}

/**
 * Returns all active doctor IDs for a given patient.
 * Used for routing alerts and notifications to every active doctor on the patient.
 */
export async function getActiveDoctorIdsForPatient(patientId: string): Promise<string[]> {
  const assignments = await prisma.careAssignment.findMany({
    where: {
      patientId,
      status: 'ACTIVE',
    },
    select: { doctorId: true },
  });

  const ids = new Set<string>(assignments.map((a) => a.doctorId));

  // Legacy fallback
  const pat = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { doctorId: true },
  });
  if (pat?.doctorId) {
    ids.add(pat.doctorId);
  }

  return Array.from(ids);
}

/**
 * Returns all active patient IDs for a given doctor.
 */
export async function getActivePatientIdsForDoctor(doctorId: string): Promise<string[]> {
  const assignments = await prisma.careAssignment.findMany({
    where: {
      doctorId,
      status: 'ACTIVE',
    },
    select: { patientId: true },
  });

  const ids = new Set<string>(assignments.map((a) => a.patientId));

  // Legacy fallback
  const legacyPatients = await prisma.patient.findMany({
    where: { doctorId },
    select: { id: true },
  });
  for (const lp of legacyPatients) {
    ids.add(lp.id);
  }

  return Array.from(ids);
}

/**
 * Resolves a patient by id or userId and validates doctor authorization.
 * Handles:
 * - Patient lookup (by id or userId)
 * - ACTIVE CareAssignment check with doctorId
 */
export async function verifyDoctorPatientAccess(
  doctorId: string,
  patientIdentifier: string,
  includeOptions?: any
): Promise<AccessResult> {
  if (!doctorId) {
    return { authorized: false, status: 403, message: 'Doctor profile required for this action' };
  }

  const patient = await prisma.patient.findFirst({
    where: {
      OR: [{ id: patientIdentifier }, { userId: patientIdentifier }],
    },
    include: includeOptions ?? {
      user: true,
      conditions: true,
      threshold: true,
      insight: true,
    },
  });

  if (!patient) {
    return { authorized: false, status: 404, message: 'Patient not found' };
  }

  const authorized = await hasActiveCareAssignment(doctorId, patient.id);
  if (!authorized) {
    return {
      authorized: false,
      status: 403,
      message: 'Forbidden: No active care assignment exists between you and this patient',
    };
  }

  const assignment = await prisma.careAssignment.findFirst({
    where: {
      doctorId,
      patientId: patient.id,
      status: 'ACTIVE',
    },
    include: {
      clinic: true,
    },
  });

  return {
    authorized: true,
    status: 200,
    patient,
    assignment,
  };
}

