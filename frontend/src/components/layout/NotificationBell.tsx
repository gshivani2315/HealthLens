import { useState } from "react";
import { cx, timeAgo } from "@/lib/utils";
import { AlertItem } from "@/types";

export default function NotificationBell({ items }: { items: AlertItem[] }) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((i) => i.status === "unread").length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications, ${unread} unread`}
        className="relative flex h-9 w-9 items-center justify-center rounded hover:bg-ink-50"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brick-500 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded border border-line bg-white p-2 shadow-lg">
            <div className="px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">
              Notifications
            </div>
            {items.length === 0 && <p className="px-2 py-4 text-sm text-ink-400">You're all caught up.</p>}
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {items.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded px-2 py-2 hover:bg-ink-50">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cx(
                        "h-1.5 w-1.5 rounded-full",
                        item.severity === "critical" && "bg-brick-500",
                        item.severity === "caution" && "bg-amber-500",
                        item.severity === "info" && "bg-teal-500"
                      )}
                    />
                    <p className="flex-1 text-sm text-ink">{item.triggerLabel}</p>
                    <span className="whitespace-nowrap text-xs text-ink-400">{timeAgo(item.triggeredAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
