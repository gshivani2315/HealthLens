import { mockAlerts, mockPatients } from "../../mock/doctor";

// TODO (Teammate 3): build out the doctor experience here.
// - Login
// - Patient list (mockPatients above)
// - Alerts needing attention (mockAlerts above)
// - Individual patient view: historical BP, trend graph, AI explanation
// - Acknowledge alert
export default function DoctorDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">Doctor Dashboard</h1>
      <h2 className="mt-4 font-semibold">Patients</h2>
      <ul>
        {mockPatients.map((p) => (
          <li key={p.id}>
            {p.name} — {p.status}
          </li>
        ))}
      </ul>
      <h2 className="mt-4 font-semibold">Alerts</h2>
      <ul>
        {mockAlerts.map((a, i) => (
          <li key={i}>
            {a.patient}: {a.alert} ({a.severity})
          </li>
        ))}
      </ul>
    </div>
  );
}
