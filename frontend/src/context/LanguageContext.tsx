"use client";
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Translations } from '@/locales/translations';
import { cs } from '@/locales/cs';
import { en } from '@/locales/en';

type Language = 'cs' | 'en';

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<Language>('cs'); // Default to Czech

    // Optional: Load from local storage
    useEffect(() => {
        const saved = localStorage.getItem('homiq_lang') as Language;
        if (saved && (saved === 'cs' || saved === 'en')) {
            setLanguage(saved);
        }
    }, []);

    const changeLanguage = (lang: Language) => {
        setLanguage(lang);
        localStorage.setItem('homiq_lang', lang);
    };

    const t = language === 'cs' ? cs : en;

    return (
        <LanguageContext.Provider value={{ language, setLanguage: changeLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
