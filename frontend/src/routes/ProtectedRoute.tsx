import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types";
import Spinner from "@/components/ui/Spinner";

export default function ProtectedRoute({ role }: { role: UserRole }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) {
    return <Navigate to={user.role === "doctor" ? "/doctor/dashboard" : "/patient/dashboard"} replace />;
  }

  return <Outlet />;
}
