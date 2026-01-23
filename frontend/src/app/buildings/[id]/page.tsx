"use client";
import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Unit {
    id: string;
    unit_number: string;
    floor: number;
    area_m2: number;
}

interface Building {
    id: string;
    name: string;
    address: string;
}

export default function BuildingDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [units, setUnits] = useState<Unit[]>([]);
    const [building, setBuilding] = useState<Building | null>(null);

    useEffect(() => {
        // Fetch building info
        fetch(`http://localhost:8000/buildings/${id}`)
            .then(res => res.json())
            .then(data => setBuilding(data))
            .catch(err => console.error(err));

        // Fetch units
        fetch(`http://localhost:8000/buildings/${id}/units`)
            .then(res => res.json())
            .then(data => setUnits(data))
            .catch(err => console.error(err));
    }, [id]);

    if (!building) return <div className="p-8">Loading...</div>;

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6">
                <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
                <h1 className="text-3xl font-bold">{building.name}</h1>
                <p className="text-gray-500">{building.address}</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="font-semibold text-gray-700">Units</h2>
                </div>
                <ul className="divide-y divide-gray-100">
                    {units.map((unit) => (
                        <li key={unit.id} className="hover:bg-gray-50 transition-colors">
                            <Link href={`/units/${unit.id}`} className="block px-6 py-4 flex justify-between items-center">
                                <div>
                                    <span className="font-medium text-gray-900">Unit {unit.unit_number}</span>
                                    <span className="text-gray-400 text-sm ml-2">Floor {unit.floor}</span>
                                </div>
                                <div className="text-gray-500 text-sm">
                                    {unit.area_m2} m² &rarr;
                                </div>
                            </Link>
                        </li>
                    ))}
                    {units.length === 0 && (
                        <li className="px-6 py-8 text-center text-gray-400">No units found in this building.</li>
                    )}
                </ul>
            </div>
        </main>
    );
}
