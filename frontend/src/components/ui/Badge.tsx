import { cx } from "@/lib/utils";

type Tone = "normal" | "moderate" | "critical" | "info" | "caution" | "neutral";

const toneStyles: Record<Tone, string> = {
  normal: "bg-moss-50 text-moss-600 border-moss-100",
  moderate: "bg-amber-50 text-amber-600 border-amber-100",
  critical: "bg-brick-50 text-brick-600 border-brick-100",
  info: "bg-teal-50 text-teal-600 border-teal-100",
  caution: "bg-amber-50 text-amber-600 border-amber-100",
  neutral: "bg-ink-50 text-ink-500 border-ink-100",
};

export default function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium",
        toneStyles[tone]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}
