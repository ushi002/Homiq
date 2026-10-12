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

// Half up, exactly like the backend (_round in app/core/consumption.py)
const roundTo = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

const decimals = (v: number) => Math.min((String(v).split('.')[1] ?? '').length, 3);

const interpolate = (a: Point, b: Point, t: number) =>
    b.t === a.t ? a.v : a.v + (b.v - a.v) * (t - a.t) / (b.t - a.t);

interface MeterPeriod {
    value: number;
    coveredFrom: number;
    coveredTo: number;
    places: number;
}

// One meter in [start, end); null when it has no data for the period (backend: meter_period)
function meterPeriod(readings: Reading[], start: number, end: number): MeterPeriod | null {
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
    if (!first && !(before && after)) return null;

    const startValue = before ? interpolate(before, (first ?? after)!, start) : first!.v;
    const endValue = after ? interpolate((last ?? before)!, after, end) : last!.v;
    return {
        value: endValue - startValue,
        coveredFrom: before ? start : first!.t,
        coveredTo: after ? end : last!.t,
        places: Math.max(...[before, first, last, after].filter((p): p is Point => !!p).map(p => decimals(p.v))),
    };
}

// Meters of one type in a unit, e.g. an old and a new one after a replacement (backend:
// combine_meters). Covered from the earliest start to the latest end of its meters; a gap between
// them is in the middle of the period and not counted as missing.
// Each meter's readings sorted by time ascending; start/end as Date.UTC timestamps, period [start, end).
export function combinedConsumption(meters: Reading[][], start: number, end: number): PeriodConsumption {
    const periodDays = (end - start) / DAY;
    const none = { value: null, missingDays: periodDays, periodDays, complete: false };
    if (end <= start) return none;
    const known = meters.map(r => meterPeriod(r, start, end)).filter((m): m is MeterPeriod => m !== null);
    if (known.length === 0) return none;

    const coveredFrom = Math.min(...known.map(m => m.coveredFrom));
    const coveredTo = Math.max(...known.map(m => m.coveredTo));
    const value = roundTo(known.reduce((sum, m) => sum + m.value, 0), Math.max(...known.map(m => m.places)));
    const missingDays = roundTo(((coveredFrom - start) + (end - coveredTo)) / DAY, 1);
    return { value, missingDays, periodDays, complete: missingDays <= periodDays * (1 - COVERAGE_THRESHOLD) };
}

export const periodConsumption = (readings: Reading[], start: number, end: number): PeriodConsumption =>
    combinedConsumption([readings], start, end);

// Period boundaries in UTC, matching the daily readings (stamped at midnight UTC) and the backend
export const monthBounds = (year: number, month: number): [number, number] => [Date.UTC(year, month - 1, 1), Date.UTC(year, month, 1)];

export const isoWeekBounds = (year: number, week: number): [number, number] => {
    const jan4 = Date.UTC(year, 0, 4);
    const mondayOfWeek1 = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY;
    const start = mondayOfWeek1 + (week - 1) * 7 * DAY;
    return [start, start + 7 * DAY];
};
