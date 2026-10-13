"use client";
import { BUTTON_SECONDARY, CARD, EMPTY_STATE, FILTER_LABEL, FILTER_SELECT, LABEL, PAGE } from '@/lib/ui';
import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import UserSelect from '@/components/UserSelect';
import ConsumptionChart from '@/components/ConsumptionChart';
import Breadcrumbs from '@/components/Breadcrumbs';
import { buildCsv, downloadCsv, fileSlug } from '@/lib/csv';
import YoyChange from '@/components/YoyChange';
import { combinedConsumption, monthBounds, isoWeekBounds } from '@/lib/consumption';
import { usePageTitle } from '@/lib/pageTitle';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { useApiError } from '@/lib/apiError';

interface Meter {
    id: string;
    serial_number: string;
    type: string;
    unit_of_measure: string;
}

interface Reading {
    id: number;
    value: number;
    time: string;
    is_manual: boolean;
}

interface MeterWithReadings extends Meter {
    recent_readings: Reading[];
}

// Helper: Get Week Number
const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

// Helper: Get ISO Week Year
const getISOWeekYear = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return d.getUTCFullYear();
};

export default function UnitDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [meters, setMeters] = useState<MeterWithReadings[]>([]);
    const [unit, setUnit] = useState<any>(null); // Ideally separate Unit interface
    const [buildingName, setBuildingName] = useState<string | null>(null);
    const [metersLoading, setMetersLoading] = useState(true);
    const [readingsLoading, setReadingsLoading] = useState(true);
    const [unitError, setUnitError] = useState('');
    const [ownerFormOpen, setOwnerFormOpen] = useState(false);
    const { user, token, isLoading: authLoading } = useAuth(); // Get current user
    const router = useRouter();
    const { t, language } = useLanguage();
    const toast = useToast();
    const apiError = useApiError();
    usePageTitle(unit?.unit_number ? `${t.nav.unit} ${unit.unit_number}` : null);

    useEffect(() => {
        if (authLoading) return;
        if (!token) {
            router.push('/login');
            return;
        }
        // 1. Fetch unit info
        authFetch(`/units/${id}`)
            .then(async res => {
                if (!res.ok) throw new Error(String(res.status));
                return res.json();
            })
            .then(data => {
                setUnit(data);
                // Building name for the breadcrumbs
                return authFetch(`/buildings/${data.building_id}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(b => setBuildingName(b?.name ?? null));
            })
            .catch(err => {
                console.error(err);
                // 403/404: the unit does not exist or belongs to someone else
                setUnitError(['403', '404'].includes(err.message) ? t.unit.notFound : t.messages.errorGeneric);
            });

        // 2. Meters (fast, from SQL), then their readings (slower, from InfluxDB)
        const fetchMeters = async () => {
            try {
                const res = await authFetch(`/telemetry/meters/?unit_id=${id}`);
                if (!res.ok) throw new Error(String(res.status));
                const unitMeters: any[] = await res.json();

                // Set meters immediately with empty readings to show structure
                setMeters(unitMeters.map(m => ({ ...m, recent_readings: [] })));
                setMetersLoading(false);

                // 2. Fetch Readings from Influx (Direct, One Call)
                try {
                    const readingsRes = await authFetch(`/units/${id}/readings_influx`);
                    const readingsMap = await readingsRes.json();

                    // Merge measurements
                    const metersWithReadings = unitMeters.map(meter => ({
                        ...meter,
                        recent_readings: readingsMap[meter.id] || []
                    }));

                    setMeters(metersWithReadings);

                    // Open on the latest month/week with data: without fresh readings the current
                    // month would be empty
                    const latest = Math.max(...metersWithReadings.flatMap(m => m.recent_readings.map((r: Reading) => Date.parse(r.time))));
                    if (Number.isFinite(latest)) {
                        const d = new Date(latest);
                        const now = new Date();
                        if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) {
                            setSelectedYear(d.getFullYear());
                            setSelectedMonth(d.getMonth() + 1);
                        }
                        if (getISOWeekYear(d) !== getISOWeekYear(now) || getWeekNumber(d) !== getWeekNumber(now)) {
                            // The week selector is per year: keep the week within the year shown
                            setSelectedWeek(getISOWeekYear(d) === d.getFullYear() ? getWeekNumber(d) : (d.getMonth() === 0 ? 1 : getWeekNumber(new Date(d.getFullYear(), 11, 28))));
                        }
                    }
                } catch (readErr) {
                    console.error("Failed to load readings", readErr);
                    toast.error(t.unit.readingsFailed);
                } finally {
                    setReadingsLoading(false);
                }

            } catch (err) {
                console.error(err);
                setMetersLoading(false);
                setReadingsLoading(false);
            }
        };

        fetchMeters();
    }, [id, token, authLoading]);


    const handleAssignOwner = async (email: string) => {
        try {
            const res = await authFetch(`/units/${id}/assign_by_email?email=${encodeURIComponent(email)}`, {
                method: 'POST'
            });
            if (res.ok) {
                const updatedUnit = await res.json();
                setUnit(updatedUnit); // Update entire unit object to get populated owner
                setOwnerFormOpen(false);
                toast.success(t.messages.successAssignOwner);
            } else {
                const err = await res.json();
                toast.error(apiError(t.messages.errorAssignOwner, err.detail));
            }
        } catch (err) {
            console.error(err);
            toast.error(t.messages.errorGeneric);
        }
    };

    const canAssignOwner = user?.role === 'admin' || user?.role === 'home_lord';



    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

    // Separate state for month and week to prevent conflicting values
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [selectedWeek, setSelectedWeek] = useState(getWeekNumber(new Date()));

    // Typical unit of the building (median) for the selected month/week, by meter type
    const [typical, setTypical] = useState<Record<string, { median: number; units: number; unusual?: { median_factor: number; previous_factor: number | null } | null }>>({});
    useEffect(() => {
        if (authLoading || !token) return;
        const [start, end] = viewMode === 'month' ? monthBounds(selectedYear, selectedMonth) : isoWeekBounds(selectedYear, selectedWeek);
        let stale = false;  // a newer period was selected meanwhile
        setTypical({});
        authFetch(`/units/${id}/building_average?start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}`)
            .then(res => res.ok ? res.json() : { types: {} })
            .then(data => { if (!stale) setTypical(data.types ?? {}); })
            .catch(err => console.error(err));
        return () => { stale = true; };
    }, [id, token, authLoading, selectedYear, viewMode, selectedMonth, selectedWeek]);


    const getPeriodReadings = (readings: Reading[], year: number, mode: 'month' | 'week', period: number) => {
        return readings.filter(r => {
            const d = new Date(r.time);

            if (mode === 'month') {
                return d.getFullYear() === year && (d.getMonth() + 1) === period;
            } else {
                return getISOWeekYear(d) === year && getWeekNumber(d) === period;
            }
        }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()); // Ensure sorted
    };

    const formatConsumption = (value: number) => {
        return value.toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 0
        });
    };



    const meterTypeLabel = (meterType: string) => {
        const type = meterType.toLowerCase();
        if (type.includes('cold') || type === 'sv' || type === 'water_cold') return t.building.categoryColdWater;
        if (type.includes('hot') || type === 'tv' || type === 'water_hot') return t.building.categoryHotWater;
        if (type.includes('heat') || type === 'teplo') return t.building.categoryHeat;
        return meterType; // Fallback
    };

    // Meters of the same type (old and new after a replacement) shown as one card, ordered by when
    // each meter started recording; types keep their order
    const meterGroups = Object.values(meters.reduce((groups, m) => {
        (groups[m.type] ??= []).push(m);
        return groups;
    }, {} as Record<string, MeterWithReadings[]>)).map(group => [...group].sort((a, b) => {
        const first = (m: MeterWithReadings) => m.recent_readings.reduce((min, r) => r.time < min ? r.time : min, '\uffff');
        return first(a).localeCompare(first(b));
    }));

    // Daily readings of all meters of the unit in the selected year (dates in UTC, as stored)
    const exportReadings = () => {
        const rows = meters.flatMap(meter =>
            [...meter.recent_readings]
                .filter(r => r.time.startsWith(String(selectedYear)))
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(r => [r.time.slice(0, 10), meterTypeLabel(meter.type), meter.serial_number, r.value, meter.unit_of_measure])
        );
        const header = [t.csv.date, t.csv.meter, t.csv.serial, t.csv.reading, t.csv.unitOfMeasure];
        downloadCsv(`odecty_${fileSlug(unit?.unit_number ?? id)}_${selectedYear}.csv`, buildCsv([header, ...rows], language));
    };

    // Years offered in the selector: from the current year back to the oldest reading (at least 3 years)
    const currentYear = new Date().getFullYear();
    const oldestReadingYear = Math.min(
        currentYear - 2,
        ...meters.flatMap(m => m.recent_readings.map(r => new Date(r.time).getFullYear()))
    );
    const availableYears = Array.from({ length: currentYear - oldestReadingYear + 1 }, (_, i) => currentYear - i);
    // ISO years have 52 or 53 weeks; 28 December always falls in the last one
    const weeksInSelectedYear = getWeekNumber(new Date(selectedYear, 11, 28));

    // Latest reading of any meter of the unit; highlighted when the data stopped arriving
    const readingTimes = meters.flatMap(m => m.recent_readings.map(r => Date.parse(r.time)));
    const lastReading = readingTimes.length ? Math.max(...readingTimes) : null;
    const staleReadings = lastReading !== null && Date.now() - lastReading > 7 * 86400000;

    // Previous/next month or week, crossing into the neighbouring year within the offered years
    const shiftPeriod = (delta: number) => {
        const periods = viewMode === 'month' ? 12 : weeksInSelectedYear;
        const current = viewMode === 'month' ? selectedMonth : selectedWeek;
        let year = selectedYear;
        let period = current + delta;
        if (period < 1) {
            year -= 1;
            period = viewMode === 'month' ? 12 : getWeekNumber(new Date(year, 11, 28));
        } else if (period > periods) {
            year += 1;
            period = 1;
        }
        if (!availableYears.includes(year)) return;
        setSelectedYear(year);
        if (viewMode === 'month') setSelectedMonth(period); else setSelectedWeek(period);
    };
    const now = new Date();
    const atLatestPeriod = selectedYear === currentYear && (viewMode === 'month'
        ? selectedMonth >= now.getMonth() + 1
        : getISOWeekYear(now) === currentYear && selectedWeek >= getWeekNumber(now));
    const atOldestPeriod = selectedYear === availableYears[availableYears.length - 1]
        && (viewMode === 'month' ? selectedMonth : selectedWeek) === 1;
    const arrowClass = "px-2 py-1 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40";

    if (unitError) {
        return (
            <main className={PAGE}>
                <Breadcrumbs items={[{ label: user?.role === 'owner' ? t.dashboard.myUnits : t.nav.buildings, href: '/' }]} />
                <div className="p-8 bg-white rounded-xl text-center text-red-600 border border-red-100">{unitError}</div>
            </main>
        );
    }

    return (
        <main className={PAGE}>
            <div className="mb-6 flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6">
                <div>
                    <Breadcrumbs items={[
                        { label: user?.role === 'owner' ? t.dashboard.myUnits : t.nav.buildings, href: '/' },
                        ...(unit ? [{ label: buildingName ?? '…', href: `/buildings/${unit.building_id}` }] : []),
                        { label: `${t.nav.unit} ${unit?.unit_number ?? ''}` },
                    ]} />
                    <h1 className="text-3xl font-bold">{t.nav.unit} {unit?.unit_number}</h1>
                </div>
                {canAssignOwner && unit && (
                    <div className={`${CARD} p-4 w-auto sm:w-full lg:max-w-sm`}>
                        <div className="flex justify-between items-start gap-3">
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-500 uppercase">{t.unit.currentOwner}</p>
                                {unit.owner ? (
                                    <>
                                        <p className="font-medium text-gray-800 truncate">{unit.owner.full_name || unit.owner.email}</p>
                                        {unit.owner.full_name && <p className="text-xs text-gray-500 truncate">{unit.owner.email}</p>}
                                    </>
                                ) : (
                                    <p className="text-gray-500 italic">{t.building.noOwner}</p>
                                )}
                            </div>
                            {!ownerFormOpen && (
                                <button onClick={() => setOwnerFormOpen(true)} className="shrink-0 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium">
                                    {unit.owner ? t.unit.changeOwner : t.unit.assign}
                                </button>
                            )}
                        </div>
                        {ownerFormOpen && (
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const form = e.target as HTMLFormElement;
                                const email = (form.elements.namedItem('email') as HTMLInputElement).value;
                                handleAssignOwner(email);
                            }} className="mt-3">
                                <label className={`${LABEL} mb-1`}>{t.unit.assignOwner}</label>
                                <div className="flex gap-2">
                                    <input
                                        name="email"
                                        type="email"
                                        autoFocus
                                        placeholder={t.unit.assignPlaceholder}
                                        className="flex-1 min-w-0 rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                        required
                                    />
                                    <button type="submit" className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm">
                                        {t.unit.assign}
                                    </button>
                                    <button type="button" onClick={() => setOwnerFormOpen(false)} className="px-3 py-2 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm">
                                        {t.common.cancel}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">{t.unit.inviteInfo}</p>
                            </form>
                        )}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6">
                {/* Comparative Controls */}
                <div className={`${CARD} p-4 flex flex-wrap gap-4 items-center`}>
                    <div>
                        <label htmlFor="period-year" className={FILTER_LABEL}>{t.unit.year}</label>
                        <select
                            id="period-year"
                            value={selectedYear}
                            onChange={(e) => {
                                const year = parseInt(e.target.value);
                                setSelectedYear(year);
                                setSelectedWeek(w => Math.min(w, getWeekNumber(new Date(year, 11, 28))));
                            }}
                            className={`mt-1 block w-24 ${FILTER_SELECT}`}
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <span id="view-mode-label" className={FILTER_LABEL}>{t.unit.viewMode}</span>
                        <div role="group" aria-labelledby="view-mode-label" className="flex mt-1 border rounded-md overflow-hidden">
                            <button
                                onClick={() => setViewMode('month')}
                                aria-pressed={viewMode === 'month'}
                                className={`px-3 py-1 text-sm ${viewMode === 'month' ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-white text-gray-600'}`}
                            >
                                {t.unit.month}
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                aria-pressed={viewMode === 'week'}
                                className={`px-3 py-1 text-sm ${viewMode === 'week' ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-white text-gray-600'}`}
                            >
                                {t.unit.week}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="period-select" className={FILTER_LABEL}>
                            {viewMode === 'month' ? t.unit.selectMonth : t.unit.selectWeek}
                        </label>
                        <div className="mt-1 flex items-center gap-1">
                        <button type="button" onClick={() => shiftPeriod(-1)} disabled={atOldestPeriod} className={arrowClass} aria-label={t.unit.prevPeriod} title={t.unit.prevPeriod}>‹</button>
                        {viewMode === 'month' ? (
                            <select
                                id="period-select"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                className={`block w-32 ${FILTER_SELECT}`}
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { month: 'long' })}</option>
                                ))}
                            </select>
                        ) : (
                            <select
                                id="period-select"
                                value={selectedWeek}
                                onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                                className={`block w-32 ${FILTER_SELECT}`}
                            >
                                {Array.from({ length: weeksInSelectedYear }, (_, i) => i + 1).map(w => (
                                    <option key={w} value={w}>{t.unit.week} {w}</option>
                                ))}
                            </select>
                        )}
                        <button type="button" onClick={() => shiftPeriod(1)} disabled={atLatestPeriod} className={arrowClass} aria-label={t.unit.nextPeriod} title={t.unit.nextPeriod}>›</button>
                        </div>
                    </div>
                    {lastReading !== null && (
                        <p className={`self-end text-xs ${staleReadings ? 'text-amber-700 font-medium' : 'text-gray-500'}`} title={staleReadings ? t.unit.lastReadingOld : undefined}>
                            {t.unit.lastReading}: {new Date(lastReading).toLocaleDateString(language === 'cs' ? 'cs-CZ' : 'en-US')}
                        </p>
                    )}
                    <button
                        onClick={exportReadings}
                        disabled={!meters.some(m => m.recent_readings.some(r => r.time.startsWith(String(selectedYear))))}
                        className={`sm:ml-auto self-end ${BUTTON_SECONDARY}`}
                    >
                        ⬇ {t.csv.downloadReadings}
                    </button>
                </div>

                {meterGroups.map(group => {
                    // One card per meter type: after a replacement the old and the new meter continue
                    // as one series, consumption is summed over them (as in the building overview)
                    const uom = group[0].unit_of_measure;
                    const series = group.map(m => [...m.recent_readings].sort((a, b) => a.time.localeCompare(b.time)));
                    const allTimes = series.flatMap(r => r.map(x => Date.parse(x.time)));

                    // Meters shown in the header: those that recorded in the selected or the previous year
                    // (both are on the card); an old meter disappears once it is out of both. Without any
                    // data in these years the most recent meter is shown.
                    const shownFrom = Date.UTC(selectedYear - 1, 0, 1);
                    const shownTo = Date.UTC(selectedYear + 1, 0, 1);
                    let shown = group.map((_, i) => i).filter(i => series[i].some(x => {
                        const time = Date.parse(x.time);
                        return time >= shownFrom && time < shownTo;
                    }));
                    if (shown.length === 0) shown = [group.length - 1];

                    // Selected month/week against the same one a year earlier (rules in lib/consumption.ts)
                    const periodBounds = (year: number) => viewMode === 'month'
                        ? monthBounds(year, selectedMonth)
                        : isoWeekBounds(year, selectedWeek);
                    const currentConsumption = combinedConsumption(series, ...periodBounds(selectedYear));
                    const prevConsumption = combinedConsumption(series, ...periodBounds(selectedYear - 1));

                    // Year to date: from 1 January to the latest reading (the whole year once it is over),
                    // against the same days of the previous year
                    const yearStart = Date.UTC(selectedYear, 0, 1);
                    const yearEnd = Date.UTC(selectedYear + 1, 0, 1);
                    const lastReadingTime = allTimes.length ? Math.max(...allTimes) : yearStart;
                    const ytdEnd = Math.min(yearEnd, Math.max(yearStart, lastReadingTime));
                    const wholeYear = ytdEnd === yearEnd;
                    const prevYtdEnd = wholeYear ? yearStart : Date.UTC(selectedYear - 1, new Date(ytdEnd).getUTCMonth(), new Date(ytdEnd).getUTCDate());
                    const currentYearTotal = combinedConsumption(series, yearStart, ytdEnd);
                    const prevYearTotal = combinedConsumption(series, Date.UTC(selectedYear - 1, 0, 1), prevYtdEnd);

                    const formatDate = (ts: number) => new Date(ts).toLocaleDateString(language === 'cs' ? 'cs-CZ' : 'en-US', { timeZone: 'UTC' });
                    // A whole year ends at midnight of 1 January (exclusive), its label shows 31 December
                    const lastDayLabel = (end: number) => formatDate(wholeYear ? end - 86400000 : end);
                    const missingTitle = (c: { missingDays: number; periodDays: number }) =>
                        t.unit.missingDays.replace('{{missing}}', String(c.missingDays)).replace('{{total}}', String(c.periodDays));

                    // Readings of the selected month/week; with several meters each gets its serial number
                    const periodLabel = viewMode === 'month'
                        ? new Date(2000, selectedMonth - 1).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { month: 'long' })
                        : `${t.unit.week} ${selectedWeek}`;
                    const parts = group
                        .map((m, i) => ({ serial: m.serial_number, readings: getPeriodReadings(series[i], selectedYear, viewMode, viewMode === 'month' ? selectedMonth : selectedWeek) }))
                        .filter(x => x.readings.length > 0);
                    const readingCount = parts.reduce((n, part) => n + part.readings.length, 0);
                    const renderReadings = () => parts.map(part => (
                            <div key={part.serial}>
                                {parts.length > 1 && <p className="text-[11px] font-mono text-gray-500 pt-1">{part.serial}</p>}
                                {part.readings.map(reading => (
                                    <div key={reading.time} className="flex justify-between text-sm py-1 border-b border-blue-100 last:border-0">
                                        <span className="text-gray-600 text-xs">{formatDate(Date.parse(reading.time))}</span>
                                        <span className="font-mono font-bold">{reading.value}</span>
                                    </div>
                                ))}
                            </div>
                        ));

                    return (
                        <div key={group[0].type} className={`${CARD} p-4 sm:p-6`}>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <h3 className="font-bold text-gray-800 text-lg mr-1">
                                            {meterTypeLabel(group[0].type)}
                                        </h3>
                                        {shown.map((i, n) => {
                                            const m = group[i];
                                            // With a replacement: until when the old meter and from when the new one recorded
                                            const times = series[i].map(x => Date.parse(x.time));
                                            const range = shown.length < 2 || times.length === 0 ? ''
                                                : n === 0 ? t.unit.meterUntil.replace('{{date}}', formatDate(Math.max(...times)))
                                                : n === shown.length - 1 ? t.unit.meterFrom.replace('{{date}}', formatDate(Math.min(...times)))
                                                : `${formatDate(Math.min(...times))} – ${formatDate(Math.max(...times))}`;
                                            return (
                                                <span key={m.id} className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full border border-gray-200">
                                                    <span className="font-mono">{m.serial_number}</span>{range && <span className="ml-1 text-gray-500">({range})</span>}
                                                </span>
                                            );
                                        })}
                                    </div>
                                    {shown.length > 1 && <p className="text-xs text-gray-500 mb-2">{t.unit.meterReplaced}</p>}

                                    {readingsLoading && <p className="text-xs text-gray-500 mb-2 animate-pulse">{t.unit.loadingReadings}</p>}
                                    {/* Yearly Totals Badges */}
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className={`px-2 py-1 rounded-md border ${currentYearTotal.value ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                                            <span className="opacity-70 mr-1">{t.building.totalPeriod.replace('{{startDate}}', formatDate(yearStart)).replace('{{endDate}}', lastDayLabel(ytdEnd))}:</span>
                                            <span className="font-mono font-bold">{formatConsumption(currentYearTotal.value ?? 0)}</span> {uom}
                                            {currentYearTotal.value !== null && !currentYearTotal.complete && <span className="cursor-help" title={missingTitle(currentYearTotal)}>*</span>}
                                        </span>
                                        <span className={`px-2 py-1 rounded-md border ${prevYearTotal.value ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                                            <span className="opacity-70 mr-1">{t.building.totalPeriod.replace('{{startDate}}', formatDate(Date.UTC(selectedYear - 1, 0, 1))).replace('{{endDate}}', lastDayLabel(prevYtdEnd))}:</span>
                                            <span className="font-mono font-bold">{formatConsumption(prevYearTotal.value ?? 0)}</span> {uom}
                                            {prevYearTotal.value !== null && !prevYearTotal.complete && <span className="cursor-help" title={missingTitle(prevYearTotal)}>*</span>}
                                        </span>
                                        {currentYearTotal.complete && prevYearTotal.complete && (
                                            <YoyChange current={currentYearTotal.value as number} previous={prevYearTotal.value as number} previousYear={selectedYear - 1} className="py-1" />
                                        )}
                                    </div>
                                </div>
                            </div>

                            <ConsumptionChart
                                meters={series}
                                year={selectedYear}
                                unitOfMeasure={uom}
                                selectedMonth={viewMode === 'month' ? selectedMonth : null}
                                onSelectMonth={(month) => {
                                    setViewMode('month');
                                    setSelectedMonth(month);
                                }}
                                format={formatConsumption}
                            />

                            {/* Selected month/week: consumption, last year's value and the change, readings on demand
                                (last year's readings: switch the year) */}
                            <div className="border border-blue-100 rounded-lg p-3 bg-blue-50/50">
                                {/* Unusually high consumption in the selected period (rules in the backend): a possible leak */}
                                {typical[group[0].type]?.unusual && (() => {
                                    const { median_factor, previous_factor } = typical[group[0].type].unusual!;
                                    const factor = (f: number) => f.toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { maximumFractionDigits: f < 10 ? 1 : 0 });
                                    const isWater = group[0].type.startsWith('water');
                                    return (
                                        <div role="alert" className="mb-3 p-2.5 rounded-md border border-red-200 bg-red-50 text-sm text-red-800">
                                            <span className="font-semibold">⚠ {t.unit.unusualTitle}:</span>{' '}
                                            {t.unit.unusualMedian.replace('{{factor}}', factor(median_factor))}
                                            {previous_factor !== null && <>, {t.unit.unusualPrevious.replace('{{factor}}', factor(previous_factor))}</>}.
                                            {isWater && <> {t.unit.unusualWater}</>}
                                        </div>
                                    );
                                })()}
                                <div className="flex flex-wrap justify-between items-start gap-3">
                                    <div>
                                        <h4 className="font-semibold text-sm text-blue-800">{periodLabel} {selectedYear}</h4>
                                        <p className="text-xs text-gray-600 mt-1">
                                            {t.unit.lastYear} ({language === 'cs' ? periodLabel.toLocaleLowerCase('cs-CZ') : periodLabel} {selectedYear - 1}):{' '}
                                            <span className="font-mono font-medium">{prevConsumption.value === null ? '–' : `${formatConsumption(prevConsumption.value)} ${uom}`}</span>
                                            {prevConsumption.value !== null && !prevConsumption.complete && <span className="cursor-help" title={missingTitle(prevConsumption)}>*</span>}
                                        </p>
                                        {typical[group[0].type] && currentConsumption.complete && (() => {
                                            const { median, units } = typical[group[0].type];
                                            const diff = ((currentConsumption.value as number) - median) / median * 100;
                                            const pct = (Math.abs(diff) / 100).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { style: 'percent', maximumFractionDigits: Math.abs(diff) < 10 ? 1 : 0 });
                                            return (
                                                <p className="text-xs text-gray-600 mt-1">
                                                    <span className="cursor-help underline decoration-dotted" title={t.unit.typicalHint.replace('{{units}}', String(units))}>{t.unit.typicalUnit}</span>:{' '}
                                                    <span className="font-mono font-medium">{formatConsumption(median)} {uom}</span>{' · '}
                                                    {Math.abs(diff) < 1
                                                        ? <span className="text-gray-500">{t.unit.aboutSame}</span>
                                                        : <span className={`font-medium ${diff > 0 ? 'text-red-700' : 'text-green-700'}`}>{(diff > 0 ? t.unit.moreThan : t.unit.lessThan).replace('{{pct}}', pct)}</span>}
                                                </p>
                                            );
                                        })()}
                                    </div>
                                    <div className="sm:text-right">
                                        <p className="text-xs text-blue-600 uppercase font-bold">{t.unit.consumption}</p>
                                        <p className="text-lg font-bold font-mono text-blue-900 leading-none">{formatConsumption(currentConsumption.value ?? 0)} <span className="text-xs font-sans font-normal">{uom}</span></p>
                                        <p className="text-xs mt-1">
                                            {currentConsumption.complete && prevConsumption.complete
                                                ? <YoyChange current={currentConsumption.value as number} previous={prevConsumption.value as number} previousYear={selectedYear - 1} />
                                                : currentConsumption.value !== null && (
                                                    <span className="text-gray-500 cursor-help" title={missingTitle(currentConsumption.complete ? prevConsumption : currentConsumption)}>{t.unit.incompletePeriod}</span>
                                                )}
                                        </p>
                                    </div>
                                </div>
                                {readingCount > 0 ? (
                                    <details className="mt-2">
                                        <summary className="cursor-pointer text-xs text-blue-600 hover:underline">{t.unit.showReadings.replace('{{count}}', String(readingCount))}</summary>
                                        <div className="mt-2 max-h-64 overflow-y-auto space-y-2">
                                            {renderReadings()}
                                        </div>
                                    </details>
                                ) : (
                                    <p className="mt-2 text-xs text-gray-500 italic">{t.unit.noData}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
                {metersLoading && (
                    <div className={`${CARD} p-4 sm:p-6 space-y-4`} aria-busy="true">
                        <span className="sr-only">{t.common.loading}</span>
                        <div className="bg-gray-200 rounded animate-pulse h-5 w-48" />
                        <div className="bg-gray-200 rounded animate-pulse h-40 w-full" />
                        <div className="bg-gray-200 rounded animate-pulse h-16 w-full" />
                    </div>
                )}
                {!metersLoading && meters.length === 0 && (
                    <div className={EMPTY_STATE}>
                        {t.unit.noMeters}
                    </div>
                )}
            </div>
        </main>
    );
}
