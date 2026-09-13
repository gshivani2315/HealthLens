import { cx } from "@/lib/utils";

export default function Spinner({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cx("animate-spin rounded-full border-2 border-ink-100 border-t-teal-500", className)}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
