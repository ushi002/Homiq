"use client";
import { CARD, FILTER_SELECT } from '@/lib/ui';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';
import YoyChange from '@/components/YoyChange';

interface Cell {
    value: number | null;
    complete: boolean;
    missing_days?: number;
    period_days?: number;
}

interface Pair {
    current: Cell;
    previous: Cell;
}

interface UnitValue extends Pair {
    unit_of_measure: string;
    unusual?: { median_factor: number; previous_factor: number | null } | null;
}

interface SummaryUnit {
    id: string;
    unit_number: string;
    building_id: string;
    building_name: string;
    values: Record<string, UnitValue>;
}

interface Summary {
    units: SummaryUnit[];
    totals: Record<string, Pair>; // key "type|unit_of_measure": litres and m³ are never added up
    meter_types: { type: string; unit_of_measure: string }[];
    last_reading?: string | null; // latest reading of any of the units, whatever the period
}

// Meter types in the same order as on the other pages
const TYPE_ORDER = ['water_cold', 'water_hot', 'heat', 'electricity'];
const typeRank = (type: string) => {
    const i = TYPE_ORDER.indexOf(type);
    return i === -1 ? TYPE_ORDER.length : i;
};
const byType = <T,>(entries: [string, T][]) =>
    [...entries].sort(([a], [b]) => typeRank(a.split('|')[0]) - typeRank(b.split('|')[0]) || a.localeCompare(b));

// Fallback list when the summary cannot be loaded: just links to the units
export interface OwnedUnitLink {
    id: string;
    unit_number: string;
    building_id: string;
    building_name: string;
}

// Home page of an owner with several units: total consumption over all of them for a chosen
// period against the same period a year earlier, then the units by building with their values.
export default function OwnerSummary({ fallbackUnits }: { fallbackUnits: OwnedUnitLink[] }) {
    const { t, language } = useLanguage();
    const locale = language === 'cs' ? 'cs-CZ' : 'en-US';

    const currentYear = new Date().getFullYear();
    // Start with the last closed month; the current one is never complete yet
    const lastMonth = new Date(currentYear, new Date().getMonth() - 1, 1);
    const [year, setYear] = useState(lastMonth.getFullYear());
    const [month, setMonth] = useState(lastMonth.getMonth() + 1); // 0 = whole year
    const [data, setData] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [periodTouched, setPeriodTouched] = useState(false); // the owner chose a period: no automatic jump

    useEffect(() => {
        let stale = false; // a newer period was selected meanwhile
        setLoading(true);
        authFetch(`/units/summary?year=${year}${month ? `&month=${month}` : ''}`)
            .then(async res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (stale) return;
                setData(json);
                setFailed(false);
                // Without fresh data the last closed month is empty: open the month of the latest reading
                if (!periodTouched && json.last_reading) {
                    const last = new Date(json.last_reading);
                    if (last < new Date(year, month ? month - 1 : 0, 1)) {
                        setPeriodTouched(true);
                        setYear(last.getFullYear());
                        setMonth(last.getMonth() + 1);
                    }
                }
            })
            .catch(err => {
                console.error(err);
                if (!stale) setFailed(true);
            })
            .finally(() => { if (!stale) setLoading(false); });
        return () => { stale = true; };
    }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

    const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
    const monthName = (m: number) => new Date(2000, m - 1).toLocaleString(locale, { month: 'long' });
    const periodLabel = month ? `${monthName(month)} ${year}` : String(year);
    const format = (v: number | null) => v === null ? '–' : v.toLocaleString(locale, { maximumFractionDigits: 2 });

    // Previous/next month (or year with the whole year selected), within the offered years
    const shift = (delta: number) => {
        if (!month) {
            const y = year + delta;
            if (years.includes(y)) { setPeriodTouched(true); setYear(y); }
            return;
        }
        let m = month + delta;
        let y = year;
        if (m < 1) { m = 12; y -= 1; }
        if (m > 12) { m = 1; y += 1; }
        if (!years.includes(y)) return;
        setPeriodTouched(true);
        setYear(y);
        setMonth(m);
    };
    const now = new Date();
    const atLatest = month ? (year === currentYear && month >= now.getMonth() + 1) : year === currentYear;
    const atOldest = year === years[years.length - 1] && (!month || month === 1);

    const typeLabel = (type: string) => {
        if (type === 'water_cold') return t.building.categoryColdWater;
        if (type === 'water_hot') return t.building.categoryHotWater;
        if (type === 'heat') return t.building.categoryHeat;
        if (type === 'electricity') return t.consumption.categoryElectricity;
        return type;
    };
    const missingTitle = (c: Cell) => c.missing_days !== undefined
        ? t.unit.missingDays.replace('{{missing}}', String(c.missing_days)).replace('{{total}}', String(c.period_days))
        : t.unit.incompletePeriod;
    const comparable = (p: Pair) => p.current.complete && p.previous.complete && (p.previous.value ?? 0) > 0;
    const factor = (f: number) => f.toLocaleString(locale, { maximumFractionDigits: f < 10 ? 1 : 0 });

    // Units by building (the backend sorts them); without the summary the plain list is shown
    const units: OwnedUnitLink[] = data?.units ?? fallbackUnits;
    const groups = units.reduce((acc, u) => {
        const last = acc[acc.length - 1];
        if (last && last.building_id === u.building_id) last.units.push(u);
        else acc.push({ building_id: u.building_id, building_name: u.building_name, units: [u] });
        return acc;
    }, [] as { building_id: string; building_name: string; units: OwnedUnitLink[] }[]);
    const valuesOf = (id: string) => data?.units.find(u => u.id === id)?.values ?? {};

    const card = CARD;
    const arrow = 'px-2 py-1 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40';
    const totals = byType(Object.entries(data?.totals ?? {}));

    return (
        <>
            <section className={`${card} p-4 sm:p-6 mb-6`}>
                <div className="flex flex-wrap justify-between items-end gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-gray-800">{t.dashboard.totalFor.replace('{{period}}', periodLabel)}</h2>
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => shift(-1)} disabled={atOldest} className={arrow} aria-label={t.unit.prevPeriod} title={t.unit.prevPeriod}>‹</button>
                        <select value={month} onChange={e => { setPeriodTouched(true); setMonth(parseInt(e.target.value)); }} aria-label={t.consumption.period} className={FILTER_SELECT}>
                            <option value={0}>{t.consumption.wholeYear}</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{monthName(m)}</option>)}
                        </select>
                        <select value={year} onChange={e => { setPeriodTouched(true); setYear(parseInt(e.target.value)); }} aria-label={t.unit.year} className={FILTER_SELECT}>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                        <button type="button" onClick={() => shift(1)} disabled={atLatest} className={arrow} aria-label={t.unit.nextPeriod} title={t.unit.nextPeriod}>›</button>
                    </div>
                </div>

                {failed && <p className="text-sm text-red-600">{t.dashboard.summaryFailed}</p>}
                {!failed && !data && loading && <div className="h-20 bg-gray-200 rounded animate-pulse" aria-busy="true" />}
                {data && totals.length === 0 && <p className="text-sm text-gray-400">{t.unit.noData}</p>}
                {data && totals.length > 0 && (
                    <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 transition-opacity ${loading ? 'opacity-50' : ''}`}>
                        {totals.map(([key, pair]) => {
                            const [type, uom] = key.split('|');
                            return (
                                <div key={key} className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                                    <p className="text-xs font-bold text-blue-700 uppercase">{typeLabel(type)}</p>
                                    <p className="text-xl font-bold font-mono text-blue-900 mt-1">
                                        {format(pair.current.value)} <span className="text-xs font-sans font-normal">{uom}</span>
                                        {pair.current.value !== null && !pair.current.complete && <span className="text-gray-400 cursor-help" title={missingTitle(pair.current)}>*</span>}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        {t.unit.lastYear}: <span className="font-mono">{pair.previous.value === null ? '–' : `${format(pair.previous.value)} ${uom}`}</span>
                                        {pair.previous.value !== null && !pair.previous.complete && <span className="cursor-help" title={missingTitle(pair.previous)}>*</span>}
                                    </p>
                                    <p className="text-xs mt-0.5">
                                        {comparable(pair)
                                            ? <YoyChange current={pair.current.value as number} previous={pair.previous.value as number} previousYear={year - 1} />
                                            : pair.current.value !== null && <span className="text-gray-400">{t.consumption.noComparison}</span>}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            {groups.map(group => (
                <section key={group.building_id} className={`${card} p-4 sm:p-6 mb-4`}>
                    <h2 className="text-lg font-semibold text-gray-800">{group.building_name}</h2>
                    <ul className="mt-2 divide-y divide-gray-100">
                        {group.units.map(u => {
                            const values = byType(Object.entries(valuesOf(u.id)));
                            return (
                                <li key={u.id}>
                                    <Link href={`/units/${u.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 px-2 -mx-2 rounded-md hover:bg-gray-50">
                                        <span className="font-medium text-blue-700 w-full sm:w-32 shrink-0">{t.nav.unit} {u.unit_number}</span>
                                        {values.map(([type, v]) => (
                                            <span key={type} className="text-sm text-gray-600 whitespace-nowrap">
                                                <span className="text-gray-400">{typeLabel(type)}:</span>{' '}
                                                <span className="font-mono">{format(v.current.value)}</span> {v.current.value !== null && <span className="text-xs text-gray-400">{v.unit_of_measure}</span>}
                                                {v.current.value !== null && !v.current.complete && <span className="text-gray-400 cursor-help" title={missingTitle(v.current)}>*</span>}
                                                {comparable(v) && <> <YoyChange current={v.current.value as number} previous={v.previous.value as number} previousYear={year - 1} compact className="text-xs" /></>}
                                                {v.unusual && (
                                                    <span className="ml-1 text-red-700 cursor-help" title={`${t.unit.unusualTitle}: ${t.unit.unusualMedian.replace('{{factor}}', factor(v.unusual.median_factor))}`}>⚠</span>
                                                )}
                                            </span>
                                        ))}
                                        <span className="ml-auto text-gray-400" aria-hidden="true">→</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
            {units.length === 0 && (
                <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                    {t.dashboard.noUnits}
                </div>
            )}
        </>
    );
}
