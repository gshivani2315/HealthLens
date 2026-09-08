import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import PatientDashboard from "./pages/patient/PatientDashboard";
import DoctorDashboard from "./pages/doctor/DoctorDashboard";

export default function App() {
  return (
    <BrowserRouter>
      <nav className="p-4 flex gap-4 border-b">
        <Link to="/patient">Patient</Link>
        <Link to="/doctor">Doctor</Link>
      </nav>
      <Routes>
        <Route path="/patient" element={<PatientDashboard />} />
        <Route path="/doctor" element={<DoctorDashboard />} />
        <Route path="/" element={<PatientDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
