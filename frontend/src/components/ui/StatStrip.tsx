import { cx, signed } from "@/lib/utils";
import { MetricChange } from "@/types";

interface Metric extends MetricChange {
  display: string;
}

export default function StatStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line/80 bg-line/70 shadow-panel sm:grid-cols-4">
      {metrics.map((m) => {
        const isUp = m.changeVsWeekAvg > 0;
        const isFlat = m.changeVsWeekAvg === 0;
        return (
          <div key={m.label} className="metric-tile bg-white px-4 py-5 transition-colors hover:bg-[#FFFEFC] sm:px-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-ink-400">{m.label}</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="font-mono tabular text-[1.8rem] font-medium tracking-tight text-ink sm:text-3xl">{m.display}</span>
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
