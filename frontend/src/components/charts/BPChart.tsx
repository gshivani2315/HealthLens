import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendPoint } from "@/types";
import { formatDate } from "@/lib/utils";

export default function BPChart({ data, showThreshold }: { data: TrendPoint[]; showThreshold?: boolean }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#E7EAE5" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => formatDate(v, "MMM d")}
            tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#4E6982" }}
            axisLine={{ stroke: "#D8DBD6" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[50, 180]}
            tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#4E6982" }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          {showThreshold && (
            <>
              <ReferenceArea y1={130} y2={160} fill="#C98A2C" fillOpacity={0.06} />
              <ReferenceArea y1={160} y2={180} fill="#C4432B" fillOpacity={0.07} />
            </>
          )}
          <Tooltip
            contentStyle={{ borderRadius: 6, borderColor: "#D8DBD6", fontSize: 12, fontFamily: "IBM Plex Mono" }}
            labelFormatter={(v) => formatDate(v, "MMM d, yyyy")}
          />
          <Line type="monotone" dataKey="systolic" stroke="#C4432B" strokeWidth={2} dot={false} name="Systolic" />
          <Line type="monotone" dataKey="diastolic" stroke="#0F6B66" strokeWidth={2} dot={false} name="Diastolic" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
