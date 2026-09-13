import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendPoint } from "@/types";
import { formatDate } from "@/lib/utils";

export default function WeightSleepChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
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
            yAxisId="sleep"
            domain={[0, 10]}
            tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#4E6982" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <YAxis
            yAxisId="weight"
            orientation="right"
            domain={["dataMin - 4", "dataMax + 4"]}
            tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#4E6982" }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          <Tooltip
            contentStyle={{ borderRadius: 6, borderColor: "#D8DBD6", fontSize: 12, fontFamily: "IBM Plex Mono" }}
            labelFormatter={(v) => formatDate(v, "MMM d, yyyy")}
          />
          <Bar yAxisId="sleep" dataKey="sleepHours" fill="#C7DEDC" radius={[2, 2, 0, 0]} name="Sleep (hrs)" barSize={10} />
          <Line yAxisId="weight" type="monotone" dataKey="weightKg" stroke="#10233A" strokeWidth={2} dot={false} name="Weight (kg)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
