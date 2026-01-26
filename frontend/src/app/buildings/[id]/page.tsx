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
    influx_db_name?: string;
    influx_unit_tag?: string;
    influx_measurements?: string;
    units_fetched?: boolean;
}

export default function BuildingDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [building, setBuilding] = useState<any>(null); // Use any to allow manager_id property
    const [units, setUnits] = useState<Unit[]>([]);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', address: '', description: '', influx_db_name: '', influx_unit_tag: '', influx_measurements: '' });

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

    useEffect(() => {
        if (building) {
            setEditForm({
                name: building.name,
                address: building.address,
                description: building.description || '',
                influx_db_name: building.influx_db_name || '',
                influx_unit_tag: building.influx_unit_tag || '',
                influx_measurements: building.influx_measurements || ''
            });
        }
    }, [building]);

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


    const handleUpdateBuilding = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await authFetch(`http://localhost:8000/buildings/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });
            if (res.ok) {
                const updated = await res.json();
                setBuilding(updated);
                setIsEditing(false);
                alert("Building updated successfully!");
            } else {
                alert("Failed to update building");
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleFetchUnits = async () => {
        const isReload = building.units_fetched;
        const message = isReload
            ? "WARNING: RELOADING units will DELETE ALL existing units, meters, and READINGS for this building, and then re-fetch them. This action cannot be undone. Start Reload?"
            : "Are you sure you want to fetch units from InfluxDB? This might take a moment.";

        if (!confirm(message)) return;

        try {
            if (isReload) {
                // Use Reload Endpoint to preserve owners
                const res = await authFetch(`http://localhost:8000/buildings/${id}/reload_units`, {
                    method: 'POST'
                });

                if (res.ok) {
                    const data = await res.json();
                    alert(`Reload Complete!\nUnits Created: ${data.units_created}\nMeters Connected: ${data.meters_connected}`);
                    window.location.reload();
                } else {
                    const err = await res.json();
                    alert(`Failed to reload: ${err.detail || 'Unknown error'}`);
                }
            } else {
                // Initial Fetch
                const res = await authFetch(`http://localhost:8000/buildings/${id}/fetch_units`, {
                    method: 'POST'
                });
                if (res.ok) {
                    const data = await res.json();
                    alert(`Sync Complete!\nUnits Created: ${data.units_created}\nMeters Connected: ${data.meters_connected}`);
                    window.location.reload();
                } else {
                    const err = await res.json();
                    alert(`Failed: ${err.detail || 'Unknown error'}`);
                }
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred while fetching units.");
        }
    };

    const handleDeleteUnits = async () => {
        if (!confirm("Are you sure you want to DELETE ALL UNITS? This action cannot be undone and will delete all units, meters, and readings associated with this building.")) return;
        if (!confirm("Please confirm again: DELETE ALL UNITS?")) return;

        try {
            const res = await authFetch(`http://localhost:8000/buildings/${id}/units`, {
                method: 'DELETE'
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Deletion Complete!\nUnits Deleted: ${data.deleted_units}\nMeters Deleted: ${data.deleted_meters}`);
                window.location.reload();
            } else {
                alert("Failed to delete units");
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred");
        }
    };

    const handleDeleteBuilding = async () => {
        if (!confirm("Are you sure you want to DELETE THIS BUILDING? This action is irreversible.")) return;

        try {
            const res = await authFetch(`http://localhost:8000/buildings/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                alert("Building deleted successfully");
                window.location.href = "/"; // Redirect to dashboard
            } else {
                alert("Failed to delete building");
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred");
        }
    };

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6">
                <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
                <div className="flex justify-between items-start">
                    <div className="max-w-2xl w-full">
                        {isEditing ? (
                            <form onSubmit={handleUpdateBuilding} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Name</label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Address</label>
                                    <input
                                        type="text"
                                        value={editForm.address}
                                        onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">InfluxDB Database Name</label>
                                    <input
                                        type="text"
                                        value={editForm.influx_db_name}
                                        onChange={e => setEditForm({ ...editForm, influx_db_name: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        placeholder="e.g. homiq_db_01"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">InfluxDB Unit Tag</label>
                                    <input
                                        type="text"
                                        value={editForm.influx_unit_tag}
                                        onChange={e => setEditForm({ ...editForm, influx_unit_tag: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        placeholder="e.g. unit (default) or jednotka"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">InfluxDB Measurements (Optional)</label>
                                    <input
                                        type="text"
                                        value={editForm.influx_measurements}
                                        onChange={e => setEditForm({ ...editForm, influx_measurements: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        placeholder="e.g. sv_l[m3,Cold Water], tea_kwh[kWh,Heating]"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Format: tag[unit,name], ...</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Description</label>
                                    <textarea
                                        value={editForm.description}
                                        onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        rows={3}
                                    />
                                </div>
                                <div className="flex space-x-2">
                                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                                        Save Changes
                                    </button>
                                    <button type="button" onClick={() => setIsEditing(false)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors">
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <h1 className="text-3xl font-bold">{building.name}</h1>
                                <p className="text-gray-500">{building.address}</p>
                                {building.influx_db_name && (
                                    <div className="mt-2 text-sm bg-purple-50 text-purple-700 px-3 py-1 rounded-full inline-block">
                                        InfluxDB: {building.influx_db_name}
                                    </div>
                                )}
                                {building.description && <p className="text-gray-600 mt-2">{building.description}</p>}

                                {isAdmin && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
                                    >
                                        Edit Details
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                    {/* Admin Manager Assignment */}
                    {isAdmin && (
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 max-w-xs w-full ml-4">
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
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-semibold">Units</h2>
                    {isAdmin && (
                        <div className="space-x-2">
                            <button
                                onClick={handleFetchUnits}
                                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${building.units_fetched
                                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                                    }`}
                            >
                                {building.units_fetched ? "Reload Units" : "Fetch Units"}
                            </button>
                            <button
                                onClick={handleDeleteUnits}
                                disabled={!building.units_fetched}
                                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${!building.units_fetched
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    : "bg-red-50 text-red-600 hover:bg-red-100"
                                    }`}
                            >
                                Delete All Units
                            </button>
                            <button
                                onClick={handleDeleteBuilding}
                                disabled={building.units_fetched}
                                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${building.units_fetched
                                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                    : "bg-red-600 text-white hover:bg-red-700"
                                    }`}
                            >
                                Delete Building
                            </button>
                        </div>
                    )}
                </div>
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
