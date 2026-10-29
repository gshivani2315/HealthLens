import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cx, timeAgo } from "@/lib/utils";
import { notificationsService } from "@/services/notificationsService";
import { AppNotification, AlertItem } from "@/types";

export default function NotificationBell({ items = [] }: { items?: AlertItem[] }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  function loadNotifications() {
    notificationsService
      .getNotifications()
      .then((res) => {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => {
        // Fallback to alert items if notification fetch fails
        setUnreadCount(items.filter((i) => i.status === "unread").length);
      });
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // 30s poll for in-app bell
    return () => clearInterval(interval);
  }, []);

  async function handleMarkRead(id: string) {
    try {
      await notificationsService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error("Failed to mark notification as read", err);
    }
  }

  async function handleMarkAll() {
    try {
      await notificationsService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all notifications as read", err);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) loadNotifications();
        }}
        aria-label={`Notifications, ${unreadCount} unread`}
        className="relative flex h-9 w-9 items-center justify-center rounded hover:bg-ink-50 text-ink"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brick-500 px-1 text-[10px] font-semibold text-white animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-84 sm:w-96 rounded-xl border border-line bg-white p-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-line pb-2 px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-500">
                Notifications ({unreadCount} unread)
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-84 overflow-y-auto divide-y divide-line/60">
              {notifications.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-ink-400">
                  You are all caught up! No notifications right now.
                </p>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleMarkRead(item.id)}
                    className={cx(
                      "flex items-start gap-2.5 p-2.5 transition-colors cursor-pointer hover:bg-ink-50/80 rounded-lg",
                      !item.read ? "bg-teal-50/40" : "opacity-80"
                    )}
                  >
                    <span
                      className={cx(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        item.type === "CRITICAL_ALERT" && "bg-brick-500",
                        item.type === "VISIT_REQUEST" && "bg-amber-500",
                        item.type === "CARE_ASSIGNMENT" && "bg-green-600",
                        item.type === "CHAT" && "bg-blue-500",
                        item.type === "SYSTEM" && "bg-teal-500"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cx("text-xs font-semibold truncate", !item.read ? "text-ink" : "text-ink-600")}>
                          {item.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-ink-400">
                          {timeAgo(item.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-ink-500 line-clamp-2 mt-0.5">{item.message}</p>
                      {item.link && (
                        <Link
                          to={item.link}
                          onClick={() => setOpen(false)}
                          className="mt-1 inline-block text-[11px] font-medium text-teal-600 hover:underline"
                        >
                          View details →
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
