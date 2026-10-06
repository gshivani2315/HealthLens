import { NavLink } from "react-router-dom";
import { cx } from "@/lib/utils";
import { icons } from "./icons";

export interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof icons;
  badge?: number;
}

export default function Sidebar({
  items,
  brand,
  brandSub,
}: {
  items: NavItem[];
  brand: string;
  brandSub: string;
}) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-line px-5">
        <span className="flex h-7 w-7 items-center justify-center rounded bg-teal-500">
          <PulseMark />
        </span>
        <div className="leading-tight">
          <p className="font-display text-sm font-semibold text-ink">{brand}</p>
          <p className="text-[11px] text-ink-400">{brandSub}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = icons[item.icon];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cx(
                  "flex items-center justify-between rounded px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-teal-50 text-teal-600" : "text-ink-500 hover:bg-ink-50 hover:text-ink"
                )
              }
            >
              <span className="flex items-center gap-3">
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </span>
              {!!item.badge && (
                <span className="rounded-full bg-brick-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}

function PulseMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
      <path d="M2 12h4l2-7 4 14 2-9 2 5h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
