"use client";
import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/api';
import UserSelect from '@/components/UserSelect';
import { useAuth } from '@/context/AuthContext';

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
    description: string;
}

export default function BuildingDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [building, setBuilding] = useState<any>(null); // Use any to allow manager_id property
    const [units, setUnits] = useState<Unit[]>([]);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';

    useEffect(() => {
        // Fetch building
        authFetch(`http://localhost:8000/buildings/${id}`)
            .then(res => res.json())
            .then(data => setBuilding(data))
            .catch(err => console.error(err));

        // Fetch units
        authFetch(`http://localhost:8000/buildings/${id}/units`)
            .then(res => res.json())
            .then(data => setUnits(data))
            .catch(err => console.error(err));
    }, [id]);

    if (!building) return <div className="p-8">Loading...</div>;

    const handleAssignManager = async (newManagerId: string) => {
        if (!isAdmin) return;
        try {
            const res = await authFetch(`http://localhost:8000/buildings/${id}/assign_manager?manager_id=${newManagerId}`, {
                method: 'PATCH'
            });
            if (res.ok) {
                // Update local state or reload
                const updated = await res.json();
                setBuilding(updated);
                alert("Building manager updated!");
            } else {
                alert("Failed to update manager");
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6">
                <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold">{building.name}</h1>
                        <p className="text-gray-500">{building.address}</p>
                    </div>
                    {/* Admin Manager Assignment */}
                    {isAdmin && (
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 max-w-xs w-full">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Home Lord</label>
                            <UserSelect
                                value={building.manager_id || ""}
                                onChange={handleAssignManager}
                                roleFilter="home_lord"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                <h2 className="text-xl font-semibold">Units</h2>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <ul className="divide-y divide-gray-100">
                        {units.map(unit => (
                            <li key={unit.id} className="hover:bg-gray-50 transition-colors">
                                <Link href={`/units/${unit.id}`} className="block px-6 py-4 flex justify-between items-center">
                                    <div>
                                        <span className="font-bold text-gray-800 text-lg">{unit.unit_number}</span>
                                        <span className="text-gray-500 ml-4">Floor: {unit.floor}</span>
                                        <span className="text-gray-500 ml-4">{unit.area_m2} m²</span>
                                    </div>
                                    <span className="text-blue-500">View Details &rarr;</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    {units.length === 0 && (
                        <div className="p-6 text-center text-gray-400">No units found in this building.</div>
                    )}
                </div>
            </div>
        </main>
    );
}
