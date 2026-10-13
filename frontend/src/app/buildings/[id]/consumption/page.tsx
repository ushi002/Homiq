"use client";
import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import YoyChange from '@/components/YoyChange';
import ConsumptionChart from '@/components/ConsumptionChart';
import Breadcrumbs from '@/components/Breadcrumbs';
import { buildCsv, downloadCsv, fileSlug } from '@/lib/csv';
import { useToast } from '@/context/ToastContext';
import { useApiError } from '@/lib/apiError';

interface Cell {
    value: number | null;
    complete: boolean;
    missing_days?: number; // days without data at the start or end of the period
    period_days?: number;
}

interface UnitRow {
    id: string;
    unit_number: string;
    owner: string | null;
    values: Record<string, { current: Cell; previous: Cell }>;
}

interface MonthlyData {
    meter_types: { type: string; unit_of_measure: string }[];
    months: Record<string, { current: (number | null)[]; previous: (number | null)[] }>;
}

interface ConsumptionData {
    last_reading?: string | null;
    meter_types: { type: string; unit_of_measure: string }[];
    units: UnitRow[];
}

const EMPTY: Cell = { value: null, complete: false };

interface ExportMeter {
    unit_number: string;
    owner: string | null;
    type: string;
    unit_of_measure: string;
    serial_number: string;
    readings: [string, number][]; // [UTC time, meter reading]
}

// Sum of a column; complete only if every unit with a value is complete
const sumCells = (cells: Cell[]): Cell => {
    const known = cells.filter(c => c.value !== null);
    if (known.length === 0) return EMPTY;
    return {
        value: known.reduce((acc, c) => acc + (c.value as number), 0),
        complete: known.every(c => c.complete),
    };
};

export default function BuildingConsumption({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { token, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const { t, language } = useLanguage();
    const toast = useToast();
    const apiError = useApiError();
    const locale = language === 'cs' ? 'cs-CZ' : 'en-US';

    const currentYear = new Date().getFullYear();
    // Start with the last closed month; the current one is never complete yet
    const lastMonth = new Date(currentYear, new Date().getMonth() - 1, 1);
    const [year, setYear] = useState(lastMonth.getFullYear());
    const [month, setMonth] = useState(lastMonth.getMonth() + 1); // 0 = whole year
    const [building, setBuilding] = useState<{ name: string } | null>(null);
    const [data, setData] = useState<ConsumptionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [sortKey, setSortKey] = useState<string>('unit'); // 'unit' or a meter type
    const [sortDesc, setSortDesc] = useState(false);
    const [exporting, setExporting] = useState(false);
    // Whole building by month for the chart; loaded separately, the first load of a year is slow
    const [monthly, setMonthly] = useState<MonthlyData | null>(null);
    const [chartType, setChartType] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading) return;
        if (!token) {
            router.push('/login');
            return;
        }
        authFetch(`/buildings/${id}`)
            .then(res => res.json())
            .then(setBuilding)
            .catch(err => console.error(err));
    }, [id, token, authLoading]);

    useEffect(() => {
        if (authLoading || !token) return;
        // Ignore responses for a period that is no longer selected (fast year + month changes)
        let stale = false;
        setLoading(true);
        setError('');
        authFetch(`/buildings/${id}/consumption?year=${year}${month ? `&month=${month}` : ''}`)
            .then(async res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const json = await res.json();
                if (!stale) setData(json);
            })
            .catch(err => {
                console.error(err);
                if (!stale) setError(t.messages.errorGeneric);
            })
            .finally(() => {
                if (!stale) setLoading(false);
            });
        return () => { stale = true; };
    }, [id, token, authLoading, year, month]);

    useEffect(() => {
        if (authLoading || !token) return;
        let stale = false;
        setMonthly(null);
        authFetch(`/buildings/${id}/consumption_monthly?year=${year}`)
            .then(res => res.ok ? res.json() : null)
            .then(json => { if (!stale) setMonthly(json); })
            .catch(err => console.error(err));
        return () => { stale = true; };
    }, [id, token, authLoading, year]);

    const format = (v: number | null) => v === null ? '–' : v.toLocaleString(locale, { maximumFractionDigits: 2 });

    const typeLabel = (type: string) => {
        if (type === 'water_cold') return t.building.categoryColdWater;
        if (type === 'water_hot') return t.building.categoryHotWater;
        if (type === 'heat') return t.building.categoryHeat;
        if (type === 'electricity') return t.consumption.categoryElectricity;
        return type;
    };

    const cell = (row: UnitRow, type: string) => row.values[type] ?? { current: EMPTY, previous: EMPTY };

    const toggleSort = (key: string) => {
        if (sortKey === key) {
            setSortDesc(!sortDesc);
        } else {
            setSortKey(key);
            setSortDesc(key !== 'unit'); // consumption columns start with the highest value
        }
    };

    const rows = [...(data?.units ?? [])].sort((a, b) => {
        let cmp: number;
        if (sortKey === 'unit') {
            cmp = a.unit_number.localeCompare(b.unit_number, locale, { numeric: true });
        } else {
            // Units without a value always go last
            const av = cell(a, sortKey).current.value;
            const bv = cell(b, sortKey).current.value;
            if (av === null || bv === null) return av === null ? (bv === null ? 0 : 1) : -1;
            cmp = av - bv;
        }
        return sortDesc ? -cmp : cmp;
    });

    const hasIncomplete = data?.units.some(u => Object.values(u.values).some(v => v.current.value !== null && !v.current.complete));
    const years = Array.from({ length: 4 }, (_, i) => currentYear - i);
    const sortArrow = (key: string) => sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : '';

    if (authLoading || !token) return <div className="p-8 text-center">{t.common.loading}</div>;

    type Pair = { current: Cell; previous: Cell };
    // A percentage needs both periods complete and a non-zero previous value
    const comparable = (c: Pair) => c.current.complete && c.previous.complete && (c.previous.value ?? 0) > 0;
    const missingTitle = (c: Cell) => c.missing_days !== undefined
        ? t.unit.missingDays.replace('{{missing}}', String(c.missing_days)).replace('{{total}}', String(c.period_days))
        : t.unit.incompletePeriod;
    const noComparisonReason = (c: Pair) => {
        if (!c.current.complete) return missingTitle(c.current);
        if (c.previous.complete && c.previous.value === 0) return t.consumption.reasonPreviousZero.replace('{{year}}', String(year - 1));
        return `${t.consumption.reasonPrevious.replace('{{year}}', String(year - 1))} ${c.previous.value !== null ? missingTitle(c.previous) : ''}`;
    };

    // Header note of a column: the usual "change vs", or why nothing in it can be compared
    const columnNote = (type: string) => {
        const cells = (data?.units ?? []).map(u => cell(u, type)).filter(c => c.current.value !== null);
        if (cells.length === 0 || cells.some(comparable)) {
            return { text: t.consumption.changeVs.replace('{{year}}', String(year - 1)), comparable: true };
        }
        return {
            // Some values are final, so the previous year is what is missing
            text: cells.some(c => c.current.complete)
                ? t.consumption.noComparisonPrevious.replace('{{year}}', String(year - 1))
                : t.consumption.noComparisonCurrent,
            comparable: false,
        };
    };

    // All readings of all meters in all units for the selected period, one row per reading.
    // The period runs from local midnight (meters report around midnight UTC) and times are local.
    const exportReadings = async () => {
        setExporting(true);
        try {
            const start = new Date(year, month ? month - 1 : 0, 1);
            const end = new Date(year, month ? month : 12, 1);
            const res = await authFetch(`/buildings/${id}/readings?start=${start.toISOString()}&end=${end.toISOString()}`);
            const json = await res.json();
            if (!res.ok) {
                toast.error(apiError(t.csv.exportFailed, json.detail));
                return;
            }
            const pad = (n: number) => String(n).padStart(2, '0');
            const localTime = (iso: string) => {
                const d = new Date(iso);
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
            };
            const header = [t.consumption.unit, t.consumption.owner, t.csv.meter, `${t.csv.serial} (${json.device_tag})`, t.csv.time, t.csv.reading, t.csv.unitOfMeasure];
            const rows = (json.meters as ExportMeter[]).flatMap(m => m.readings.map(([time, value]) =>
                [m.unit_number, m.owner ?? '', typeLabel(m.type), m.serial_number, localTime(time), value, m.unit_of_measure]));
            const period = month ? `${year}-${pad(month)}` : String(year);
            downloadCsv(`odecty_${fileSlug(building?.name ?? id)}_${period}.csv`, buildCsv([header, ...rows], language));
        } catch (err) {
            console.error(err);
            toast.error(t.csv.exportFailed);
        } finally {
            setExporting(false);
        }
    };

    // columnComparable: when false the header already explains the missing change, so cells stay clean
    const renderCell = (c: Pair, uom: string, columnComparable: boolean) => (
        <>
            <span className="font-mono">{format(c.current.value)}</span>
            {c.current.value !== null && !c.current.complete && <span className="text-gray-400 cursor-help" title={missingTitle(c.current)}>*</span>}
            {c.current.value !== null && <span className="text-xs text-gray-400 ml-1">{uom}</span>}
            {comparable(c) ? (
                <div className="text-xs">
                    <YoyChange current={c.current.value as number} previous={c.previous.value as number} previousYear={year - 1} compact />
                </div>
            ) : c.current.value !== null && columnComparable && (
                <div className="text-xs text-gray-400 cursor-help" title={noComparisonReason(c)}>{t.consumption.noComparison}</div>
            )}
        </>
    );

    return (
        <main className="min-h-screen p-4 sm:p-8 bg-gray-50 text-gray-900">
            <div className="max-w-7xl mx-auto">
                <Breadcrumbs items={[
                    { label: t.nav.buildings, href: '/' },
                    { label: building?.name ?? '…', href: `/buildings/${id}` },
                    { label: t.consumption.title },
                ]} />
                <h1 className="text-3xl font-bold mb-6">{t.consumption.title}</h1>

                <div className="bg-white p-4 -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 flex flex-wrap gap-4 items-center mb-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">{t.unit.year}</label>
                        <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="mt-1 block w-24 rounded-md border-gray-300 shadow-sm border p-1 text-sm">
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">{t.consumption.period}</label>
                        <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="mt-1 block w-36 rounded-md border-gray-300 shadow-sm border p-1 text-sm">
                            <option value={0}>{t.consumption.wholeYear}</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString(locale, { month: 'long' })}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={exportReadings}
                        disabled={!data || data.meter_types.length === 0 || exporting}
                        className="sm:ml-auto self-end px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        ⬇ {exporting ? t.csv.preparing : t.csv.downloadReadings}
                    </button>
                </div>

                {data?.last_reading && (() => {
                    // When data stopped coming (same texts as the unit detail)
                    const last = new Date(data.last_reading);
                    const old = Date.now() - last.getTime() > 7 * 86400000;
                    return (
                        <p className={`text-sm -mt-3 mb-4 ${old ? 'text-amber-700 cursor-help' : 'text-gray-500'}`} title={old ? t.unit.lastReadingOld : undefined}>
                            {t.unit.lastReading}: {last.toLocaleDateString(locale)}
                        </p>
                    );
                })()}

                {/* Whole building by month; a meter type at a time, a click on a month selects it below */}
                {data && data.meter_types.length > 0 && (() => {
                    const type = chartType && data.meter_types.some(mt => mt.type === chartType) ? chartType : data.meter_types[0].type;
                    const uom = data.meter_types.find(mt => mt.type === type)!.unit_of_measure;
                    return (
                        <div className="bg-white p-4 sm:p-6 -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 mb-6">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                                <h2 className="text-lg font-semibold">{t.consumption.buildingChart}</h2>
                                <div className="flex flex-wrap gap-1 text-sm">
                                    {data.meter_types.map(mt => (
                                        <button
                                            key={mt.type}
                                            onClick={() => setChartType(mt.type)}
                                            className={`px-3 py-1 rounded-md ${mt.type === type ? 'bg-blue-100 text-blue-800 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                                        >
                                            {typeLabel(mt.type)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {monthly?.months[type] ? (
                                <ConsumptionChart
                                    monthly={monthly.months[type]}
                                    year={year}
                                    unitOfMeasure={uom}
                                    selectedMonth={month || null}
                                    onSelectMonth={setMonth}
                                    format={format}
                                />
                            ) : (
                                <p className="h-40 flex items-center justify-center text-sm text-gray-400" aria-busy="true">{t.consumption.chartLoading}</p>
                            )}
                        </div>
                    );
                })()}

                {error && <div className="p-4 mb-6 text-center text-red-600 bg-white rounded-xl border border-red-100">{error}</div>}
                {!data && loading && <div className="p-8 text-center">{t.common.loading}</div>}

                {data && data.meter_types.length === 0 && (
                    <div className="p-8 bg-white rounded-xl text-center text-gray-400 border border-dashed border-gray-200">{t.consumption.noMeters}</div>
                )}

                {data && data.meter_types.length > 0 && (
                    <div className={`bg-white -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100 overflow-x-auto transition-opacity ${loading ? 'opacity-50' : ''}`}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-gray-500">
                                    <th className="px-3 sm:px-4 py-3 font-medium">
                                        <button onClick={() => toggleSort('unit')} className="hover:text-gray-900">{t.consumption.unit}{sortArrow('unit')}</button>
                                    </th>
                                    <th className="px-3 sm:px-4 py-3 font-medium hidden sm:table-cell">{t.consumption.owner}</th>
                                    {data.meter_types.map(mt => (
                                        <th key={mt.type} className="px-3 sm:px-4 py-3 font-medium text-right whitespace-nowrap">
                                            <button onClick={() => toggleSort(mt.type)} className="hover:text-gray-900">
                                                {typeLabel(mt.type)} ({mt.unit_of_measure}){sortArrow(mt.type)}
                                            </button>
                                            <div className={`text-xs font-normal ${columnNote(mt.type).comparable ? 'text-gray-400' : 'text-amber-700'}`}>{columnNote(mt.type).text}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                                            <Link href={`/units/${row.id}`} className="text-blue-600 hover:underline font-medium">{row.unit_number}</Link>
                                        </td>
                                        <td className="px-3 sm:px-4 py-2 text-gray-600 hidden sm:table-cell">{row.owner ?? <span className="text-gray-300">–</span>}</td>
                                        {data.meter_types.map(mt => (
                                            <td key={mt.type} className="px-3 sm:px-4 py-2 text-right whitespace-nowrap align-top">
                                                {renderCell(cell(row, mt.type), mt.unit_of_measure, columnNote(mt.type).comparable)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 font-semibold bg-gray-50">
                                    <td className="px-3 sm:px-4 py-3">{t.consumption.total}</td>
                                    <td className="hidden sm:table-cell" />
                                    {data.meter_types.map(mt => (
                                        <td key={mt.type} className="px-3 sm:px-4 py-3 text-right whitespace-nowrap align-top">
                                            {renderCell({
                                                current: sumCells(data.units.map(u => cell(u, mt.type).current)),
                                                previous: sumCells(data.units.map(u => cell(u, mt.type).previous)),
                                            }, mt.unit_of_measure, columnNote(mt.type).comparable)}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {hasIncomplete && <p className="text-xs text-gray-500 mt-3">{t.consumption.incompleteNote}</p>}
            </div>
        </main>
    );
}
