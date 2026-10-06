import { CLINICAL, DAY_MS } from "./constants";

export interface BpPoint {
  recordedAt: Date;
  systolic: number;
  diastolic: number;
}
export interface DailyBp {
  date: string; // YYYY-MM-DD (UTC)
  systolic: number;
  diastolic: number;
}
export interface BpAvg {
  systolic: number;
  diastolic: number;
}

export interface BpTrend {
  readingCount: number;
  spanDays: number;
  currentAvg: BpAvg | null; // last 7 days
  previousAvg: BpAvg | null; // the 7 days before that
  systolicChange: number | null;
  slopePerDay: number; // least-squares slope of daily mean systolic, mmHg/day
  r2: number; // how well a straight line explains the series (0..1)
  consecutiveElevated: number; // latest unbroken run of "elevated" readings
  daily: DailyBp[];
}

// ─────────── small stats helpers (shared with the weekly summary) ───────────

export const round1 = (n: number) => Math.round(n * 10) / 10;
export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export const nums = (xs: Array<number | null | undefined>): number[] =>
  xs.filter((x): x is number => typeof x === "number");

export function summarize(xs: Array<number | null | undefined>) {
  const v = nums(xs);
  if (v.length === 0) return null;
  return {
    count: v.length,
    mean: round1(mean(v)),
    min: Math.min(...v),
    max: Math.max(...v),
    first: v[0],
    last: v[v.length - 1],
  };
}

function regress(xs: number[], ys: number[]) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return { slope: 0, r2: 0 };
  return { slope: sxy / sxx, r2: (sxy * sxy) / (sxx * syy) };
}

function windowAvg(points: BpPoint[], fromExclusive: number, toInclusive: number): BpAvg | null {
  const w = points.filter((p) => {
    const t = p.recordedAt.getTime();
    return t > fromExclusive && t <= toInclusive;
  });
  if (w.length < CLINICAL.minReadingsPerWindow) return null;
  return {
    systolic: round1(mean(w.map((p) => p.systolic))),
    diastolic: round1(mean(w.map((p) => p.diastolic))),
  };
}

/** `points` must be ascending by time. */
export function analyzeBpTrend(points: BpPoint[]): BpTrend {
  if (points.length === 0) {
    return {
      readingCount: 0,
      spanDays: 0,
      currentAvg: null,
      previousAvg: null,
      systolicChange: null,
      slopePerDay: 0,
      r2: 0,
      consecutiveElevated: 0,
      daily: [],
    };
  }

  const asOf = points[points.length - 1].recordedAt.getTime();
  const currentAvg = windowAvg(points, asOf - 7 * DAY_MS, asOf);
  const previousAvg = windowAvg(points, asOf - 14 * DAY_MS, asOf - 7 * DAY_MS);
  const systolicChange = currentAvg && previousAvg ? round1(currentAvg.systolic - previousAvg.systolic) : null;

  // Daily means so that multiple readings on one day don't dominate the slope
  const byDay = new Map<string, { sys: number[]; dia: number[] }>();
  for (const p of points) {
    const key = p.recordedAt.toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { sys: [], dia: [] };
    entry.sys.push(p.systolic);
    entry.dia.push(p.diastolic);
    byDay.set(key, entry);
  }
  const daily: DailyBp[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, e]) => ({ date, systolic: round1(mean(e.sys)), diastolic: round1(mean(e.dia)) }));

  const t0 = Date.parse(daily[0].date);
  const spanDays = Math.round((Date.parse(daily[daily.length - 1].date) - t0) / DAY_MS) + 1;

  let slopePerDay = 0;
  let r2 = 0;
  if (daily.length >= CLINICAL.minDaysForSlope) {
    const fit = regress(
      daily.map((d) => (Date.parse(d.date) - t0) / DAY_MS),
      daily.map((d) => d.systolic)
    );
    slopePerDay = fit.slope;
    r2 = fit.r2;
  }

  let consecutiveElevated = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    if (p.systolic >= CLINICAL.elevatedSystolic || p.diastolic >= CLINICAL.elevatedDiastolic) consecutiveElevated++;
    else break;
  }

  return {
    readingCount: points.length,
    spanDays,
    currentAvg,
    previousAvg,
    systolicChange,
    slopePerDay,
    r2,
    consecutiveElevated,
    daily,
  };
}

/** Cheap gate in front of the LLM. Returns why Gemini should look, or null if nothing looks off. */
export function shouldAskAi(t: BpTrend): string | null {
  if (t.consecutiveElevated >= CLINICAL.consecutiveElevatedMin) return "consecutive_elevated_readings";
  if (t.systolicChange !== null && t.systolicChange >= CLINICAL.weeklyRiseMmHg) return "week_over_week_rise";
  if (t.daily.length >= CLINICAL.minDaysForSlope && t.slopePerDay >= CLINICAL.slopeMinPerDay && t.r2 >= CLINICAL.slopeMinR2)
    return "sustained_upward_slope";
  return null;
}
