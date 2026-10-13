"use client";
import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { niceScale } from '@/lib/chart';
import type { EnergyDay } from '@/components/EnergyChart';

export interface Signature {
    days: number;
    slope: number; // kWh/day per °C (negative)
    intercept: number; // kWh/day at 0 °C
    kw_per_k: number;
    balance_temp_c: number; // heating stops above this
    r2: number | null;
    from: string; // the heating days used for the line (YYYY-MM-DD)
    to: string;
}

// Small viewBox: the text scales up with the width, readable on phones too
const W = 400;
const H = 250;
const PAD = { left: 44, right: 8, top: 8, bottom: 34 };

// Energy signature: daily consumption against the outdoor temperature, the line fitted through the
// heating days and a line with the slope of the heat loss calculation (through the same balance point)
export default function SignatureChart({ days, signature, designKwPerK, heatingBelow }: {
    days: EnergyDay[];
    signature: Signature;
    designKwPerK: number | null;
    heatingBelow: number;
}) {
    const { t, language } = useLanguage();
    const locale = language === 'cs' ? 'cs-CZ' : 'en-US';
    const points = days.filter(d => d.complete && d.temp !== null && d.kwh !== null) as (EnergyDay & { temp: number; kwh: number })[];
    if (!points.length) return null;

    const xMin = Math.floor(Math.min(...points.map(p => p.temp)) / 5) * 5;
    const xMax = Math.max(xMin + 5, Math.ceil(Math.max(...points.map(p => p.temp)) / 5) * 5);
    const { step, top } = niceScale(Math.max(...points.map(p => p.kwh), signature.intercept + signature.slope * xMin));
    const x = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
    const y = (v: number) => H - PAD.bottom - (Math.max(0, Math.min(top, v)) / top) * (H - PAD.top - PAD.bottom);
    const xTicks = Array.from({ length: (xMax - xMin) / 5 + 1 }, (_, i) => xMin + i * 5);
    const yTicks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
    const balance = Math.min(signature.balance_temp_c, xMax);
    const fitAt = (v: number) => signature.intercept + signature.slope * v;
    const designSlope = designKwPerK !== null ? -designKwPerK * 24 : null;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto text-gray-500" role="img" aria-label={t.energy.signatureTitle}>
            {yTicks.map(v => (
                <g key={`y${v}`}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-gray-100" />
                    <text x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="currentColor">{v.toLocaleString(locale)}</text>
                </g>
            ))}
            {xTicks.map(v => (
                <text key={`x${v}`} x={x(v)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize={11} fill="currentColor">{v}</text>
            ))}
            <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="currentColor">{t.energy.outdoorAxis}</text>
            <text x={12} y={(PAD.top + H - PAD.bottom) / 2} textAnchor="middle" fontSize={11} fill="currentColor"
                  transform={`rotate(-90 12 ${(PAD.top + H - PAD.bottom) / 2})`}>{t.energy.kwhPerDay}</text>
            <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} className="stroke-gray-300" />
            {points.map(p => (
                <circle key={p.date} cx={x(p.temp)} cy={y(p.kwh)} r={2.5}
                        className={p.temp < heatingBelow && p.kwh > 0 && p.date >= signature.from && p.date <= signature.to ? 'fill-blue-500/70' : 'fill-gray-400/60'}>
                    <title>{`${new Date(`${p.date}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })}: ${Math.round(p.kwh).toLocaleString(locale)} kWh, ${p.temp.toLocaleString(locale, { maximumFractionDigits: 1 })} °C`}</title>
                </circle>
            ))}
            <line x1={x(xMin)} y1={y(fitAt(xMin))} x2={x(balance)} y2={y(fitAt(balance))} className="stroke-blue-700" strokeWidth={2.5} />
            {designSlope !== null && (
                <line x1={x(xMin)} y1={y(designSlope * (xMin - signature.balance_temp_c))} x2={x(balance)} y2={y(designSlope * (balance - signature.balance_temp_c))}
                      className="stroke-orange-500" strokeWidth={2} strokeDasharray="6 4" />
            )}
        </svg>
    );
}
