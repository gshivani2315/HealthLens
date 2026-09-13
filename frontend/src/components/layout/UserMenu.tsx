import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function UserMenu({ profileHref }: { profileHref: string }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const initials = (user?.name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-600 text-xs font-semibold text-white"
        aria-label="Account menu"
      >
        {initials}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-52 rounded border border-line bg-white p-1.5 shadow-lg">
            <div className="border-b border-line px-3 py-2">
              <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
              <p className="truncate text-xs text-ink-400">{user?.email}</p>
            </div>
            <Link
              to={profileHref}
              onClick={() => setOpen(false)}
              className="block rounded px-3 py-2 text-sm text-ink hover:bg-ink-50"
            >
              My profile
            </Link>
            <button
              onClick={() => setOpen(false)}
              className="block w-full rounded px-3 py-2 text-left text-sm text-ink hover:bg-ink-50"
            >
              Account settings
            </button>
            <button
              onClick={logout}
              className="block w-full rounded px-3 py-2 text-left text-sm text-brick-600 hover:bg-brick-50"
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
