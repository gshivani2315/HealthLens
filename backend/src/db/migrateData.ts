import { prisma } from './index';

export async function syncLegacyAssignments(): Promise<void> {
  try {
    // 1. Doctors without a clinic -> create a Clinic and link via clinicId
    const doctors = await prisma.doctor.findMany({
      where: { clinicId: null },
    });

    for (const doc of doctors) {
      const clinicId = `clinic_${doc.id}`;
      const clinicName = doc.clinicName?.trim() || 'HealthLens Clinic';

      await prisma.clinic.upsert({
        where: { id: clinicId },
        create: {
          id: clinicId,
          name: clinicName,
          phone: doc.phone ?? undefined,
        },
        update: { name: clinicName },
      });

      await prisma.doctor.update({
        where: { id: doc.id },
        data: { clinicId },
      });
    }

    // 2. Patients with legacy doctorId -> ACTIVE CareAssignment
    const patients = await prisma.patient.findMany({
      where: { doctorId: { not: null } },
      include: {
        careAssignments: true,
        doctor: { select: { clinicId: true } },
      },
    });

    for (const pat of patients) {
      if (!pat.doctorId) continue;

      const hasAssignment = pat.careAssignments.some(
        (ca) => ca.doctorId === pat.doctorId && ca.status === 'ACTIVE'
      );
      if (hasAssignment) continue;

      const assignmentId = `ca_${pat.id}_${pat.doctorId}`;

      await prisma.careAssignment.upsert({
        where: { id: assignmentId },
        create: {
          id: assignmentId,
          patientId: pat.id,
          doctorId: pat.doctorId,
          clinicId: pat.doctor?.clinicId ?? null,
          specialty: 'Primary Care',
          status: 'ACTIVE',
          assignedAt: pat.doctorAssignedAt ?? new Date(),
        },
        update: { status: 'ACTIVE' },
      });
    }
  } catch (err) {
    console.error('[DataMigration] syncLegacyAssignments failed:', err);
    throw err; // don't report success when it failed
  }
}