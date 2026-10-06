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
    <Tag className={cx("rounded border border-line bg-white", padded && "p-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, action, subtitle }: { title: string; action?: React.ReactNode; subtitle?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-sm text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
