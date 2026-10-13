"use client";
import PageSkeleton from '@/components/PageSkeleton';
import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePageTitle } from '@/lib/pageTitle';
import { authFetch } from '@/lib/api';
import UserSelect from '@/components/UserSelect';
import Breadcrumbs from '@/components/Breadcrumbs';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/context/ToastContext';
import { useApiError } from '@/lib/apiError';
import { useConfirm } from '@/context/ConfirmContext';

interface Unit {
    id: string;
    unit_number: string;
    floor: number;
    area_m2: number;
    owner?: { full_name?: string; email: string } | null;
}

interface Building {
    id: string;
    name: string;
    address: string;
    description: string;
    influx_db_name?: string;
    influx_unit_tag?: string;
    influx_device_tag?: string;
    influx_measurements?: string;
    units_fetched?: boolean;
}

export default function BuildingDetail({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const [building, setBuilding] = useState<any>(null); // Use any to allow manager_id property
    const [units, setUnits] = useState<Unit[]>([]);
    const [unitSearch, setUnitSearch] = useState('');
    const [onlyWithoutOwner, setOnlyWithoutOwner] = useState(false);
    const { user, token, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const isAdmin = user?.role === 'admin';
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', address: '', description: '', influx_db_name: '', influx_unit_tag: '', influx_device_tag: '', influx_measurements: '' });
    const { t } = useLanguage();
    const toast = useToast();
    const apiError = useApiError();
    const confirm = useConfirm();
    usePageTitle(building?.name);

    useEffect(() => {
        if (authLoading) return;
        if (!token) {
            router.push('/login');
        }
    }, [token, router, authLoading]);



    // Measurements UI State
    interface MeasurementItem {
        id: string;
        name: string;
        uom: string;
        type: string;
    }
    const [measurementsList, setMeasurementsList] = useState<MeasurementItem[]>([]);

    // Helper: Parse string "sv_l[m3,Cold Water], ..." to objects
    const parseMeasurements = (str: string): MeasurementItem[] => {
        if (!str) return [];
        const parts = str.split(/,(?![^\[]*\])/); // Split by comma ignoring brackets
        return parts.map(part => {
            part = part.trim();
            if (!part) return null;
            let name = part;
            let uom = '';
            let type = '';

            if (part.includes('[') && part.endsWith(']')) {
                const [n, content] = part.split('[');
                name = n.trim();
                const inner = content.slice(0, -1); // remove closing ]
                if (inner.includes(',')) {
                    const [u, t] = inner.split(',', 2);
                    uom = u.trim();
                    type = t.trim();
                } else {
                    uom = inner.trim();
                }
            }
            return { id: Math.random().toString(36).substr(2, 9), name, uom, type };
        }).filter(Boolean) as MeasurementItem[];
    };

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
        setEditForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
    };

    const updateMeasurement = (index: number, field: keyof MeasurementItem, value: string) => {
        const newList = [...measurementsList];
        newList[index] = { ...newList[index], [field]: value };
        setMeasurementsList(newList);
        setEditForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
    };

    useEffect(() => {
        if (authLoading || !token) return;

        // Fetch building
        authFetch(`/buildings/${id}`)
            .then(res => res.json())
            .then(data => setBuilding(data))
            .catch(err => console.error(err));

        // Fetch units
        authFetch(`/buildings/${id}/units`)
            .then(res => res.json())
            .then(data => setUnits(data))
            .catch(err => console.error(err));
    }, [id, token, authLoading]);

    useEffect(() => {
        if (building) {
            setEditForm({
                name: building.name,
                address: building.address,
                description: building.description || '',
                influx_db_name: building.influx_db_name || '',
                influx_unit_tag: building.influx_unit_tag || '',
                influx_device_tag: building.influx_device_tag || '',
                influx_measurements: building.influx_measurements || ''
            });
            setMeasurementsList(parseMeasurements(building.influx_measurements || ''));
        }
    }, [building]);

    if (authLoading || !token || !building) return <PageSkeleton variant="list" rows={8} />;

    const handleAssignManager = async (newManagerId: string) => {
        if (!isAdmin) return;
        try {
            const res = await authFetch(`/buildings/${id}/assign_manager?manager_id=${newManagerId}`, {
                method: 'PATCH'
            });
            if (res.ok) {
                // Update local state or reload
                const updated = await res.json();
                setBuilding(updated);
                toast.success(t.messages.successUpdateManager);
            } else {
                toast.error(t.messages.errorUpdateManager);
            }
        } catch (err) {
            console.error(err);
            toast.error(t.messages.errorGeneric);
        }
    };


    const handleUpdateBuilding = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await authFetch(`/buildings/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm)
            });
            if (res.ok) {
                const updated = await res.json();
                setBuilding(updated);
                setIsEditing(false);
                toast.success(t.messages.successUpdateBuilding);
            } else {
                toast.error(t.messages.errorUpdateBuilding);
            }
        } catch (err) {
            console.error(err);
            toast.error(t.messages.errorGeneric);
        }
    };

    const handleFetchUnits = async () => {
        const isReload = building.units_fetched;
        // Loading units only adds new units and meters (nothing is deleted), so no confirmation
        try {
            if (isReload) {
                // Use Reload Endpoint to preserve owners
                const res = await authFetch(`/buildings/${id}/reload_units`, {
                    method: 'POST'
                });

                if (res.ok) {
                    const data = await res.json();
                    toast.success(t.messages.successReloadUnits
                        .replace('{created}', data.units_created)
                        .replace('{connected}', data.meters_connected)
                        .replace('{moved}', data.meters_moved), { afterReload: true });
                    window.location.reload();
                } else {
                    const err = await res.json();
                    toast.error(apiError(t.messages.errorReloadUnits, err.detail));
                }
            } else {
                // Initial Fetch
                const res = await authFetch(`/buildings/${id}/fetch_units`, {
                    method: 'POST'
                });
                if (res.ok) {
                    const data = await res.json();
                    toast.success(t.messages.successSyncUnits
                        .replace('{created}', data.units_created)
                        .replace('{connected}', data.meters_connected), { afterReload: true });
                    window.location.reload();
                } else {
                    const err = await res.json();
                    toast.error(apiError(t.messages.errorSyncUnits, err.detail));
                }
            }
        } catch (err) {
            console.error(err);
            toast.error(t.messages.errorFetchUnits);
        }
    };

    const handleDeleteUnits = async () => {
        if (!(await confirm(t.messages.confirmDeleteAllUnits, { danger: true }))) return;
        if (!(await confirm(t.messages.confirmDeleteAllUnitsFinal, { danger: true }))) return;

        try {
            const res = await authFetch(`/buildings/${id}/units`, {
                method: 'DELETE'
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(t.messages.successDeleteAllUnits
                    .replace('{deletedUnits}', data.deleted_units)
                    .replace('{deletedMeters}', data.deleted_meters), { afterReload: true });
                window.location.reload();
            } else {
                toast.error(t.messages.errorDeleteAllUnits);
            }
        } catch (err) {
            console.error(err);
            toast.error(t.messages.errorGeneric);
        }
    };

    const handleDeleteBuilding = async () => {
        if (!(await confirm(t.messages.confirmDeleteBuilding, { danger: true }))) return;

        try {
            const res = await authFetch(`/buildings/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                toast.success(t.messages.successDeleteBuilding, { afterReload: true });
                window.location.href = "/"; // Redirect to dashboard
            } else {
                toast.error(t.messages.errorDeleteBuilding);
            }
        } catch (err) {
            console.error(err);
            toast.error(t.messages.errorGeneric);
        }
    };

    const unitsWithoutOwner = units.filter(u => !u.owner).length;
    const unitQuery = unitSearch.trim().toLocaleLowerCase();
    const visibleUnits = units.filter(u =>
        (!onlyWithoutOwner || !u.owner)
        && (!unitQuery || [u.unit_number, u.owner?.full_name, u.owner?.email].some(x => (x ?? '').toLocaleLowerCase().includes(unitQuery))));

    return (
        <main className="min-h-screen p-4 sm:p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6">
                <Breadcrumbs items={[{ label: user?.role === 'owner' ? t.dashboard.myUnits : t.nav.buildings, href: '/' }, { label: building.name }]} />
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
                    <div className="max-w-2xl w-full">
                        {isEditing ? (
                            <form onSubmit={handleUpdateBuilding} className="bg-white p-4 sm:p-6 -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t.building.name}</label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t.building.address}</label>
                                    <input
                                        type="text"
                                        value={editForm.address}
                                        onChange={e => setEditForm({ ...editForm, address: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t.building.influxDbName}</label>
                                    <input
                                        type="text"
                                        value={editForm.influx_db_name}
                                        onChange={e => setEditForm({ ...editForm, influx_db_name: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        placeholder={t.building.placeholderDbName}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t.building.influxUnitTag}</label>
                                    <input
                                        type="text"
                                        value={editForm.influx_unit_tag}
                                        onChange={e => setEditForm({ ...editForm, influx_unit_tag: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        placeholder={t.building.placeholderUnitTag}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t.building.influxDeviceTag}</label>
                                    <input
                                        type="text"
                                        value={editForm.influx_device_tag}
                                        onChange={e => setEditForm({ ...editForm, influx_device_tag: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        placeholder={t.building.placeholderDeviceTag}
                                    />
                                </div>
                                <div className="space-y-6">
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
                                                                    setEditForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
                                                                }}
                                                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2 text-sm"
                                                                placeholder={t.building.measurementName}
                                                            />
                                                        </div>
                                                        <div className="w-24">
                                                            <input
                                                                type="text"
                                                                value={item.uom}
                                                                onChange={e => {
                                                                    const newList = measurementsList.map(m => m.id === item.id ? { ...m, uom: e.target.value } : m);
                                                                    setMeasurementsList(newList);
                                                                    setEditForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
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
                                                                setEditForm(prev => ({ ...prev, influx_measurements: serializeMeasurements(newList) }));
                                                            }}
                                                            className="text-red-500 hover:text-red-700 p-2"
                                                            title={t.common.delete}
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
                                <input type="hidden" name="influx_measurements" value={editForm.influx_measurements} />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">{t.building.description}</label>
                                    <textarea
                                        value={editForm.description}
                                        onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 border p-2"
                                        rows={3}
                                    />
                                </div>
                                <div className="border border-red-200 rounded-md p-4">
                                    <h3 className="font-semibold text-sm text-red-700">{t.building.dangerZone}</h3>
                                    <p className="text-xs text-gray-500 mt-1 mb-3">{t.building.dangerZoneHint}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={handleDeleteUnits}
                                            disabled={!building.units_fetched}
                                            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${!building.units_fetched
                                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                                : "bg-red-50 text-red-600 hover:bg-red-100"
                                                }`}
                                        >
                                            {t.building.deleteAllUnits}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDeleteBuilding}
                                            disabled={building.units_fetched}
                                            className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${building.units_fetched
                                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                                : "bg-red-600 text-white hover:bg-red-700"
                                                }`}
                                        >
                                            {t.building.deleteBuilding}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex space-x-2">
                                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                                        {t.common.save}
                                    </button>
                                    <button type="button" onClick={() => setIsEditing(false)} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors">
                                        {t.common.cancel}
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <h1 className="text-3xl font-bold">{building.name}</h1>
                                <p className="text-gray-500">{building.address}</p>
                                {isAdmin && building.influx_db_name && (
                                    <div className="mt-2 text-sm bg-purple-50 text-purple-700 px-3 py-1 rounded-full inline-block">
                                        InfluxDB: {building.influx_db_name}
                                    </div>
                                )}
                                {building.description && <p className="text-gray-600 mt-2">{building.description}</p>}

                                {(isAdmin || user?.role === 'home_lord') && building.units_fetched && (
                                    <Link
                                        href={`/buildings/${id}/consumption`}
                                        className="mt-4 mr-4 inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                                    >
                                        {t.consumption.open}
                                    </Link>
                                )}

                                {isAdmin && (
                                    <button
                                        onClick={() => setIsEditing(true)}
                                        className="mt-4 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                                    >
                                        {t.common.edit}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                    {/* Admin Manager Assignment */}
                    {isAdmin && (
                        <div className="bg-white p-4 -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 lg:max-w-xs lg:w-full">
                            <label className="block text-sm font-medium text-gray-700 mb-1">{t.building.assignedHomeLord}</label>
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
                <div className="flex flex-wrap justify-between items-center gap-3">
                    <h2 className="text-xl font-semibold">{t.building.units}</h2>
                    {isAdmin && (
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={handleFetchUnits}
                                className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium ${building.units_fetched
                                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    : "bg-purple-100 text-purple-700 hover:bg-purple-200"
                                    }`}
                            >
                                {building.units_fetched ? t.building.reloadUnits : t.building.fetchUnits}
                            </button>
                        </div>
                    )}
                </div>
                {units.length > 8 && (
                    <div className="flex flex-wrap items-center gap-3">
                        <input
                            type="search"
                            value={unitSearch}
                            onChange={e => setUnitSearch(e.target.value)}
                            placeholder={t.building.searchUnits}
                            className="w-full sm:w-64 rounded-md border-gray-300 shadow-sm border p-1.5 text-sm bg-white"
                        />
                        {user?.role !== 'owner' && unitsWithoutOwner > 0 && (
                            <label className="flex items-center gap-2 text-sm text-gray-600">
                                <input type="checkbox" checked={onlyWithoutOwner} onChange={e => setOnlyWithoutOwner(e.target.checked)} />
                                {t.building.onlyWithoutOwner} ({unitsWithoutOwner})
                            </label>
                        )}
                    </div>
                )}
                <div className="bg-white -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 overflow-hidden">
                    <ul className="divide-y divide-gray-100">
                        {visibleUnits.map(unit => (
                            <li key={unit.id} className="hover:bg-gray-50 transition-colors">
                                <Link href={`/units/${unit.id}`} className="px-4 sm:px-6 py-2.5 flex items-center gap-3">
                                    <span className="font-semibold text-gray-800 w-28 sm:w-36 shrink-0 truncate">{unit.unit_number}</span>
                                    {user?.role !== 'owner' && (
                                        <span className={`flex-1 min-w-0 text-sm truncate ${unit.owner ? 'text-gray-600' : 'text-gray-400 italic'}`} title={unit.owner?.email}>
                                            {unit.owner ? (unit.owner.full_name || unit.owner.email) : t.building.noOwner}
                                        </span>
                                    )}
                                    {/* Floor and area are not filled in yet for most units: shown only when known */}
                                    <span className="hidden sm:inline text-sm text-gray-500 shrink-0">
                                        {unit.floor > 0 && <>{t.building.floor}: {unit.floor}</>}
                                        {unit.area_m2 > 0 && <span className="ml-4">{unit.area_m2} m²</span>}
                                    </span>
                                    <span className="text-blue-500 shrink-0 ml-auto" aria-hidden="true">&rarr;</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                    {units.length === 0 && (
                        <div className="p-6 text-center text-gray-400">{t.building.noUnits}</div>
                    )}
                    {units.length > 0 && visibleUnits.length === 0 && (
                        <div className="p-6 text-center text-gray-400">{t.building.noUnitMatch}</div>
                    )}
                </div>
            </div>
        </main >
    );
}
