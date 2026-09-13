import { CartesianGrid, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { TrendPoint } from "@/types";
import { formatDate } from "@/lib/utils";

export default function GlucoseChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#E7EAE5" vertical={false} />
          <XAxis
            dataKey="date"
            type="category"
            tickFormatter={(v) => formatDate(v, "MMM d")}
            tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#4E6982" }}
            axisLine={{ stroke: "#D8DBD6" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            dataKey="glucose"
            domain={[60, 220]}
            tick={{ fontSize: 11, fontFamily: "IBM Plex Mono", fill: "#4E6982" }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          <ReferenceArea y1={70} y2={130} fill="#3D7A4E" fillOpacity={0.06} />
          <ReferenceArea y1={180} y2={220} fill="#C4432B" fillOpacity={0.07} />
          <Tooltip
            contentStyle={{ borderRadius: 6, borderColor: "#D8DBD6", fontSize: 12, fontFamily: "IBM Plex Mono" }}
            labelFormatter={(v) => formatDate(v, "MMM d, yyyy")}
          />
          <Scatter data={data} fill="#0F6B66" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
