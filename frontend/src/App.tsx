import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import ProtectedRoute from "@/routes/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import PatientLayout from "@/components/layout/PatientLayout";
import PatientDashboard from "@/pages/patient/Dashboard";
import LogVitals from "@/pages/patient/LogVitals";
import Trends from "@/pages/patient/Trends";
import Insights from "@/pages/patient/Insights";
import Profile from "@/pages/patient/Profile";
import DoctorLayout from "@/components/layout/DoctorLayout";
import DoctorDashboard from "@/pages/doctor/Dashboard";
import PatientDetail from "@/pages/doctor/PatientDetail";
import Alerts from "@/pages/doctor/Alerts";
import Thresholds from "@/pages/doctor/Thresholds";

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "doctor" ? "/doctor/dashboard" : "/patient/dashboard"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute role="patient" />}>
            <Route element={<PatientLayout />}>
              <Route path="/patient/dashboard" element={<PatientDashboard />} />
              <Route path="/patient/log-vitals" element={<LogVitals />} />
              <Route path="/patient/trends" element={<Trends />} />
              <Route path="/patient/insights" element={<Insights />} />
              <Route path="/patient/profile" element={<Profile />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute role="doctor" />}>
            <Route element={<DoctorLayout />}>
              <Route path="/doctor/dashboard" element={<DoctorDashboard />} />
              <Route path="/doctor/patients/:id" element={<PatientDetail />} />
              <Route path="/doctor/patients/:id/thresholds" element={<Thresholds />} />
              <Route path="/doctor/alerts" element={<Alerts />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
