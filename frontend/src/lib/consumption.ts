// Consumption of a period from cumulative meter readings.
// Same rule as backend/app/core/consumption.py (the building overview), keep them in sync:
// - The meter state at a period boundary is interpolated linearly between the nearest reading
//   before and after it, so a missing reading on the 1st or a gap across the boundary does not matter.
// - Without a reading before the start (the meter started recording inside the period) the period
//   starts at its first reading; without a reading after the end it ends at the last one. Those
//   days at the edges are missing; gaps in the middle are not counted.
// - A value is complete when at most 3 % of the period's days are missing.

export interface Reading {
    time: string;
    value: number;
}

export interface PeriodConsumption {
    value: number | null;
    missingDays: number;
    periodDays: number;
    complete: boolean;
}

export const COVERAGE_THRESHOLD = 0.97;
const DAY = 86400000;
// How far around a period to look for the readings its boundaries are interpolated from
const BEFORE_WINDOW = 366 * DAY;
const AFTER_WINDOW = 62 * DAY;

interface Point {
    t: number;
    v: number;
}

const decimals = (v: number) => Math.min((String(v).split('.')[1] ?? '').length, 3);

const interpolate = (a: Point, b: Point, t: number) =>
    b.t === a.t ? a.v : a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);

// readings sorted by time ascending; start/end as Date.UTC timestamps, period is [start, end)
export function periodConsumption(readings: Reading[], start: number, end: number): PeriodConsumption {
    const periodDays = (end - start) / DAY;
    const none = { value: null, missingDays: periodDays, periodDays, complete: false };
    if (end <= start) return none;

    let before: Point | undefined;
    let first: Point | undefined;
    let last: Point | undefined;
    let after: Point | undefined;
    for (const r of readings) {
        const p = { t: Date.parse(r.time), v: r.value };
        if (p.t < start) {
            if (p.t >= start - BEFORE_WINDOW) before = p;
        } else if (p.t < end) {
            first ??= p;
            last = p;
        } else {
            if (p.t < end + AFTER_WINDOW) after = p;
            break;
        }
    }
    if (!first && !(before && after)) return none;

    const startValue = before ? interpolate(before, (first ?? after)!, start) : first!.v;
    const coveredFrom = before ? start : first!.t;
    const endValue = after ? interpolate((last ?? before)!, after, end) : last!.v;
    const coveredTo = after ? end : last!.t;

    const places = Math.max(...[before, first, last, after].filter((p): p is Point => !!p).map(p => decimals(p.v)));
    const value = Number((endValue - startValue).toFixed(places));
    const missingDays = Math.round(((coveredFrom - start) + (end - coveredTo)) / DAY * 10) / 10;
    return { value, missingDays, periodDays, complete: missingDays <= periodDays * (1 - COVERAGE_THRESHOLD) };
}

// Period boundaries in UTC, matching the daily readings (stamped at midnight UTC) and the backend
export const monthBounds = (year: number, month: number): [number, number] => [Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1)];

export const isoWeekBounds = (year: number, week: number): [number, number] => {
    const jan4 = Date.UTC(year, 0, 4);
    const mondayOfWeek1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
    const start = mondayOfWeek1 + (week - 1) * 7 * DAY;
    return [start, start + 7 * DAY];
};
