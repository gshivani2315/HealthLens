import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
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
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    patientsService.getDoctorOverview().then((o) => setAlerts(o.urgentAlerts)).catch(() => setAlerts([]));
  }, []);

  const withBadge = navItems.map((n) =>
    n.to === "/doctor/alerts" ? { ...n, badge: alerts.filter((a) => a.status === "unread").length || undefined } : n
  );

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) navigate(`/doctor/dashboard?q=${encodeURIComponent(search.trim())}`);
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar items={withBadge} brand="HealthLens" brandSub="Clinical" />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-ink-600 text-xs font-bold text-white">
              H
            </span>
          </div>
          <form onSubmit={handleSearch} className="hidden max-w-sm flex-1 lg:block">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patients by name or ID"
              className="w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-400 focus:border-teal-400 focus:bg-white focus:outline-none"
            />
          </form>
          <div className="flex items-center gap-1.5">
            <NotificationBell items={alerts} />
            <UserMenu profileHref="/doctor/dashboard" />
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomTabBar items={withBadge} />
    </div>
  );
}
