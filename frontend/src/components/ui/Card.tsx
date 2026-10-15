import { cx } from "@/lib/utils";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  as?: "div" | "form";
} & React.HTMLAttributes<HTMLElement>;

export default function Card({ children, className, padded = true, as = "div", ...rest }: CardProps) {
  const Tag = as as any;
  return (
    <Tag className={cx("rounded-2xl border border-line/80 bg-white shadow-panel transition-shadow duration-300 hover:shadow-[0_8px_28px_rgba(53,45,34,0.055)]", padded && "p-5 sm:p-6", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, action, subtitle }: { title: string; action?: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-lg font-normal text-ink">{title}</h3>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
