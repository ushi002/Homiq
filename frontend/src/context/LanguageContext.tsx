"use client";
import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { setStored, useStored } from '@/lib/stored';
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
    // Czech unless English was chosen in this browser
    const language: Language = useStored('homiq_lang') === 'en' ? 'en' : 'cs';
    const changeLanguage = (lang: Language) => setStored('homiq_lang', lang);

    const t = language === 'cs' ? cs : en;

    // Screen readers and the browser's translate offer follow the chosen language
    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

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
