"use client";
import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import UserSelect from '@/components/UserSelect';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

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

export default function UnitDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [meters, setMeters] = useState<MeterWithReadings[]>([]);
    const [unit, setUnit] = useState<any>(null); // Ideally separate Unit interface
    const [ownerId, setOwnerId] = useState<string>("");
    const { user } = useAuth(); // Get current user
    const { t, language } = useLanguage();

    useEffect(() => {
        // 1. Fetch unit info
        authFetch(`/units/${id}`)
            .then(res => res.json())
            .then(data => {
                setUnit(data);
                setOwnerId(data.owner_id || "");
            })
            .catch(err => console.error(err));

        // 2. Sync and Fetch
        const fetchMeters = async () => {
            // First sync readings from InfluxDB (automatic, best effort)
            try {
                await authFetch(`/units/${id}/sync_readings`, { method: 'POST' });
            } catch (e) {
                console.error("Sync failed, proceeding to load cached data", e);
            }

            // Then load meters and readings
            try {
                const res = await authFetch(`/telemetry/meters/?unit_id=${id}`);
                const unitMeters: any[] = await res.json();

                const metersWithReadings = await Promise.all(unitMeters.map(async (meter) => {
                    const readingsRes = await authFetch(`/telemetry/meters/${meter.id}/readings`);
                    const readings = await readingsRes.json();
                    return { ...meter, recent_readings: readings };
                }));
                setMeters(metersWithReadings);
            } catch (err) {
                console.error(err);
            }
        };

        fetchMeters();
    }, [id]);


    const handleAssignOwner = async (email: string) => {
        try {
            const res = await authFetch(`/units/${id}/assign_by_email?email=${encodeURIComponent(email)}`, {
                method: 'POST'
            });
            if (res.ok) {
                const updatedUnit = await res.json();
                setUnit(updatedUnit); // Update entire unit object to get populated owner
                setOwnerId(updatedUnit.owner_id);
                // alert(t.messages.successAssignOwner);
            } else {
                const err = await res.json();
                alert(`${t.messages.errorAssignOwner}: ${err.detail}`);
            }
        } catch (err) {
            console.error(err);
            alert(t.messages.errorGeneric);
        }
    };

    const canAssignOwner = user?.role === 'admin' || user?.role === 'home_lord';


    const [selectedYear, setSelectedYear] = useState(2026);
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
    const [selectedPeriod, setSelectedPeriod] = useState(1); // 1-12 (month) or 1-52 (week)

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

    const calculateConsumption = (readings: Reading[]) => {
        if (readings.length < 2) return 0;
        const start = readings[0].value;
        const end = readings[readings.length - 1].value;
        return (end - start).toFixed(2);
    };



    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6 flex justify-between items-start">
                <div>
                    <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">{t.common.backToDashboard}</Link>
                    <h1 className="text-3xl font-bold">{t.unit.title}</h1>
                    <p className="text-gray-500">{t.unit.unitNumber}: {unit?.unit_number}</p>
                </div>
                {canAssignOwner && (
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 max-w-sm w-full">
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
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">{t.unit.year}</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="mt-1 block w-24 rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                        >
                            {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
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
                        <select
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(parseInt(e.target.value))}
                            className="mt-1 block w-32 rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                        >
                            {viewMode === 'month'
                                ? Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { month: 'long' })}</option>
                                ))
                                : Array.from({ length: 52 }, (_, i) => i + 1).map(w => (
                                    <option key={w} value={w}>{t.unit.week} {w}</option>
                                ))
                            }
                        </select>
                    </div>
                </div>

                {meters.map(meter => {
                    const currentReadings = getPeriodReadings(meter.recent_readings, selectedYear, viewMode, selectedPeriod);
                    const prevReadings = getPeriodReadings(meter.recent_readings, selectedYear - 1, viewMode, selectedPeriod);

                    const currentConsumption = calculateConsumption(currentReadings);
                    const prevConsumption = calculateConsumption(prevReadings);

                    const getYearReadings = (readings: Reading[], year: number) => {
                        return readings.filter(r => new Date(r.time).getFullYear() === year)
                            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
                    };

                    const currentYearReadings = getYearReadings(meter.recent_readings, selectedYear);
                    let currentStartDate = new Date(selectedYear, 0, 1);
                    let currentEndDate = new Date(); // Default to today for current year

                    if (currentYearReadings.length > 0) {
                        currentEndDate = new Date(currentYearReadings[currentYearReadings.length - 1].time);
                    } else if (selectedYear !== new Date().getFullYear()) {
                        currentEndDate = new Date(selectedYear, 11, 31);
                    }


                    let prevYearReadings = getYearReadings(meter.recent_readings, selectedYear - 1);
                    let prevStartDate = new Date(selectedYear - 1, 0, 1);
                    let prevEndDate = new Date(selectedYear - 1, 11, 31);

                    // Filter previous year to same date as current year (YTD comparison)
                    if (currentYearReadings.length > 0) {
                        const lastReading = currentYearReadings[currentYearReadings.length - 1];
                        const lastDate = new Date(lastReading.time);
                        // Create cutoff date: same month/day but previous year
                        const cutoffDate = new Date(selectedYear - 1, lastDate.getMonth(), lastDate.getDate(), 23, 59, 59);
                        prevYearReadings = prevYearReadings.filter(r => new Date(r.time) <= cutoffDate);
                        prevEndDate = cutoffDate;
                    } else if (selectedYear === new Date().getFullYear()) {
                        const today = new Date();
                        prevEndDate = new Date(selectedYear - 1, today.getMonth(), today.getDate());
                        prevYearReadings = prevYearReadings.filter(r => new Date(r.time) <= prevEndDate);
                    }

                    const currentYearTotal = calculateConsumption(currentYearReadings);
                    const prevYearTotal = calculateConsumption(prevYearReadings);

                    const formatDate = (d: Date) => d.toLocaleDateString(language === 'cs' ? 'cs-CZ' : 'en-US');

                    return (
                        <div key={meter.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
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
                                        <span className={`px-2 py-1 rounded-md border ${currentYearTotal !== "0.00" ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                            <span className="opacity-70 mr-1">{t.building.totalPeriod.replace('{{startDate}}', formatDate(currentStartDate)).replace('{{endDate}}', formatDate(currentEndDate))}:</span>
                                            <span className="font-mono font-bold">{currentYearTotal}</span> {meter.unit_of_measure}
                                        </span>
                                        <span className={`px-2 py-1 rounded-md border ${prevYearTotal !== "0.00" ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                                            <span className="opacity-70 mr-1">{t.building.totalPeriod.replace('{{startDate}}', formatDate(prevStartDate)).replace('{{endDate}}', formatDate(prevEndDate))}:</span>
                                            <span className="font-mono font-bold">{prevYearTotal}</span> {meter.unit_of_measure}
                                        </span>
                                    </div>
                                </div>
                                <span className="bg-blue-100 text-blue-800 text-xs px-3 py-1.5 rounded-full font-bold shadow-sm">{meter.unit_of_measure}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Current Period Window */}
                                <div className="border rounded-lg p-3 bg-blue-50/50">
                                    <div className="flex justify-between items-end mb-2 border-b border-blue-100 pb-2">
                                        <h4 className="font-semibold text-sm text-blue-800">
                                            {viewMode === 'month' ? new Date(2000, selectedPeriod - 1).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { month: language === 'cs' ? 'long' : 'short' }) : `${t.unit.week} ${selectedPeriod}`} {selectedYear}
                                        </h4>
                                        <div className="text-right">
                                            <p className="text-xs text-blue-600 uppercase font-bold">{t.unit.consumption}</p>
                                            <p className="text-lg font-bold font-mono text-blue-900 leading-none">{currentConsumption} <span className="text-xs font-sans font-normal">{meter.unit_of_measure}</span></p>
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
                                            {viewMode === 'month' ? new Date(2000, selectedPeriod - 1).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', { month: language === 'cs' ? 'long' : 'short' }) : `${t.unit.week} ${selectedPeriod}`} {selectedYear - 1}
                                        </h4>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500 uppercase font-bold">{t.unit.consumption}</p>
                                            <p className="text-lg font-bold font-mono text-gray-700 leading-none">{prevConsumption} <span className="text-xs font-sans font-normal">{meter.unit_of_measure}</span></p>
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
