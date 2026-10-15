import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import Sidebar, { NavItem } from "./Sidebar";
import BottomTabBar from "./BottomTabBar";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import { patientsService } from "@/services/patientsService";
import { AlertItem } from "@/types";

const navItems: NavItem[] = [
  { to: "/doctor/dashboard", label: "Patients", icon: "patients" },
  { to: "/doctor/alerts", label: "Alerts", icon: "alerts" },
];

export default function DoctorLayout() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    patientsService.getDoctorOverview(user?.id).then((o) => setAlerts(o.urgentAlerts)).catch(() => setAlerts([]));
  }, [user?.id]);

  const withBadge = navItems.map((n) =>
    n.to === "/doctor/alerts" ? { ...n, badge: alerts.filter((a) => a.status === "unread").length || undefined } : n
  );

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) navigate(`/doctor/dashboard?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="flex min-h-screen bg-[#E8EEE8]">
      <Sidebar items={withBadge} brand="HealthLens" brandSub="Clinical" />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between gap-4 border-b border-[#D2DDD4] bg-[#E8EEE8]/90 px-4 backdrop-blur-xl sm:px-7">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#344B3C] text-xs font-bold text-white">
              H
            </span>
          </div>
          <form onSubmit={handleSearch} className="hidden max-w-sm flex-1 lg:block">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patients by name or ID"
              className="w-full input"
            />
          </form>
          <div className="flex items-center gap-1.5">
            <NotificationBell items={alerts} />
            <UserMenu profileHref="/doctor/profile" settingsHref="/doctor/settings" />
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-7 sm:pt-7 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomTabBar items={withBadge} />
    </div>
  );
}
