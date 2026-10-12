"use client";
import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import UserSelect from '@/components/UserSelect';
import ConsumptionChart from '@/components/ConsumptionChart';
import Breadcrumbs from '@/components/Breadcrumbs';
import YoyChange from '@/components/YoyChange';
import { periodConsumption, monthBounds, isoWeekBounds } from '@/lib/consumption';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';

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
    const [ownerId, setOwnerId] = useState<string>("");
    const { user, token, isLoading: authLoading } = useAuth(); // Get current user
    const router = useRouter();
    const { t, language } = useLanguage();
    const toast = useToast();

    useEffect(() => {
        if (authLoading) return;
        if (!token) {
            router.push('/login');
            return;
        }
        // 1. Fetch unit info
        authFetch(`/units/${id}`)
            .then(res => res.json())
            .then(data => {
                setUnit(data);
                setOwnerId(data.owner_id || "");
                // Building name for the breadcrumbs
                return authFetch(`/buildings/${data.building_id}`)
                    .then(res => res.ok ? res.json() : null)
                    .then(b => setBuildingName(b?.name ?? null));
            })
            .catch(err => console.error(err));

        // 2. Sync and Fetch
        // 2. Fetch Meters and Readings (Optimized)
        const fetchMeters = async () => {
            // 1. Get Meters List (Fast, SQL)
            try {
                const res = await authFetch(`/telemetry/meters/?unit_id=${id}`);
                const unitMeters: any[] = await res.json();

                // Set meters immediately with empty readings to show structure
                setMeters(unitMeters.map(m => ({ ...m, recent_readings: [] })));

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
                } catch (readErr) {
                    console.error("Failed to load readings", readErr);
                }

            } catch (err) {
                console.error(err);
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
                setOwnerId(updatedUnit.owner_id);
                // toast.success(t.messages.successAssignOwner);
            } else {
                const err = await res.json();
                toast.error(`${t.messages.errorAssignOwner}: ${err.detail}`);
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



    // Years offered in the selector: from the current year back to the oldest reading (at least 3 years)
    const currentYear = new Date().getFullYear();
    const oldestReadingYear = Math.min(
        currentYear - 2,
        ...meters.flatMap(m => m.recent_readings.map(r => new Date(r.time).getFullYear()))
    );
    const availableYears = Array.from({ length: currentYear - oldestReadingYear + 1 }, (_, i) => currentYear - i);
    // ISO years have 52 or 53 weeks; 28 December always falls in the last one
    const weeksInSelectedYear = getWeekNumber(new Date(selectedYear, 11, 28));

    return (
        <main className="min-h-screen p-4 sm:p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6 flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6">
                <div>
                    <Breadcrumbs items={[
                        { label: user?.role === 'owner' ? t.dashboard.myUnits : t.nav.buildings, href: '/' },
                        ...(unit ? [{ label: buildingName ?? '…', href: `/buildings/${unit.building_id}` }] : []),
                        { label: `${t.nav.unit} ${unit?.unit_number ?? ''}` },
                    ]} />
                    <h1 className="text-3xl font-bold">{t.nav.unit} {unit?.unit_number}</h1>
                </div>
                {canAssignOwner && (
                    <div className="bg-white p-4 -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 w-auto sm:w-full lg:max-w-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t.unit.assignOwner}</label>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const email = (form.elements.namedItem('email') as HTMLInputElement).value;
                            handleAssignOwner(email);
                        }} className="flex space-x-2">
                            <input
                                name="email"
                                type="email"
                                placeholder={t.unit.assignPlaceholder}
                                className="flex-1 rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                required
                            />
                            <button
                                type="submit"
                                className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm"
                            >
                                {t.unit.assign}
                            </button>
                        </form>
                        <p className="text-xs text-gray-500 mt-1">
                            {t.unit.inviteInfo}
                        </p>
                        {unit?.owner && (
                            <div className="mt-2 p-2 bg-green-50 text-green-800 text-xs rounded border border-green-100">
                                <p className="font-semibold">{t.unit.currentOwner}:</p>
                                <p>{unit.owner.full_name || unit.owner.email}</p>
                                {unit.owner.full_name && <p className="text-gray-500">{unit.owner.email}</p>}
                            </div>
                        )}
                        {!unit?.owner && ownerId && <p className="text-xs text-gray-400 mt-1">{t.unit.ownerId}: {ownerId.slice(0, 8)}...</p>}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">{t.unit.meters}</h2>
                </div>

                {/* Comparative Controls */}
                <div className="bg-white p-4 -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">{t.unit.year}</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => {
                                const year = parseInt(e.target.value);
                                setSelectedYear(year);
                                setSelectedWeek(w => Math.min(w, getWeekNumber(new Date(year, 11, 28))));
                            }}
                            className="mt-1 block w-24 rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">{t.unit.viewMode}</label>
                        <div className="flex mt-1 border rounded-md overflow-hidden">
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-3 py-1 text-sm ${viewMode === 'month' ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-white text-gray-600'}`}
                            >
                                {t.unit.month}
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-3 py-1 text-sm ${viewMode === 'week' ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-white text-gray-600'}`}
                            >
                                {t.unit.week}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">
                            {viewMode === 'month' ? t.unit.selectMonth : t.unit.selectWeek}
                        </label>
                        {viewMode === 'month' ? (
                            <select
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                                className="mt-1 block w-32 rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { month: 'long' })}</option>
                                ))}
                            </select>
                        ) : (
                            <select
                                value={selectedWeek}
                                onChange={(e) => setSelectedWeek(parseInt(e.target.value))}
                                className="mt-1 block w-32 rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                            >
                                {Array.from({ length: weeksInSelectedYear }, (_, i) => i + 1).map(w => (
                                    <option key={w} value={w}>{t.unit.week} {w}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {meters.map(meter => {
                    // Sort all readings by time once
                    const sortedReadings = [...meter.recent_readings].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

                    const currentReadings = getPeriodReadings(sortedReadings, selectedYear, viewMode, viewMode === 'month' ? selectedMonth : selectedWeek);
                    const prevReadings = getPeriodReadings(sortedReadings, selectedYear - 1, viewMode, viewMode === 'month' ? selectedMonth : selectedWeek);

                    // Selected month/week against the same one a year earlier (rules in lib/consumption.ts)
                    const periodBounds = (year: number) => viewMode === 'month'
                        ? monthBounds(year, selectedMonth)
                        : isoWeekBounds(year, selectedWeek);
                    const currentConsumption = periodConsumption(sortedReadings, ...periodBounds(selectedYear));
                    const prevConsumption = periodConsumption(sortedReadings, ...periodBounds(selectedYear - 1));

                    // Year to date: from 1 January to the latest reading (the whole year once it is over),
                    // against the same days of the previous year
                    const yearStart = Date.UTC(selectedYear, 0, 1);
                    const yearEnd = Date.UTC(selectedYear + 1, 0, 1);
                    const lastReadingTime = sortedReadings.length ? Date.parse(sortedReadings[sortedReadings.length - 1].time) : yearStart;
                    const ytdEnd = Math.min(yearEnd, Math.max(yearStart, lastReadingTime));
                    const wholeYear = ytdEnd === yearEnd;
                    const prevYtdEnd = wholeYear ? yearStart : Date.UTC(selectedYear - 1, new Date(ytdEnd).getUTCMonth(), new Date(ytdEnd).getUTCDate());
                    const currentYearTotal = periodConsumption(sortedReadings, yearStart, ytdEnd);
                    const prevYearTotal = periodConsumption(sortedReadings, Date.UTC(selectedYear - 1, 0, 1), prevYtdEnd);

                    const formatDate = (ts: number) => new Date(ts).toLocaleDateString(language === 'cs' ? 'cs-CZ' : 'en-US', { timeZone: 'UTC' });
                    // A whole year ends at midnight of 1 January (exclusive), its label shows 31 December
                    const lastDayLabel = (end: number) => formatDate(wholeYear ? end - 86400000 : end);
                    const missingTitle = (c: { missingDays: number; periodDays: number }) =>
                        t.unit.missingDays.replace('{{missing}}', String(c.missingDays)).replace('{{total}}', String(c.periodDays));

                    return (
                        <div key={meter.id} className="bg-white -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 p-4 sm:p-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-bold text-gray-800 text-lg">
                                            {(() => {
                                                const type = meter.type.toLowerCase();
                                                if (type.includes('cold') || type === 'sv' || type === 'water_cold') return t.building.categoryColdWater;
                                                if (type.includes('hot') || type === 'tv' || type === 'water_hot') return t.building.categoryHotWater;
                                                if (type.includes('heat') || type === 'teplo') return t.building.categoryHeat;
                                                return meter.type; // Fallback
                                            })()}
                                        </h3>
                                        <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full font-mono border border-gray-200">{meter.serial_number}</span>
                                    </div>

                                    {/* Yearly Totals Badges */}
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className={`px-2 py-1 rounded-md border ${currentYearTotal.value ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                            <span className="opacity-70 mr-1">{t.building.totalPeriod.replace('{{startDate}}', formatDate(yearStart)).replace('{{endDate}}', lastDayLabel(ytdEnd))}:</span>
                                            <span className="font-mono font-bold">{formatConsumption(currentYearTotal.value ?? 0)}</span> {meter.unit_of_measure}
                                            {currentYearTotal.value !== null && !currentYearTotal.complete && <span className="cursor-help" title={missingTitle(currentYearTotal)}>*</span>}
                                        </span>
                                        <span className={`px-2 py-1 rounded-md border ${prevYearTotal.value ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                            <span className="opacity-70 mr-1">{t.building.totalPeriod.replace('{{startDate}}', formatDate(Date.UTC(selectedYear - 1, 0, 1))).replace('{{endDate}}', lastDayLabel(prevYtdEnd))}:</span>
                                            <span className="font-mono font-bold">{formatConsumption(prevYearTotal.value ?? 0)}</span> {meter.unit_of_measure}
                                            {prevYearTotal.value !== null && !prevYearTotal.complete && <span className="cursor-help" title={missingTitle(prevYearTotal)}>*</span>}
                                        </span>
                                        {currentYearTotal.complete && prevYearTotal.complete && (
                                            <YoyChange current={currentYearTotal.value as number} previous={prevYearTotal.value as number} previousYear={selectedYear - 1} className="py-1" />
                                        )}
                                    </div>
                                </div>
                                <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1.5 rounded-full font-bold shadow-sm">{meter.unit_of_measure}</span>
                            </div>

                            <ConsumptionChart
                                readings={sortedReadings}
                                year={selectedYear}
                                unitOfMeasure={meter.unit_of_measure}
                                selectedMonth={viewMode === 'month' ? selectedMonth : null}
                                onSelectMonth={(month) => {
                                    setViewMode('month');
                                    setSelectedMonth(month);
                                }}
                                format={formatConsumption}
                            />

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Current Period Window */}
                                <div className="border rounded-lg p-3 bg-blue-50/50">
                                    <div className="flex justify-between items-end mb-2 border-b border-blue-100 pb-2">
                                        <h4 className="font-semibold text-sm text-blue-800">
                                            {viewMode === 'month' ? new Date(2000, selectedMonth - 1).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { month: language === 'cs' ? 'long' : 'short' }) : `${t.unit.week} ${selectedWeek}`} {selectedYear}
                                        </h4>
                                        <div className="text-right">
                                            <p className="text-xs text-blue-600 uppercase font-bold">{t.unit.consumption}</p>
                                            <p className="text-lg font-bold font-mono text-blue-900 leading-none">{formatConsumption(currentConsumption.value ?? 0)} <span className="text-xs font-sans font-normal">{meter.unit_of_measure}</span></p>
                                            <p className="text-xs mt-1">
                                                {currentConsumption.complete && prevConsumption.complete
                                                    ? <YoyChange current={currentConsumption.value as number} previous={prevConsumption.value as number} previousYear={selectedYear - 1} />
                                                    : currentConsumption.value !== null && (
                                                        <span className="text-gray-400 cursor-help" title={missingTitle(currentConsumption.complete ? prevConsumption : currentConsumption)}>{t.unit.incompletePeriod}</span>
                                                    )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-2">
                                        {currentReadings.map(reading => (
                                            <div key={reading.id} className="flex justify-between text-sm py-1 border-b border-blue-100 last:border-0">
                                                <span className="text-gray-600 text-xs">{new Date(reading.time).toLocaleDateString(language === 'cs' ? 'cs-CZ' : 'en-US')}</span>
                                                <span className="font-bold font-mono">{reading.value}</span>
                                            </div>
                                        ))}
                                        {currentReadings.length === 0 && <p className="text-xs text-gray-400 italic">{t.unit.noData}</p>}
                                    </div>
                                </div>

                                {/* Previous Year Window */}
                                <div className="border rounded-lg p-3 bg-gray-50/50">
                                    <div className="flex justify-between items-end mb-2 border-b border-gray-200 pb-2">
                                        <h4 className="font-semibold text-sm text-gray-600">
                                            {viewMode === 'month' ? new Date(2000, selectedMonth - 1).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { month: language === 'cs' ? 'long' : 'short' }) : `${t.unit.week} ${selectedWeek}`} {selectedYear - 1}
                                        </h4>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500 uppercase font-bold">{t.unit.consumption}</p>
                                            <p className="text-lg font-bold font-mono text-gray-700 leading-none">{formatConsumption(prevConsumption.value ?? 0)} <span className="text-xs font-sans font-normal">{meter.unit_of_measure}</span></p>
                                        </div>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-2">
                                        {prevReadings.map(reading => (
                                            <div key={reading.id} className="flex justify-between text-sm py-1 border-b border-gray-200 last:border-0">
                                                <span className="text-gray-500 text-xs">{new Date(reading.time).toLocaleDateString(language === 'cs' ? 'cs-CZ' : 'en-US')}</span>
                                                <span className="font-medium font-mono text-gray-700">{reading.value}</span>
                                            </div>
                                        ))}
                                        {prevReadings.length === 0 && <p className="text-xs text-gray-400 italic">{t.unit.noData}</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {meters.length === 0 && (
                    <div className="p-8 bg-white rounded-xl text-center text-gray-400 border border-dashed border-gray-200">
                        {t.unit.noMeters}
                    </div>
                )}
            </div>
        </main>
    );
}
