import { cx, signed } from "@/lib/utils";
import { MetricChange } from "@/types";

interface Metric extends MetricChange {
  display: string;
}

export default function StatStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-line rounded border border-line bg-white sm:grid-cols-4">
      {metrics.map((m) => {
        const isUp = m.changeVsWeekAvg > 0;
        const isFlat = m.changeVsWeekAvg === 0;
        return (
          <div key={m.label} className="px-4 py-4 first:pl-4 sm:px-5">
            <div className="text-xs font-medium uppercase tracking-wide text-ink-400">{m.label}</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="font-mono tabular text-2xl font-semibold text-ink">{m.display}</span>
              <span className="text-xs text-ink-400">{m.unit}</span>
            </div>
            <div
              className={cx(
                "mt-1 inline-flex items-center gap-1 text-xs font-medium",
                isFlat ? "text-ink-400" : isUp ? "text-brick-500" : "text-moss-500"
              )}
            >
              <span>{isFlat ? "→" : isUp ? "↑" : "↓"}</span>
              <span className="tabular">
                {signed(m.changeVsWeekAvg, 1)} {m.unit} vs 7-day avg
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
