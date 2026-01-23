"use client";
import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';

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

    useEffect(() => {
        // 1. Fetch unit info (skipping for brevity, assuming standard unit endpoint exists if needed)

        // 2. Fetch all meters for this unit (Need an endpoint for this, or filter on client. 
        // START_HACK: Since we don't have GET /units/{id}/meters, I will fetch all meters and filter. 
        // In production, backend should have this endpoint.)
        fetch(`http://localhost:8000/telemetry/meters/`)
            .then(res => res.json())
            .then(async (allMeters: any[]) => {
                // Filter by unit_id
                const unitMeters = allMeters.filter(m => m.unit_id === id);

                // Fetch readings for each meter
                const metersWithReadings = await Promise.all(unitMeters.map(async (meter) => {
                    const readingsRes = await fetch(`http://localhost:8000/telemetry/meters/${meter.id}/readings`);
                    const readings = await readingsRes.json();
                    return { ...meter, recent_readings: readings.slice(0, 5) }; // Top 5
                }));

                setMeters(metersWithReadings);
            })
            .catch(err => console.error(err));
    }, [id]);

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6">
                <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
                <h1 className="text-3xl font-bold">Unit Details</h1>
                <p className="text-gray-500">ID: {id}</p>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <h2 className="text-xl font-semibold">Meters & Readings</h2>

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
