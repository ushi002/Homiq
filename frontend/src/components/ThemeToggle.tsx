"use client";
import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Theme, getTheme, setTheme, applyTheme } from '@/lib/theme';

const NEXT: Record<Theme, Theme> = { auto: 'dark', dark: 'light', light: 'auto' };

// Cycles automatic (system) -> dark -> light
export default function ThemeToggle() {
    const { t } = useLanguage();
    const [theme, setState] = useState<Theme>('auto');

    useEffect(() => {
        setState(getTheme());
        // In automatic mode follow a change of the system setting
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = () => { if (getTheme() === 'auto') applyTheme('auto'); };
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);

    const label = theme === 'auto' ? t.theme.auto : theme === 'dark' ? t.theme.dark : t.theme.light;
    return (
        <button
            onClick={() => { const next = NEXT[theme]; setTheme(next); setState(next); }}
            title={label}
            aria-label={label}
            className="p-1 sm:p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100"
        >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                {theme === 'dark' && <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />}
                {theme === 'light' && <>
                    <circle cx="12" cy="12" r="4" />
                    <path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </>}
                {theme === 'auto' && <>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3a9 9 0 010 18z" fill="currentColor" />
                </>}
            </svg>
        </button>
    );
}
