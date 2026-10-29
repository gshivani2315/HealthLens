import { prisma } from './index';

/**
 * Ensures that existing doctors have corresponding Clinic and ClinicMember records,
 * and existing patients with doctorId have an ACTIVE CareAssignment.
 * This ensures zero disruption and full backward compatibility during the schema transition.
 */
export async function syncLegacyAssignments(): Promise<void> {
  try {
    // 1. Migrate Doctors -> Clinic & ClinicMember
    const doctors = await prisma.doctor.findMany({
      include: {
        clinicMemberships: true,
      },
    });

    for (const doc of doctors) {
      if (doc.clinicMemberships.length === 0) {
        const clinicId = `clinic_${doc.id}`;
        const clinicName = doc.clinicName?.trim() || 'HealthLens Clinic';

        await prisma.clinic.upsert({
          where: { id: clinicId },
          create: {
            id: clinicId,
            name: clinicName,
            phone: doc.phone ?? undefined,
          },
          update: {
            name: clinicName,
          },
        });

        await prisma.clinicMember.upsert({
          where: {
            doctorId_clinicId: {
              doctorId: doc.id,
              clinicId,
            },
          },
          create: {
            doctorId: doc.id,
            clinicId,
            role: 'PHYSICIAN',
          },
          update: {},
        });
      }
    }

    // 2. Migrate Patients with doctorId -> CareAssignment
    const patients = await prisma.patient.findMany({
      where: {
        doctorId: { not: null },
      },
      include: {
        careAssignments: true,
      },
    });

    for (const pat of patients) {
      if (!pat.doctorId) continue;

      const hasAssignment = pat.careAssignments.some(
        (ca) => ca.doctorId === pat.doctorId && ca.status === 'ACTIVE'
      );

      if (!hasAssignment) {
        const assignmentId = `ca_${pat.id}_${pat.doctorId}`;
        const clinicId = `clinic_${pat.doctorId}`;

        await prisma.careAssignment.upsert({
          where: { id: assignmentId },
          create: {
            id: assignmentId,
            patientId: pat.id,
            doctorId: pat.doctorId,
            clinicId,
            specialty: 'Primary Care',
            status: 'ACTIVE',
            assignedAt: pat.doctorAssignedAt || new Date(),
          },
          update: {
            status: 'ACTIVE',
          },
        });
      }
    }
  } catch (err) {
    // If table doesn't exist yet before migration runs or error occurs, log warning gracefully
    console.warn('[DataMigration] Notice: syncLegacyAssignments skipped or deferred:', (err as Error)?.message);
  }
}

