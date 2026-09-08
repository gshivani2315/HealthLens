// Mock data for doctor-frontend dev. Swap for GET /api/doctor/patients
// and GET /api/doctor/alerts once the real API exists.

export const mockAlerts = [
  {
    patient: "Alex",
    alert: "Rising blood-pressure trend",
    severity: "HIGH",
    currentAverage: "149/92",
    previousAverage: "134/84",
    consecutiveElevatedReadings: 5,
  },
];

export const mockPatients = [
  { id: "1", name: "Alex", status: "Needs attention" },
  { id: "2", name: "Sam", status: "Stable" },
];
