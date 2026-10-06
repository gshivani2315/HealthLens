import { NavLink } from "react-router-dom";
import { cx } from "@/lib/utils";
import { icons } from "./icons";
import { NavItem } from "./Sidebar";

export default function BottomTabBar({ items }: { items: NavItem[] }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-line bg-white lg:hidden">
      {items.map((item) => {
        const Icon = icons[item.icon];
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cx(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
                isActive ? "text-teal-600" : "text-ink-400"
              )
            }
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
