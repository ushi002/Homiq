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
                    return { ...meter, recent_readings: readings.slice(0, 5) };
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

                {meters.map(meter => (
                    <div key={meter.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-gray-800">{meter.type.toUpperCase()}</h3>
                                <p className="text-sm text-gray-500 font-mono">{meter.serial_number}</p>
                            </div>
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">{meter.unit_of_measure}</span>
                        </div>

                        <div className="space-y-2">
                            {meter.recent_readings.map(reading => (
                                <div key={reading.id} className="flex justify-between text-sm border-b border-gray-50 pb-1 last:border-0 last:pb-0">
                                    <span className="text-gray-600">{new Date(reading.time).toLocaleString()}</span>
                                    <span className="font-medium">{reading.value} {meter.unit_of_measure}</span>
                                </div>
                            ))}
                            {meter.recent_readings.length === 0 && (
                                <p className="text-sm text-gray-400 italic">No readings yet.</p>
                            )}
                        </div>
                    </div>
                ))}
                {meters.length === 0 && (
                    <div className="p-8 bg-white rounded-xl text-center text-gray-400 border border-dashed border-gray-200">
                        No meters installed in this unit.
                    </div>
                )}
            </div>
        </main>
    );
}
