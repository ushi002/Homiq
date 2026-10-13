"use client";
import { CARD, EMPTY_STATE, FILTER_LABEL, FILTER_SELECT, PAGE } from '@/lib/ui';
import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { usePageTitle } from '@/lib/pageTitle';
import Breadcrumbs from '@/components/Breadcrumbs';
import EnergyChart, { EnergyDay } from '@/components/EnergyChart';
import SignatureChart, { Signature } from '@/components/SignatureChart';

interface EnergyUnit {
    id: string;
    unit_number: string;
    floor: number;
    area_m2: number | null;
    heat_loss_w: number | null;
    position_coef: number | null;
    kwh: number | null;
    complete: boolean;
    kwh_per_m2: number | null;
    expected_kwh: number | null;
    ratio: number | null;
    flag: 'high' | 'low' | null;
    corrected_kwh: number | null;
    billing_share: number | null;
    has_meter: boolean;
    last_reading: string | null; // newest reading of its heat meters
}

interface Energy {
    start: string;
    end: string; // exclusive
    has_location: boolean;
    last_reading: string | null;
    design: { indoor_c: number; outdoor_c: number; heat_loss_kw: number | null; kw_per_k: number | null; units_with_loss: number; units_with_loss_total: number };
    rules: { high_ratio: number; low_ratio: number; heating_below_c: number };
    days: EnergyDay[];
    signature: Signature | null;
    units: EnergyUnit[];
}

type SortKey = 'unit' | 'kwh' | 'kwh_per_m2' | 'ratio' | 'corrected_kwh';

// Months offered in the period selects: three heating seasons back
const monthOptions = () => {
    const now = new Date();
    const first = new Date(now.getFullYear() - (now.getMonth() >= 8 ? 2 : 3), 8, 1);
    const list: string[] = [];
    for (let d = first; d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return list.reverse();
};

const nextMonth = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

export default function BuildingEnergy({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { token, user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const { t, language } = useLanguage();
    const locale = language === 'cs' ? 'cs-CZ' : 'en-US';
    const [building, setBuilding] = useState<{ name: string } | null>(null);
    usePageTitle(building ? `${t.energy.title} – ${building.name}` : t.energy.title);
    const [data, setData] = useState<Energy | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    // Requested period (months, inclusive); empty = the heating season up to the last reading
    const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
    const [mode, setMode] = useState<'daily' | 'monthly'>('monthly');
    const [onlyDeviations, setOnlyDeviations] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('unit');
    const [sortDesc, setSortDesc] = useState(false);

    useEffect(() => {
        if (authLoading) return;
        if (!token) {
            router.push('/login');
            return;
        }
        // Every unit's consumption: owners go to the building detail (their units)
        if (user?.role === 'owner') {
            router.replace(`/buildings/${id}`);
            return;
        }
        authFetch(`/buildings/${id}`)
            .then(res => res.ok ? res.json() : null)
            .then(setBuilding)
            .catch(err => console.error(err));
    }, [id, token, authLoading, user?.role, router]);

    useEffect(() => {
        if (authLoading || !token || user?.role === 'owner') return;
        let stale = false;
        const query = period ? `?start=${period.from}-01&end=${nextMonth(period.to)}-01` : '';
        authFetch(`/buildings/${id}/energy${query}`)
            .then(async res => {
                if (res.status === 403) {
                    if (!stale) setForbidden(true);
                    return;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!stale) {
                    setData(json);
                    setError(false);
                }
            })
            .catch(err => {
                console.error(err);
                if (!stale) setError(true);
            })
            .finally(() => { if (!stale) setLoading(false); });
        return () => { stale = true; };
    }, [id, token, authLoading, user?.role, period]);

    const choose = (from: string, to: string) => {
        setLoading(true);
        setPeriod(from <= to ? { from, to } : { from: to, to: from });
    };

    if (forbidden) {
        return (
            <main className={PAGE}>
                <Breadcrumbs items={[{ label: t.nav.buildings, href: '/' }]} />
                <div className="p-8 bg-white rounded-xl text-center text-red-600 border border-red-100">{t.energy.noAccess}</div>
            </main>
        );
    }

    const fmt = (v: number | null, digits = 0) => v === null ? '–' : v.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
    const fixed2 = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ratioText = (r: number) => r < 0.01 ? `<${(0.01).toLocaleString(locale)}×` : `${r.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
    const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' });
    const noDataText = (u: EnergyUnit) => !u.has_meter ? t.energy.noMeter
        : u.last_reading && u.last_reading.slice(0, 10) < (data?.start ?? '') ? t.energy.silentSince.replace('{{date}}', shortDate(u.last_reading))
        : t.energy.noData;
    const shownFrom = period?.from ?? data?.start.slice(0, 7) ?? '';
    const lastDay = data ? new Date(new Date(`${data.end}T00:00:00Z`).getTime() - 86400000) : null;
    const shownTo = period?.to ?? (lastDay ? lastDay.toISOString().slice(0, 7) : '');
    const months = monthOptions();
    const monthLabel = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleString(locale, { month: 'long', year: 'numeric' });

    const days = data?.days ?? [];
    const totalKwh = days.reduce((s, d) => s + (d.kwh ?? 0), 0);
    const temps = days.filter(d => d.temp !== null);
    const avgTemp = temps.length ? temps.reduce((s, d) => s + (d.temp as number), 0) / temps.length : null;
    const deviations = (data?.units ?? []).filter(u => u.flag).length;
    const hasLoss = (data?.design.units_with_loss ?? 0) > 0;

    const sortValue = (u: EnergyUnit) => sortKey === 'unit' ? 0 : (u[sortKey] ?? -Infinity);
    const units = [...(data?.units ?? [])]
        .filter(u => !onlyDeviations || u.flag)
        .sort((a, b) => {
            const cmp = sortKey === 'unit'
                ? a.unit_number.localeCompare(b.unit_number, locale, { numeric: true })
                : (sortValue(a) as number) - (sortValue(b) as number);
            return sortDesc ? -cmp : cmp;
        });
    const sortBy = (key: SortKey) => {
        if (key === sortKey) setSortDesc(!sortDesc);
        else { setSortKey(key); setSortDesc(key !== 'unit'); }
    };
    const header = (key: SortKey | null, label: string, right = true) => (
        <th className={`px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`} aria-sort={key && key === sortKey ? (sortDesc ? 'descending' : 'ascending') : undefined}>
            {key ? (
                <button onClick={() => sortBy(key)} className="hover:text-gray-900">
                    {label}{key === sortKey ? (sortDesc ? ' ↓' : ' ↑') : ''}
                </button>
            ) : label}
        </th>
    );

    return (
        <main className={PAGE}>
            <Breadcrumbs items={[
                { label: t.nav.buildings, href: '/' },
                { label: building?.name ?? '…', href: `/buildings/${id}` },
                { label: t.energy.title },
            ]} />
            <h1 className="text-3xl font-bold mb-6">{t.energy.title}</h1>

            <div className={`${CARD} p-4 mb-6 flex flex-wrap items-end gap-4`}>
                <div>
                    <label htmlFor="energy-from" className={FILTER_LABEL}>{t.energy.from}</label>
                    <select id="energy-from" value={shownFrom} onChange={e => choose(e.target.value, shownTo)} className={`mt-1 block ${FILTER_SELECT}`}>
                        {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </select>
                </div>
                <div>
                    <label htmlFor="energy-to" className={FILTER_LABEL}>{t.energy.to}</label>
                    <select id="energy-to" value={shownTo} onChange={e => choose(shownFrom, e.target.value)} className={`mt-1 block ${FILTER_SELECT}`}>
                        {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </select>
                </div>
                {data?.last_reading && lastDay && (
                    <p className="text-sm text-gray-500 pb-1">{t.energy.dataUntil.replace('{{date}}', lastDay.toLocaleDateString(locale, { timeZone: 'UTC' }))}</p>
                )}
            </div>

            {error && <div className="p-4 mb-6 text-center text-red-600 bg-white rounded-xl border border-red-100">{t.messages.errorGeneric}</div>}
            {!data && loading && <p className={EMPTY_STATE} aria-busy="true">{t.energy.loading}</p>}

            {data && (
                <div className={`transition-opacity ${loading ? 'opacity-50' : ''}`} aria-busy={loading}>
                    {!data.has_location && <p className="mb-6 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">{t.energy.noLocation}</p>}

                    {/* Key numbers */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                        <div className={`${CARD} p-4`}>
                            <p className="text-sm text-gray-500">{t.energy.consumption}</p>
                            <p className="text-2xl font-bold tabular-nums">{fmt(totalKwh)} <span className="text-base font-normal text-gray-500">kWh</span></p>
                        </div>
                        <div className={`${CARD} p-4`}>
                            <p className="text-sm text-gray-500">{t.energy.avgTemp}</p>
                            <p className="text-2xl font-bold tabular-nums">{avgTemp === null ? '–' : `${fmt(avgTemp, 1)} °C`}</p>
                        </div>
                        <div className={`${CARD} p-4`}>
                            <p className="text-sm text-gray-500">{t.energy.signature}</p>
                            {data.signature ? (
                                <>
                                    <p className="text-2xl font-bold tabular-nums">{fixed2(data.signature.kw_per_k)} <span className="text-base font-normal text-gray-500">kW/K {t.energy.measured}</span></p>
                                    {data.design.kw_per_k !== null && (
                                        <p className="text-sm tabular-nums text-gray-600">
                                            {fixed2(data.design.kw_per_k)} kW/K {t.energy.calculated}
                                            {data.design.units_with_loss < data.design.units_with_loss_total && (
                                                <span className="block text-xs text-gray-500">
                                                    {t.energy.designUnits.replace('{{n}}', String(data.design.units_with_loss)).replace('{{total}}', String(data.design.units_with_loss_total))}
                                                </span>
                                            )}
                                        </p>
                                    )}
                                    <p className="text-xs text-gray-500 mt-1">
                                        {t.energy.heatingBelow.replace('{{t}}', fmt(data.signature.balance_temp_c, 1))}
                                        {data.signature.r2 !== null && <> · {t.energy.fit.replace('{{r2}}', fmt(data.signature.r2, 2))}</>}
                                    </p>
                                </>
                            ) : <p className="text-sm text-gray-500 mt-1">{t.energy.noSignature}</p>}
                        </div>
                    </div>

                    {/* Consumption and temperature over time */}
                    <div className={`${CARD} p-4 sm:p-6 mb-6`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <h2 className="text-lg font-semibold">{t.energy.chartTitle}</h2>
                            <div className="flex gap-1 text-sm" role="group">
                                {(['monthly', 'daily'] as const).map(m => (
                                    <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
                                            className={`px-3 py-1 rounded-md ${mode === m ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
                                        {m === 'monthly' ? t.energy.monthly : t.energy.daily}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <EnergyChart days={days} mode={mode} />
                    </div>

                    {/* Energy signature */}
                    {data.signature && (
                        <div className={`${CARD} p-4 sm:p-6 mb-6`}>
                            <h2 className="text-lg font-semibold mb-1">{t.energy.signatureTitle}</h2>
                            <p className="text-xs text-gray-500 mb-3">
                                {t.energy.signatureHint.replace('{{t}}', fmt(data.rules.heating_below_c))}{' '}
                                {t.energy.heatingSeason.replace('{{from}}', shortDate(data.signature.from)).replace('{{to}}', shortDate(data.signature.to))}
                            </p>
                            <div className="max-w-2xl">
                                <SignatureChart days={days} signature={data.signature} designKwPerK={data.design.kw_per_k} heatingBelow={data.rules.heating_below_c} />
                            </div>
                            {data.design.heat_loss_kw !== null && (
                                <p className="text-xs text-gray-500 mt-2">
                                    {t.energy.signatureExplain.replace('{{kw}}', fmt(data.design.heat_loss_kw, 1)).replace('{{out}}', fmt(data.design.outdoor_c))}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Units */}
                    <div className={`${CARD} mb-6`}>
                        <div className="p-4 sm:p-6 pb-2 sm:pb-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h2 className="text-lg font-semibold">{t.energy.unitsTitle}</h2>
                                {deviations > 0 && (
                                    <button onClick={() => setOnlyDeviations(!onlyDeviations)} aria-pressed={onlyDeviations}
                                            className={`px-3 py-1 rounded-lg border text-sm ${onlyDeviations ? 'bg-red-50 border-red-200 text-red-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                                        {t.energy.onlyDeviations.replace('{{count}}', String(deviations))}
                                    </button>
                                )}
                            </div>
                            {hasLoss ? (
                                <>
                                    <p className="text-xs text-gray-500 mt-1">
                                        {t.energy.unitsHint.replace('{{high}}', fmt(data.rules.high_ratio)).replace('{{low}}', fmt(data.rules.low_ratio, 2))}
                                    </p>
                                    <p className="text-xs text-gray-500">{t.energy.billingHint}</p>
                                </>
                            ) : <p className="text-sm text-gray-500 mt-1">{t.energy.noLoss}</p>}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm tabular-nums">
                                <thead className="text-xs text-gray-500 border-b border-gray-100">
                                    <tr>
                                        {header('unit', t.consumption.unit, false)}
                                        {header(null, t.energy.floor, false)}
                                        {header(null, t.energy.area)}
                                        {header('kwh', `${t.energy.kwh} (kWh)`)}
                                        {header('kwh_per_m2', t.energy.kwhPerM2)}
                                        {header(null, `${t.energy.expected} (kWh)`)}
                                        {header('ratio', t.energy.ratio)}
                                        {header(null, t.energy.coef)}
                                        {header('corrected_kwh', `${t.energy.corrected} (kWh)`)}
                                        {header(null, t.energy.share)}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {units.map(u => (
                                        <tr key={u.id} className={u.flag === 'high' ? 'bg-red-500/10' : u.flag === 'low' ? 'bg-amber-500/10' : ''}>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <Link href={`/units/${u.id}`} className="font-medium text-blue-600 hover:underline">{u.unit_number}</Link>
                                                {u.flag && <span className="sr-only"> ({u.flag === 'high' ? t.energy.high : t.energy.low})</span>}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap text-gray-600">{u.floor > 0 ? t.building.storey.replace('{{n}}', String(u.floor)) : '–'}</td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">{u.area_m2 ? `${fmt(u.area_m2, 1)} m²` : '–'}</td>
                                            <td className="px-3 py-2 text-right whitespace-nowrap">
                                                {u.kwh === null ? <span className={u.has_meter ? 'text-amber-800' : 'text-gray-500'}>{noDataText(u)}</span> : fmt(u.kwh)}
                                                {u.kwh !== null && !u.complete && <span className="text-gray-500 cursor-help" title={t.energy.incomplete}>*</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right">{fmt(u.kwh_per_m2, 1)}</td>
                                            <td className="px-3 py-2 text-right text-gray-600">{fmt(u.expected_kwh)}</td>
                                            <td className={`px-3 py-2 text-right font-medium ${u.flag === 'high' ? 'text-red-700' : u.flag === 'low' ? 'text-amber-800' : ''}`}
                                                title={u.flag === 'high' ? t.energy.high : u.flag === 'low' ? t.energy.low : undefined}>
                                                {u.ratio === null ? '–' : ratioText(u.ratio)}
                                            </td>
                                            <td className="px-3 py-2 text-right text-gray-600">{fmt(u.position_coef, 3)}</td>
                                            <td className="px-3 py-2 text-right">{fmt(u.corrected_kwh)}</td>
                                            <td className="px-3 py-2 text-right">{u.billing_share === null ? '–' : `${fmt(u.billing_share * 100, 1)} %`}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Place for the boiler room gas invoices (not implemented yet) */}
                    <div className={`${CARD} p-4 sm:p-6`}>
                        <h2 className="text-lg font-semibold mb-1">{t.energy.invoicesTitle}</h2>
                        <p className="text-sm text-gray-500">{t.energy.invoicesSoon}</p>
                    </div>
                </div>
            )}
        </main>
    );
}
