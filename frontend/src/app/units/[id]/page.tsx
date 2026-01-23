"use client";
import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import UserSelect from '@/components/UserSelect';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

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

    useEffect(() => {
        // 1. Fetch unit info
        authFetch(`http://localhost:8000/units/${id}`)
            .then(res => res.json())
            .then(data => {
                setUnit(data);
                setOwnerId(data.owner_id || "");
            })
            .catch(err => console.error(err));

        // 2. Fetch meters (existing logic)
        authFetch(`http://localhost:8000/telemetry/meters/`)
            .then(res => res.json())
            .then(async (allMeters: any[]) => {
                const unitMeters = allMeters.filter(m => m.unit_id === id);
                const metersWithReadings = await Promise.all(unitMeters.map(async (meter) => {
                    const readingsRes = await authFetch(`http://localhost:8000/telemetry/meters/${meter.id}/readings`);
                    const readings = await readingsRes.json();
                    return { ...meter, recent_readings: readings }; // Show all readings
                }));
                setMeters(metersWithReadings);
            })
            .catch(err => console.error(err));
    }, [id]);


    const handleAssignOwner = async (newOwnerId: string) => {
        try {
            const res = await authFetch(`http://localhost:8000/units/${id}/assign?owner_id=${newOwnerId}`, {
                method: 'PATCH'
            });
            if (res.ok) {
                setOwnerId(newOwnerId);
                // alert("Owner updated!");
            } else {
                alert("Failed to update owner");
            }
        } catch (err) {
            console.error(err);
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

    const getPeriodReadings = (readings: Reading[], year: number, mode: 'month' | 'week', period: number) => {
        return readings.filter(r => {
            const d = new Date(r.time);
            const rYear = d.getFullYear();
            if (rYear !== year) return false;

            if (mode === 'month') {
                return (d.getMonth() + 1) === period;
            } else {
                return getWeekNumber(d) === period;
            }
        });
    };

    // Meter Creation State
    const [newMeter, setNewMeter] = useState({ serial_number: '', type: 'water_cold', unit_of_measure: 'm3' });
    const [showMeterForm, setShowMeterForm] = useState(false);

    const handleCreateMeter = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canAssignOwner) return;

        try {
            const res = await authFetch(`http://localhost:8000/telemetry/meters/`, {
                method: 'POST',
                body: JSON.stringify({ ...newMeter, unit_id: id })
            });

            if (res.ok) {
                // Refresh meters
                alert("Meter added!");
                setShowMeterForm(false);
                setNewMeter({ serial_number: '', type: 'water_cold', unit_of_measure: 'm3' });
                // Trigger reload logic (simplified by just reloading page or re-fetching - doing crude re-fetch here would be verbose, ideally refactor fetch into function)
                window.location.reload();
            } else {
                alert("Failed to add meter");
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6 flex justify-between items-start">
                <div>
                    <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
                    <h1 className="text-3xl font-bold">Unit Details</h1>
                    <p className="text-gray-500">Unit Number: {unit?.unit_number}</p>
                </div>
                {canAssignOwner && (
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Owner</label>
                        <UserSelect value={ownerId} onChange={handleAssignOwner} />
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Meters & Readings</h2>
                    {canAssignOwner && (
                        <button
                            onClick={() => setShowMeterForm(!showMeterForm)}
                            className="bg-green-600 text-white px-3 py-1 rounded-md text-sm hover:bg-green-700"
                        >
                            {showMeterForm ? 'Cancel' : '+ Add Meter'}
                        </button>
                    )}
                </div>

                {showMeterForm && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-green-200 mb-4">
                        <h3 className="font-semibold mb-4">Add New Meter</h3>
                        <form onSubmit={handleCreateMeter} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Serial Number</label>
                                <input
                                    required
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                    value={newMeter.serial_number}
                                    onChange={e => setNewMeter({ ...newMeter, serial_number: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Type</label>
                                <select
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                    value={newMeter.type}
                                    onChange={e => setNewMeter({ ...newMeter, type: e.target.value })}
                                >
                                    <option value="water_cold">Water (Cold)</option>
                                    <option value="water_hot">Water (Hot)</option>
                                    <option value="electricity">Electricity</option>
                                    <option value="gas">Gas</option>
                                    <option value="heat">Heat</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Unit</label>
                                <input
                                    required
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2 text-sm"
                                    value={newMeter.unit_of_measure}
                                    onChange={e => setNewMeter({ ...newMeter, unit_of_measure: e.target.value })}
                                />
                            </div>
                            <button type="submit" className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 text-sm h-10">
                                Save Meter
                            </button>
                        </form>
                    </div>
                )}

                {/* Comparative Controls */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Year</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                            className="mt-1 block w-24 rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                        >
                            {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">View Mode</label>
                        <div className="flex mt-1 border rounded-md overflow-hidden">
                            <button
                                onClick={() => setViewMode('month')}
                                className={`px-3 py-1 text-sm ${viewMode === 'month' ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-white text-gray-600'}`}
                            >
                                Month
                            </button>
                            <button
                                onClick={() => setViewMode('week')}
                                className={`px-3 py-1 text-sm ${viewMode === 'week' ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-white text-gray-600'}`}
                            >
                                Week
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">
                            {viewMode === 'month' ? 'Select Month' : 'Select Week'}
                        </label>
                        <select
                            value={selectedPeriod}
                            onChange={(e) => setSelectedPeriod(parseInt(e.target.value))}
                            className="mt-1 block w-32 rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                        >
                            {viewMode === 'month'
                                ? Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(0, m - 1).toLocaleString('default', { month: 'long' })}</option>
                                ))
                                : Array.from({ length: 52 }, (_, i) => i + 1).map(w => (
                                    <option key={w} value={w}>Week {w}</option>
                                ))
                            }
                        </select>
                    </div>
                </div>

                {meters.map(meter => {
                    const currentReadings = getPeriodReadings(meter.recent_readings, selectedYear, viewMode, selectedPeriod);
                    const prevReadings = getPeriodReadings(meter.recent_readings, selectedYear - 1, viewMode, selectedPeriod);

                    return (
                        <div key={meter.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-bold text-gray-800">{meter.type.toUpperCase()}</h3>
                                    <p className="text-sm text-gray-500 font-mono">{meter.serial_number}</p>
                                </div>
                                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{meter.unit_of_measure}</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Current Period Window */}
                                <div className="border rounded-lg p-3 bg-blue-50/50">
                                    <h4 className="font-semibold text-sm text-blue-800 mb-2 border-b border-blue-100 pb-1">
                                        {viewMode === 'month' ? new Date(0, selectedPeriod - 1).toLocaleString('default', { month: 'short' }) : `Week ${selectedPeriod}`} {selectedYear}
                                    </h4>
                                    <div className="max-h-48 overflow-y-auto space-y-2">
                                        {currentReadings.map(reading => (
                                            <div key={reading.id} className="flex justify-between text-sm py-1 border-b border-blue-100 last:border-0">
                                                <span className="text-gray-600 text-xs">{new Date(reading.time).toLocaleDateString()}</span>
                                                <span className="font-bold">{reading.value}</span>
                                            </div>
                                        ))}
                                        {currentReadings.length === 0 && <p className="text-xs text-gray-400 italic">No data.</p>}
                                    </div>
                                </div>

                                {/* Previous Year Window */}
                                <div className="border rounded-lg p-3 bg-gray-50/50">
                                    <h4 className="font-semibold text-sm text-gray-600 mb-2 border-b border-gray-200 pb-1">
                                        {viewMode === 'month' ? new Date(0, selectedPeriod - 1).toLocaleString('default', { month: 'short' }) : `Week ${selectedPeriod}`} {selectedYear - 1}
                                    </h4>
                                    <div className="max-h-48 overflow-y-auto space-y-2">
                                        {prevReadings.map(reading => (
                                            <div key={reading.id} className="flex justify-between text-sm py-1 border-b border-gray-200 last:border-0">
                                                <span className="text-gray-500 text-xs">{new Date(reading.time).toLocaleDateString()}</span>
                                                <span className="font-medium text-gray-700">{reading.value}</span>
                                            </div>
                                        ))}
                                        {prevReadings.length === 0 && <p className="text-xs text-gray-400 italic">No data.</p>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {meters.length === 0 && (
                    <div className="p-8 bg-white rounded-xl text-center text-gray-400 border border-dashed border-gray-200">
                        No meters installed in this unit.
                    </div>
                )}
            </div>
        </main>
    );
}
