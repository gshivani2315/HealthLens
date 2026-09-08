import { mockPatient, mockReadings } from "../../mock/patient";

// TODO (Teammate 2): build out the patient experience here.
// - Login
// - Enter BP reading (form -> POST /api/vitals eventually)
// - Recent + historical readings (mockReadings above)
// - BP chart (Recharts)
// - Current trend/status
// - Weekly summary
export default function PatientDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">Patient Dashboard</h1>
      <p>Name: {mockPatient.name}</p>
      <p>Latest BP: {mockPatient.bp}</p>
      <p>Status: {mockPatient.status}</p>
      <p className="mt-4 text-sm text-gray-500">
        {mockReadings.length} sample readings loaded from mock data.
      </p>
    </div>
  );
}
