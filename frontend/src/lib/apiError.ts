"use client";
import { useCallback } from 'react';
import { useLanguage } from '@/context/LanguageContext';

// Backend errors come as English `detail` strings (or a list for invalid input, HTTP 422).
// Known ones are translated (locales: apiErrors, keyed by the English text). An unknown one is
// shown as is only in English, so a Czech message never ends with an English sentence.
export function useApiErrorReason() {
    const { t, language } = useLanguage();
    return useCallback((detail: unknown): string | null => {
        if (Array.isArray(detail)) return t.apiErrors.invalidInput;
        if (typeof detail !== 'string' || !detail) return null;
        return t.apiErrors[detail] ?? (language === 'en' ? detail : null);
    }, [t, language]);
}

// "Prefix: reason", or just the prefix when the reason cannot be shown
export function useApiError() {
    const reason = useApiErrorReason();
    return (prefix: string, detail: unknown) => {
        const r = reason(detail);
        return r ? `${prefix}: ${r}` : prefix;
    };
}
