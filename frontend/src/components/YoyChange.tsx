"use client";
import React from 'react';
import { useLanguage } from '@/context/LanguageContext';

interface YoyChangeProps {
    current: number;
    previous: number;
    previousYear: number;
    className?: string;
}

// Year-over-year change of consumption. Higher consumption is the unfavourable direction,
// so increases are red and decreases green; the arrow carries the direction without colour.
export default function YoyChange({ current, previous, previousYear, className = '' }: YoyChangeProps) {
    const { t, language } = useLanguage();
    if (previous <= 0) return null;

    const pct = ((current - previous) / previous) * 100;
    const vs = t.unit.vsYear.replace('{{year}}', String(previousYear));

    if (Math.abs(pct) < 0.5) {
        return <span className={`text-gray-500 ${className}`}>= {t.unit.noChange} {vs}</span>;
    }

    const formatted = (pct / 100).toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', {
        style: 'percent',
        signDisplay: 'exceptZero',
        maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0,
    });
    const up = pct > 0;

    return (
        <span className={`font-medium ${up ? 'text-red-700' : 'text-green-700'} ${className}`}>
            {up ? '▲' : '▼'} {formatted} {vs}
        </span>
    );
}
