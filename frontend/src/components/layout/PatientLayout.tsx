import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar, { NavItem } from "./Sidebar";
import BottomTabBar from "./BottomTabBar";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import { useAuth } from "@/context/AuthContext";
import { insightsService } from "@/services/insightsService";
import { AlertItem } from "@/types";

const navItems: NavItem[] = [
  { to: "/patient/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/patient/log-vitals", label: "Log Vitals", icon: "log" },
  { to: "/patient/trends", label: "Trends", icon: "trends" },
  { to: "/patient/insights", label: "Insights", icon: "insights" },
];

export default function PatientLayout() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  useEffect(() => {
    if (!user) return;
    insightsService.getAlertHistory(user.id).then(setAlerts).catch(() => setAlerts([]));
  }, [user]);

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar items={navItems} brand="HealthLens" brandSub="Patient" />
      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-teal-500 text-xs font-bold text-white">
              H
            </span>
            <span className="font-display text-sm font-semibold text-ink">HealthLens</span>
          </div>
          <p className="hidden font-display text-sm font-medium text-ink-500 lg:block">
            Welcome back, {user?.name?.split(" ")[0]}
          </p>
          <div className="flex items-center gap-1.5">
            <NotificationBell items={alerts} />
            <UserMenu profileHref="/patient/profile" />
          </div>
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomTabBar items={navItems} />
    </div>
  );
}
