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
    <aside className="hidden w-64 shrink-0 flex-col border-r border-[#303638] bg-[#252A2D] text-white lg:flex">
      <div className="flex h-[76px] items-center gap-3 border-b border-white/10 px-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#315846] shadow-sm ring-1 ring-white/10">
          <PulseMark />
        </span>
        <div className="leading-tight">
          <p className="font-display text-base font-semibold text-white">{brand}</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/45">{brandSub}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1.5 px-3 py-5">
        {items.map((item) => {
          const Icon = icons[item.icon];
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cx(
                  "flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-200",
                  isActive ? "bg-[#454B4F] text-white shadow-inner ring-1 ring-white/5" : "text-white/60 hover:bg-white/10 hover:text-white"
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
