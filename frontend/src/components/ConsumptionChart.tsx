"use client";
import React, { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

interface Reading {
    value: number;
    time: string;
}

interface ConsumptionChartProps {
    readings: Reading[]; // sorted by time ascending
    year: number;
    unitOfMeasure: string;
    selectedMonth: number | null; // 1-12, highlighted column
    onSelectMonth: (month: number) => void;
    format: (value: number) => string;
}

// Consumption per month (index 0 = January), null when the month has no usable readings.
// Same rule as the period view: first reading in the month up to the first reading after it.
const monthlyConsumption = (readings: Reading[], year: number): (number | null)[] => {
    return Array.from({ length: 12 }, (_, month) => {
        let firstIdx = -1;
        let lastIdx = -1;
        readings.forEach((r, i) => {
            const d = new Date(r.time);
            if (d.getFullYear() === year && d.getMonth() === month) {
                if (firstIdx === -1) firstIdx = i;
                lastIdx = i;
            }
        });
        if (firstIdx === -1) return null;
        const endIdx = lastIdx < readings.length - 1 ? lastIdx + 1 : lastIdx;
        if (endIdx === firstIdx) return null;
        return readings[endIdx].value - readings[firstIdx].value;
    });
};

// Round the axis maximum up to a clean step (1, 2, 2.5, 5 × 10^n), 4 intervals
const niceScale = (max: number) => {
    const raw = max / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
    return { step, top: Math.ceil(max / step) * step };
};

export default function ConsumptionChart({ readings, year, unitOfMeasure, selectedMonth, onSelectMonth, format }: ConsumptionChartProps) {
    const { t, language } = useLanguage();
    const [hovered, setHovered] = useState<number | null>(null);
    const locale = language === 'cs' ? 'cs-CZ' : 'en-US';

    const current = monthlyConsumption(readings, year);
    const previous = monthlyConsumption(readings, year - 1);
    const max = Math.max(0, ...current.map(v => v ?? 0), ...previous.map(v => v ?? 0));

    const monthName = (m: number, style: 'long' | 'short') => new Date(2000, m).toLocaleString(locale, { month: style });
    const formatValue = (v: number | null) => v === null ? '–' : `${format(v)} ${unitOfMeasure}`;

    if (max <= 0) {
        return (
            <div className="mb-6 p-4 text-center text-xs text-gray-400 italic border border-dashed border-gray-200 rounded-lg">
                {t.unit.monthlyConsumption}: {t.unit.noData}
            </div>
        );
    }

    const { step, top } = niceScale(max);
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    const height = (v: number | null) => `${(Math.max(0, v ?? 0) / top) * 100}%`;

    return (
        <div className="mb-6">
            <div className="flex flex-wrap justify-between items-baseline gap-2 mb-3">
                <h4 className="font-semibold text-sm text-gray-700">{t.unit.monthlyConsumption} ({unitOfMeasure})</h4>
                <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-600" />{year}</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-gray-400" />{year - 1}</span>
                </div>
            </div>

            <div className="flex">
                {/* Y axis */}
                <div className="relative w-12 h-40 shrink-0 text-[10px] text-gray-500 tabular-nums">
                    {ticks.map(tick => (
                        <span key={tick} className="absolute right-2" style={{ bottom: `${(tick / top) * 100}%`, transform: 'translateY(50%)' }}>
                            {format(tick)}
                        </span>
                    ))}
                </div>

                <div className="relative flex-1 min-w-0">
                    {/* Gridlines */}
                    <div className="absolute inset-x-0 top-0 h-40 pointer-events-none">
                        {ticks.map(tick => (
                            <div key={tick} className="absolute inset-x-0 border-t border-gray-100" style={{ bottom: `${(tick / top) * 100}%` }} />
                        ))}
                    </div>

                    {/* Columns: one button per month, the whole slot is the hit target */}
                    <div className="relative flex h-40">
                        {current.map((cur, m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => onSelectMonth(m + 1)}
                                onMouseEnter={() => setHovered(m)}
                                onMouseLeave={() => setHovered(null)}
                                onFocus={() => setHovered(m)}
                                onBlur={() => setHovered(null)}
                                aria-label={`${monthName(m, 'long')}: ${year} ${formatValue(cur)}, ${year - 1} ${formatValue(previous[m])}`}
                                className={`flex-1 min-w-0 h-full flex items-end justify-center gap-[2px] rounded-t-md outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${selectedMonth === m + 1 ? 'bg-blue-50' : hovered === m ? 'bg-gray-50' : ''}`}
                            >
                                <span className="w-[35%] max-w-3 bg-gray-400 rounded-t" style={{ height: height(previous[m]) }} />
                                <span className="w-[35%] max-w-3 bg-blue-600 rounded-t" style={{ height: height(cur) }} />
                            </button>
                        ))}
                    </div>

                    {/* Month labels */}
                    <div className="flex border-t border-gray-200">
                        {current.map((_, m) => (
                            <span key={m} className={`flex-1 min-w-0 text-center text-[10px] pt-1 truncate ${selectedMonth === m + 1 ? 'text-blue-800 font-bold' : 'text-gray-500'}`}>
                                {monthName(m, 'short')}
                            </span>
                        ))}
                    </div>

                    {/* Tooltip */}
                    {hovered !== null && (
                        <div
                            className="absolute bottom-full mb-1 z-10 bg-white border border-gray-200 shadow-md rounded-md px-3 py-2 text-xs whitespace-nowrap pointer-events-none"
                            style={hovered < 2
                                ? { left: `${(hovered / 12) * 100}%` }
                                : hovered > 9
                                    ? { right: `${((11 - hovered) / 12) * 100}%` }
                                    : { left: `${((hovered + 0.5) / 12) * 100}%`, transform: 'translateX(-50%)' }}
                        >
                            <p className="text-gray-500 mb-1">{monthName(hovered, 'long')}</p>
                            {[{ y: year, v: current[hovered], key: 'bg-blue-600' }, { y: year - 1, v: previous[hovered], key: 'bg-gray-400' }].map(row => (
                                <p key={row.y} className="flex items-center gap-2">
                                    <span className={`w-3 h-0.5 ${row.key}`} />
                                    <span className="font-bold font-mono text-gray-900">{formatValue(row.v)}</span>
                                    <span className="text-gray-500">{row.y}</span>
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap justify-between items-baseline gap-2 mt-2">
                <p className="text-[11px] text-gray-400">{t.unit.chartHint}</p>
                <details className="text-xs text-gray-600">
                    <summary className="cursor-pointer text-blue-600 hover:underline">{t.unit.showTable}</summary>
                    <table className="mt-2 tabular-nums">
                        <thead>
                            <tr className="text-gray-500">
                                <th className="text-left font-medium pr-6">{t.unit.month}</th>
                                <th className="text-right font-medium pr-6">{year}</th>
                                <th className="text-right font-medium">{year - 1}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {current.map((cur, m) => (
                                <tr key={m} className="border-t border-gray-100">
                                    <td className="pr-6 py-0.5">{monthName(m, 'long')}</td>
                                    <td className="text-right pr-6 font-mono">{formatValue(cur)}</td>
                                    <td className="text-right font-mono">{formatValue(previous[m])}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </details>
            </div>
        </div>
    );
}
