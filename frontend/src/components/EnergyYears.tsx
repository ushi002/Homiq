"use client";
import React, { useEffect, useState } from 'react';
import { authFetch } from '@/lib/api';
import { useLanguage } from '@/context/LanguageContext';
import { CARD } from '@/lib/ui';

interface YearWarning {
    code: 'same_gj' | 'price_mismatch' | 'degree_days';
    heating?: number;
    hot_water?: number;
    billing?: number;
    own?: number;
}

interface EnergyYear {
    year: number;
    unreliable: boolean; // shown, but left out of comparisons
    heating_gj: number | null;
    hot_water_gj: number | null;
    total_cost: number | null;
    price_per_gj: number | null;
    degree_days: number | null;
    degree_days_billing: number | null;
    heating_kwh_per_dd: number | null;
    heating_kwh_per_m2: number | null;
    hot_water_metered_m3: number | null;
    hot_water_kwh_per_m3: number | null;
    hot_water_losses: number | null;
    cold_water_diff: number | null;
    hot_water_diff: number | null;
    note: string | null;
    warnings: YearWarning[];
}

interface MeterCheck {
    year: number;
    from: string;
    to: string;
    measured_units: number;
    billed_units: number | null;
    degree_day_share: number | null;
    year_estimate: number | null;
    ratio: number | null;
}

interface EnergyYears {
    years: EnergyYear[];
    meter_checks: MeterCheck[];
    constants: { hot_water_theory_kwh_m3?: number };
}

const TH = 'px-3 py-2 font-medium text-right';
const TD = 'px-3 py-2 text-right whitespace-nowrap';

// Yearly balance from the heating bills, below the energy overview (admins and managers)
export default function EnergyYears({ buildingId }: { buildingId: string }) {
    const { t, language } = useLanguage();
    const locale = language === 'cs' ? 'cs-CZ' : 'en-US';
    const [data, setData] = useState<EnergyYears | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let stale = false;
        authFetch(`/buildings/${buildingId}/energy_years`)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(json => { if (!stale) setData(json); })
            .catch(err => {
                console.error(err);
                if (!stale) setFailed(true);
            });
        return () => { stale = true; };
    }, [buildingId]);

    if (failed) return null;
    if (!data) return <p className={`${CARD} p-4 sm:p-6 text-sm text-gray-500`} aria-busy="true">{t.energyYears.loading}</p>;
    if (!data.years.length) return null;

    const fmt = (v: number | null, digits = 0) => v === null ? '–' : v.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
    const pct = (v: number | null) => v === null ? '–' : `${(v * 100).toLocaleString(locale, { maximumFractionDigits: 0 })} %`;
    const signedPct = (v: number | null) => v === null ? '–' : `${v > 0 ? '+' : ''}${pct(v)}`;
    const date = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' });

    const warnings = data.years.flatMap(y => {
        const out: string[] = [];
        const mismatch = y.warnings.find(w => w.code === 'price_mismatch');
        if (y.warnings.some(w => w.code === 'same_gj')) {
            out.push(t.energyYears.warnSameGj.replace('{{year}}', String(y.year))
                .replace('{{heating}}', fmt(mismatch?.heating ?? null, 2)).replace('{{hotWater}}', fmt(mismatch?.hot_water ?? null, 2)));
        }
        const dd = y.warnings.find(w => w.code === 'degree_days');
        if (dd) {
            out.push(t.energyYears.warnDegreeDays.replace('{{year}}', String(y.year))
                .replace('{{billing}}', fmt(dd.billing ?? null, 1)).replace('{{own}}', fmt(dd.own ?? null)));
        }
        return out;
    });
    const perM3 = data.years.map(y => y.hot_water_kwh_per_m3).filter((v): v is number => v !== null);
    const losses = data.years.map(y => y.hot_water_losses).filter((v): v is number => v !== null);
    const notes = data.years.filter(y => y.note);

    return (
        <div className={`${CARD} mb-6`}>
            <div className="p-4 sm:p-6 pb-2 sm:pb-2">
                <h2 className="text-lg font-semibold">{t.energyYears.title}</h2>
                <p className="text-xs text-gray-500 mt-1">{t.energyYears.intro}</p>
                {warnings.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-amber-800">
                        {warnings.map(w => <li key={w}>⚠ {w}</li>)}
                    </ul>
                )}
            </div>

            <h3 className="px-4 sm:px-6 mt-3 text-sm font-semibold text-gray-700">{t.energyYears.heatTitle}</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                    <thead className="text-xs text-gray-500 border-b border-gray-100">
                        <tr>
                            <th className="px-3 py-2 font-medium text-left">{t.energyYears.year}</th>
                            <th className={TH}>{t.energyYears.heatingGj}</th>
                            <th className={TH}>{t.energyYears.hotWaterGj}</th>
                            <th className={TH}>{t.energyYears.totalCost}</th>
                            <th className={TH}>{t.energyYears.pricePerGj}</th>
                            <th className={TH} title={t.energyYears.degreeDaysHint}>{t.energyYears.degreeDays}</th>
                            <th className={TH}>{t.energyYears.perDegreeDay}</th>
                            <th className={TH}>{t.energyYears.perM2}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.years.map(y => (
                            <tr key={y.year} className={y.unreliable ? 'text-gray-400' : ''}>
                                <td className="px-3 py-2 font-medium" title={y.unreliable ? t.energyYears.unreliable : undefined}>
                                    {y.year}{y.unreliable && <span className="block text-xs font-normal">{t.energyYears.unreliableLabel}</span>}
                                </td>
                                <td className={TD}>{fmt(y.heating_gj, 1)}</td>
                                <td className={TD}>{fmt(y.hot_water_gj, 1)}</td>
                                <td className={TD}>{fmt(y.total_cost)}</td>
                                <td className={TD}>{fmt(y.price_per_gj)}</td>
                                <td className={TD}>
                                    {fmt(y.degree_days)}
                                    {y.degree_days_billing !== null && <span className="text-xs text-gray-500"> ({fmt(y.degree_days_billing)})</span>}
                                </td>
                                <td className={TD}>{fmt(y.heating_kwh_per_dd, 1)}</td>
                                <td className={TD}>{fmt(y.heating_kwh_per_m2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="px-4 sm:px-6 pt-2 text-xs text-gray-500">
                {t.energyYears.degreeDaysHint}
                {data.years.some(y => y.unreliable) && <> <span className="text-gray-400">{t.energyYears.unreliableLabel}</span> = {t.energyYears.unreliable}.</>}
            </p>

            <h3 className="px-4 sm:px-6 mt-5 text-sm font-semibold text-gray-700">{t.energyYears.waterTitle}</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                    <thead className="text-xs text-gray-500 border-b border-gray-100">
                        <tr>
                            <th className="px-3 py-2 font-medium text-left">{t.energyYears.year}</th>
                            <th className={TH}>{t.energyYears.hotWaterM3}</th>
                            <th className={TH}>{t.energyYears.kwhPerM3}</th>
                            <th className={TH}>{t.energyYears.losses}</th>
                            <th className={TH}>{t.energyYears.coldDiff}</th>
                            <th className={TH}>{t.energyYears.hotDiff}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.years.map(y => (
                            <tr key={y.year} className={y.unreliable ? 'text-gray-400' : ''}>
                                <td className="px-3 py-2 font-medium" title={y.unreliable ? t.energyYears.unreliable : undefined}>
                                    {y.year}{y.unreliable && <span className="block text-xs font-normal">{t.energyYears.unreliableLabel}</span>}
                                </td>
                                <td className={TD}>{fmt(y.hot_water_metered_m3)}</td>
                                <td className={TD}>{fmt(y.hot_water_kwh_per_m3)}</td>
                                <td className={TD}>{pct(y.hot_water_losses)}</td>
                                <td className={TD}>{signedPct(y.cold_water_diff)}</td>
                                <td className={TD}>{signedPct(y.hot_water_diff)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-4 sm:px-6 pt-2 space-y-2">
                <p className="text-xs text-gray-500">{t.energyYears.diffHint}</p>
                {perM3.length > 0 && losses.length > 0 && data.constants.hot_water_theory_kwh_m3 && (
                    <p className="p-3 rounded-lg bg-blue-50 text-blue-900 text-sm">
                        💡 {t.energyYears.lossesTip
                            .replace('{{theory}}', fmt(data.constants.hot_water_theory_kwh_m3))
                            .replace('{{min}}', fmt(Math.min(...perM3))).replace('{{max}}', fmt(Math.max(...perM3)))
                            .replace('{{lossMin}}', fmt(Math.min(...losses) * 100)).replace('{{lossMax}}', fmt(Math.max(...losses) * 100))}
                    </p>
                )}
            </div>

            <div className="p-4 sm:p-6">
                <h3 className="text-sm font-semibold text-gray-700">{t.energyYears.checkTitle}</h3>
                <p className="text-xs text-gray-500 mb-2">{t.energyYears.checkHint}</p>
                {data.meter_checks.length ? (
                    <ul className="text-sm space-y-1 tabular-nums">
                        {data.meter_checks.map(c => (
                            <li key={c.year}>
                                {t.energyYears.checkRow.replace('{{year}}', String(c.year)).replace('{{from}}', date(c.from)).replace('{{to}}', date(c.to))
                                    .replace('{{measured}}', fmt(c.measured_units))}
                                {c.degree_day_share !== null && c.degree_day_share < 0.995 && c.year_estimate !== null &&
                                    t.energyYears.checkEstimate.replace('{{estimate}}', fmt(c.year_estimate))}
                                {c.billed_units !== null &&
                                    t.energyYears.checkBilled.replace('{{billed}}', fmt(c.billed_units)).replace('{{ratio}}', fmt(c.ratio, 2))}
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-sm text-gray-500">{t.energyYears.noCheck}</p>}
                {notes.length > 0 && (
                    <details className="mt-3 text-xs text-gray-600">
                        <summary className="cursor-pointer">{t.energyYears.noteFromSource}</summary>
                        <ul className="mt-1 space-y-1">
                            {notes.map(y => <li key={y.year}><span className="font-medium">{y.year}:</span> {y.note}</li>)}
                        </ul>
                    </details>
                )}
            </div>
        </div>
    );
}
