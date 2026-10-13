"use client";
import React, { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { niceScale } from '@/lib/chart';

export interface EnergyDay {
    date: string; // YYYY-MM-DD (UTC day)
    kwh: number | null;
    complete: boolean; // data from almost all meters
    temp: number | null; // mean outdoor temperature °C
}

interface Bar {
    label: string; // tooltip heading
    axis: string | null; // label under the axis, null = none
    kwh: number | null;
    temp: number | null;
    complete: boolean;
}

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

// Building heat consumption as bars (by day or month) with the outdoor temperature as a line
export default function EnergyChart({ days, mode }: { days: EnergyDay[]; mode: 'daily' | 'monthly' }) {
    const { t, language } = useLanguage();
    const locale = language === 'cs' ? 'cs-CZ' : 'en-US';
    const [hovered, setHovered] = useState<number | null>(null);
    const fmt = (v: number, digits = 0) => v.toLocaleString(locale, { maximumFractionDigits: digits });
    const monthName = (date: string, style: 'short' | 'long') => utc(date).toLocaleString(locale, { month: style, timeZone: 'UTC' });

    let bars: Bar[];
    if (mode === 'daily') {
        bars = days.map(d => ({
            label: utc(d.date).toLocaleDateString(locale, { timeZone: 'UTC' }),
            axis: d.date.endsWith('-01') ? monthName(d.date, 'short') : null,
            kwh: d.kwh, temp: d.temp, complete: d.complete,
        }));
    } else {
        const months = new Map<string, EnergyDay[]>();
        days.forEach(d => months.set(d.date.slice(0, 7), [...(months.get(d.date.slice(0, 7)) ?? []), d]));
        bars = [...months.entries()].map(([month, list]) => {
            const kwh = list.filter(d => d.kwh !== null);
            const temps = list.filter(d => d.temp !== null);
            const first = `${month}-01`;
            return {
                label: `${monthName(first, 'long')} ${month.slice(0, 4)}`,
                axis: monthName(first, 'short'),
                kwh: kwh.length ? kwh.reduce((s, d) => s + (d.kwh as number), 0) : null,
                temp: temps.length ? temps.reduce((s, d) => s + (d.temp as number), 0) / temps.length : null,
                complete: list.every(d => d.complete),
            };
        });
    }

    const max = Math.max(0, ...bars.map(b => b.kwh ?? 0));
    if (!bars.length || max <= 0) return null;
    const { step, top } = niceScale(max);
    const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    const temps = bars.map(b => b.temp).filter((v): v is number => v !== null);
    const tMin = temps.length ? Math.floor(Math.min(...temps) / 5) * 5 : 0;
    const tMax = temps.length ? Math.max(tMin + 5, Math.ceil(Math.max(...temps) / 5) * 5) : 5;
    const tTicks = Array.from({ length: (tMax - tMin) / 5 + 1 }, (_, i) => tMin + i * 5);
    const tY = (v: number) => 100 - ((v - tMin) / (tMax - tMin)) * 100;
    // Temperature line, broken where a day has no temperature
    const segments: string[] = [];
    let current: string[] = [];
    bars.forEach((b, i) => {
        if (b.temp === null) {
            if (current.length) segments.push(current.join(' '));
            current = [];
        } else {
            current.push(`${i + 0.5},${tY(b.temp)}`);
        }
    });
    if (current.length) segments.push(current.join(' '));
    const n = bars.length;

    return (
        <div>
            <div className="flex justify-end gap-4 text-xs text-gray-600 mb-2">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-600" />{t.energy.consumption} (kWh)</span>
                {temps.length > 0 && <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-orange-500" />{t.energy.temperature} (°C)</span>}
            </div>
            <div className="flex">
                <div className="relative w-12 h-48 shrink-0 text-[10px] text-gray-500 tabular-nums">
                    {ticks.map(tick => (
                        <span key={tick} className="absolute right-2" style={{ bottom: `${(tick / top) * 100}%`, transform: 'translateY(50%)' }}>{fmt(tick)}</span>
                    ))}
                </div>
                <div className="relative flex-1 min-w-0">
                    <div className="absolute inset-x-0 top-0 h-48 pointer-events-none">
                        {ticks.map(tick => (
                            <div key={tick} className="absolute inset-x-0 border-t border-gray-100" style={{ bottom: `${(tick / top) * 100}%` }} />
                        ))}
                    </div>
                    <div className="relative flex h-48">
                        {bars.map((b, i) => (
                            <div
                                key={i}
                                onMouseEnter={() => setHovered(i)}
                                onMouseLeave={() => setHovered(null)}
                                className={`flex-1 min-w-0 h-full flex items-end justify-center ${hovered === i ? 'bg-gray-500/10' : ''}`}
                            >
                                <span
                                    className={`w-[70%] rounded-t ${b.complete ? 'bg-blue-600' : 'bg-blue-300'}`}
                                    style={{ height: `${((b.kwh ?? 0) / top) * 100}%` }}
                                />
                            </div>
                        ))}
                        {temps.length > 0 && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" viewBox={`0 0 ${n} 100`} preserveAspectRatio="none" aria-hidden="true">
                                {segments.map((points, i) => (
                                    <polyline key={i} points={points} fill="none" className="stroke-orange-500" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                                ))}
                            </svg>
                        )}
                    </div>
                    <div className="relative h-5 border-t border-gray-200">
                        {bars.map((b, i) => b.axis && (
                            <span key={i} className="absolute top-0 pt-1 text-[10px] text-gray-500 whitespace-nowrap"
                                  style={mode === 'daily' ? { left: `${(i / n) * 100}%` } : { left: `${((i + 0.5) / n) * 100}%`, transform: 'translateX(-50%)' }}>
                                {b.axis}
                            </span>
                        ))}
                    </div>
                    {hovered !== null && (
                        <div
                            className="absolute bottom-full mb-1 z-10 bg-white border border-gray-200 shadow-md rounded-md px-3 py-2 text-xs whitespace-nowrap pointer-events-none"
                            style={hovered < n / 2 ? { left: `${(hovered / n) * 100}%` } : { right: `${((n - 1 - hovered) / n) * 100}%` }}
                        >
                            <p className="text-gray-500 mb-1">{bars[hovered].label}</p>
                            <p className="font-bold tabular-nums text-gray-900">{bars[hovered].kwh === null ? '–' : `${fmt(bars[hovered].kwh as number)} kWh`}</p>
                            {bars[hovered].temp !== null && <p className="tabular-nums text-orange-700">{fmt(bars[hovered].temp as number, 1)} °C</p>}
                            {!bars[hovered].complete && <p className="text-gray-500">{t.energy.incompleteDay}</p>}
                        </div>
                    )}
                </div>
                {temps.length > 0 && (
                    <div className="relative w-8 h-48 shrink-0 text-[10px] text-orange-700 tabular-nums">
                        {tTicks.map(tick => (
                            <span key={tick} className="absolute left-1" style={{ top: `${tY(tick)}%`, transform: 'translateY(-50%)' }}>{tick}°</span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
