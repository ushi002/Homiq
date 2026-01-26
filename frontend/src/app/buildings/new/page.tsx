"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api';

export default function CreateBuilding() {
    const router = useRouter();
    const [form, setForm] = useState({
        name: '',
        address: '',
        description: '',
        influx_db_name: '',
        influx_unit_tag: '',
        influx_measurements: ''
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await authFetch('/buildings/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            });

            if (res.ok) {
                const newBuilding = await res.json();
                router.push(`/buildings/${newBuilding.id}`);
            } else {
                alert("Failed to create building");
            }
        } catch (err) {
            console.error(err);
            alert("An error occurred");
        }
    };

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-lg w-full">
                <div className="mb-6">
                    <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
                    <h1 className="text-2xl font-bold text-gray-800">Create New Building</h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder="e.g. Sunrise Apartments"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <input
                            type="text"
                            value={form.address}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder="e.g. 123 Main St"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">InfluxDB Database Name</label>
                        <input
                            type="text"
                            value={form.influx_db_name}
                            onChange={e => setForm({ ...form, influx_db_name: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder="e.g. homiq_db_01"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">InfluxDB Unit Tag</label>
                        <input
                            type="text"
                            value={form.influx_unit_tag}
                            onChange={e => setForm({ ...form, influx_unit_tag: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder="e.g. unit (default) or jednotka"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">InfluxDB Measurements (Optional)</label>
                        <input
                            type="text"
                            value={form.influx_measurements}
                            onChange={e => setForm({ ...form, influx_measurements: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder="e.g. sv_l[m3,Cold Water], tea_kwh[kWh,Heating]"
                        />
                        <p className="text-xs text-gray-500 mt-1">Format: tag[unit,name], ...</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Description</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            rows={3}
                            placeholder="Optional description..."
                        />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm mt-2">
                        Create Building
                    </button>
                </form>
            </div>
        </main>
    );
}
