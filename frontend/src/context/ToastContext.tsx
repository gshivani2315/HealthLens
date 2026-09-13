import { createContext, ReactNode, useCallback, useContext, useState } from "react";
import { cx } from "@/lib/utils";

interface Toast {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}

interface ToastContextValue {
  showToast: (message: string, tone?: Toast["tone"]) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2 sm:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              "min-w-[240px] rounded border px-4 py-3 text-sm shadow-lg animate-[fadeIn_.15s_ease-out]",
              t.tone === "success" && "border-moss-100 bg-white text-ink",
              t.tone === "error" && "border-brick-100 bg-white text-brick-600",
              t.tone === "info" && "border-line bg-white text-ink"
            )}
          >
            <span
              className={cx(
                "mr-2 inline-block h-2 w-2 rounded-full align-middle",
                t.tone === "success" && "bg-moss-500",
                t.tone === "error" && "bg-brick-500",
                t.tone === "info" && "bg-teal-500"
              )}
            />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
