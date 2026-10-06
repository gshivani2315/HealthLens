import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";

interface Point {
  date: string;
  systolic: number;
  diastolic: number;
  glucose: number;
}

export default function TrendSparkline({ data }: { data: Point[] }) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <YAxis hide domain={["dataMin - 8", "dataMax + 8"]} />
          <Tooltip
            contentStyle={{ borderRadius: 6, borderColor: "#D8DBD6", fontSize: 12, fontFamily: "IBM Plex Mono" }}
            labelFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          />
          <Line type="monotone" dataKey="systolic" stroke="#C4432B" strokeWidth={2} dot={false} name="Systolic" />
          <Line type="monotone" dataKey="diastolic" stroke="#0F6B66" strokeWidth={2} dot={false} name="Diastolic" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
