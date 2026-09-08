// Mock data so patient-frontend dev can build UI before the real
// backend API exists. Swap for a real fetch to GET /api/patients/me
// once it's ready.

export const mockPatient = {
  name: "Alex",
  bp: "145/90",
  status: "Needs attention",
};

export const mockReadings = [
  { date: "2026-08-25", systolic: 128, diastolic: 82 },
  { date: "2026-08-26", systolic: 132, diastolic: 84 },
  { date: "2026-08-27", systolic: 137, diastolic: 86 },
  { date: "2026-08-28", systolic: 142, diastolic: 89 },
  { date: "2026-08-29", systolic: 146, diastolic: 91 },
  { date: "2026-08-30", systolic: 150, diastolic: 93 },
  { date: "2026-08-31", systolic: 153, diastolic: 95 },
];
