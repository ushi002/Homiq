"use client";
import { useLanguage } from "@/context/LanguageContext";

export default function LanguageSwitcher() {
    const { language, setLanguage } = useLanguage();

    return (
        <div className="flex space-x-2 text-sm">
            <button
                onClick={() => setLanguage('cs')}
                className={`px-2 py-1 rounded transition-colors ${language === 'cs'
                        ? 'bg-blue-100 text-blue-800 font-bold'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
            >
                CZ
            </button>
            <span className="text-gray-300">|</span>
            <button
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 rounded transition-colors ${language === 'en'
                        ? 'bg-blue-100 text-blue-800 font-bold'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
            >
                EN
            </button>
        </div>
    );
}
