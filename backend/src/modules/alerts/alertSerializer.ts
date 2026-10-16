// backend/src/modules/alerts/alertSerializer.ts
// ONE place that decides what an alert looks like to each audience.
// Every route that returns alerts (alerts console, patient history, patient dashboard,
// doctor's patient-detail) must go through these so a private note can never leak.

function lowerSeverity(sev: string): 'info' | 'caution' | 'critical' {
  switch (sev.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'CAUTION': return 'caution';
    default: return 'info';
  }
}

function lowerStatus(status: string): 'unread' | 'acknowledged' | 'resolved' {
  switch (status.toUpperCase()) {
    case 'ACKNOWLEDGED': return 'acknowledged';
    case 'RESOLVED': return 'resolved';
    default: return 'unread';
  }
}

function lowerType(type: string): 'threshold' | 'ai_pattern' {
  return type.toUpperCase() === 'AI_PATTERN' ? 'ai_pattern' : 'threshold';
}

function base(a: any) {
  return {
    id: a.id,
    patientId: a.patientId,
    type: lowerType(a.type),
    severity: lowerSeverity(a.severity),
    status: lowerStatus(a.status),
    triggerLabel: a.triggerLabel,
    detail: a.detail ?? undefined,
    triggeredAt: a.triggeredAt.toISOString(),
    followUp: a.followUpRequestedAt
      ? { requestedAt: a.followUpRequestedAt.toISOString(), note: a.followUpNote ?? undefined }
      : null,
  };
}

/** Full view for the treating doctor: always includes the note, plus whether the patient can see it. */
export function alertForDoctor(a: any) {
  return {
    ...base(a),
    patientName: a.patient?.user?.name,
    patientPhone: a.patient?.phone ?? undefined,
    patientEmail: a.patient?.user?.email ?? undefined,
    clinicalNote: a.clinicalNote ?? undefined,
    noteSharedWithPatient: !!a.noteSharedWithPatient,
  };
}

/** Patient view: the clinical note is included ONLY if the doctor chose to share it. */
export function alertForPatient(a: any) {
  const shared = !!a.noteSharedWithPatient && !!a.clinicalNote;
  return {
    ...base(a),
    clinicalNote: shared ? a.clinicalNote : undefined,
    noteSharedWithPatient: shared,
  };
}