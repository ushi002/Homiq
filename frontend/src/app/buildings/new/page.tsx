"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';

export default function CreateBuilding() {
    const router = useRouter();
    const { t } = useLanguage();
    const [form, setForm] = useState({
        name: '',
        address: '',
        description: '',
        influx_db_name: '',
        influx_unit_tag: '',
        influx_device_tag: '',
        influx_measurements: ''
    });

    // Measurements UI State
    interface MeasurementItem {
        id: string;
        name: string;
        uom: string;
        type: string;
    }
    const [measurementsList, setMeasurementsList] = useState<MeasurementItem[]>([]);

    // Helper: Serialize objects back to string
    const serializeMeasurements = (items: MeasurementItem[]): string => {
        return items.map(m => {
            if (!m.name.trim()) return null;
            const name = m.name.trim();
            const uom = m.uom.trim();
            const type = m.type.trim();

            if (uom || type) {
                // name[uom,type]
                let content = uom;
                if (type) {
                    content = `${uom},${type}`;
                }
                return `${name}[${content}]`;
            }
            return name;
        }).filter(Boolean).join(', ');
    };

    const addMeasurement = () => {
        setMeasurementsList([...measurementsList, { id: Math.random().toString(36).substr(2, 9), name: '', uom: '', type: '' }]);
    };

    const removeMeasurement = (index: number) => {
        const newList = [...measurementsList];
        newList.splice(index, 1);
        setMeasurementsList(newList);
        setForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
    };

    const updateMeasurement = (index: number, field: keyof MeasurementItem, value: string) => {
        const newList = [...measurementsList];
        newList[index] = { ...newList[index], [field]: value };
        setMeasurementsList(newList);
        setForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // Ensure measurements are synced before submit
            const finalForm = {
                ...form,
                influx_measurements: serializeMeasurements(measurementsList)
            };

            const res = await authFetch('/buildings/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalForm)
            });

            if (res.ok) {
                const newBuilding = await res.json();
                router.push(`/buildings/${newBuilding.id}`);
            } else {
                alert(t.messages.errorCreateBuilding);
            }
        } catch (err) {
            console.error(err);
            alert(t.messages.errorGeneric);
        }
    };

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-lg w-full">
                <div className="mb-6">
                    <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">{t.common.backToDashboard}</Link>
                    <h1 className="text-2xl font-bold text-gray-800">{t.dashboard.addBuilding}</h1>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t.building.name}</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder={t.building.placeholderName}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t.building.address}</label>
                        <input
                            type="text"
                            value={form.address}
                            onChange={e => setForm({ ...form, address: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder={t.building.placeholderAddress}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t.building.influxDbName}</label>
                        <input
                            type="text"
                            value={form.influx_db_name}
                            onChange={e => setForm({ ...form, influx_db_name: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder={t.building.placeholderDbName}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t.building.influxUnitTag}</label>
                        <input
                            type="text"
                            value={form.influx_unit_tag}
                            onChange={e => setForm({ ...form, influx_unit_tag: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder={t.building.placeholderUnitTag}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t.building.influxDeviceTag}</label>
                        <input
                            type="text"
                            value={form.influx_device_tag}
                            onChange={e => setForm({ ...form, influx_device_tag: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            placeholder={t.building.placeholderDeviceTag}
                            required
                        />
                    </div>

                    <div className="space-y-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t.building.influxMeasurements}</label>
                        {[
                            { type: 'water_cold', label: t.building.categoryColdWater, color: 'text-blue-600', bg: 'bg-blue-50' },
                            { type: 'water_hot', label: t.building.categoryHotWater, color: 'text-red-600', bg: 'bg-red-50' },
                            { type: 'heat', label: t.building.categoryHeat, color: 'text-orange-600', bg: 'bg-orange-50' }
                        ].map(category => (
                            <div key={category.type} className="border rounded-md p-4 bg-gray-50/50">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className={`font-semibold text-sm ${category.color}`}>{category.label}</h3>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newId = Math.random().toString(36).substr(2, 9);
                                            setMeasurementsList([...measurementsList, { id: newId, name: '', uom: '', type: category.type }]);
                                        }}
                                        className={`text-xs px-2 py-1 rounded bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 shadow-sm`}
                                    >
                                        + {t.building.addMeasurement}
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {measurementsList.filter(m => {
                                        const mType = m.type.toLowerCase();
                                        if (category.type === 'water_cold') return mType.includes('cold') || mType === 'sv' || mType === 'water_cold';
                                        if (category.type === 'water_hot') return mType.includes('hot') || mType === 'tv' || mType === 'water_hot';
                                        if (category.type === 'heat') return mType.includes('heat') || mType === 'teplo';
                                        return false;
                                    }).map((item) => (
                                        <div key={item.id} className="flex gap-2 items-center">
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={item.name}
                                                    onChange={e => {
                                                        const newList = measurementsList.map(m => m.id === item.id ? { ...m, name: e.target.value } : m);
                                                        setMeasurementsList(newList);
                                                        // Update form state for submit
                                                        setForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
                                                    }}
                                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                                    placeholder={t.building.measurementName}
                                                    required
                                                />
                                            </div>
                                            <div className="w-24">
                                                <input
                                                    type="text"
                                                    value={item.uom}
                                                    onChange={e => {
                                                        const newList = measurementsList.map(m => m.id === item.id ? { ...m, uom: e.target.value } : m);
                                                        setMeasurementsList(newList);
                                                        setForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
                                                    }}
                                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                                    placeholder={t.building.measurementUnit}
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newList = measurementsList.filter(m => m.id !== item.id);
                                                    setMeasurementsList(newList);
                                                    setForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
                                                }}
                                                className="text-red-500 hover:text-red-700 p-2"
                                                title="Remove"
                                            >
                                                &times;
                                            </button>
                                        </div>
                                    ))}
                                    {measurementsList.filter(m => {
                                        const mType = m.type.toLowerCase();
                                        if (category.type === 'water_cold') return mType.includes('cold') || mType === 'sv' || mType === 'water_cold';
                                        if (category.type === 'water_hot') return mType.includes('hot') || mType === 'tv' || mType === 'water_hot';
                                        if (category.type === 'heat') return mType.includes('heat') || mType === 'teplo';
                                        return false;
                                    }).length === 0 && (
                                            <p className="text-xs text-gray-400 italic text-center py-2">
                                                {t.unit.noData}
                                            </p>
                                        )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t.building.description}</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm({ ...form, description: e.target.value })}
                            className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2.5"
                            rows={3}
                            placeholder={t.building.placeholderDescription}
                        />
                    </div>
                    <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors shadow-sm mt-2">
                        {t.dashboard.addBuilding}
                    </button>
                </form>
            </div>
        </main>
    );
}
