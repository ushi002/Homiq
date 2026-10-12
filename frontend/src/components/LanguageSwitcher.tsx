"use client";
import { useLanguage } from "@/context/LanguageContext";

// compact: a single button switching to the other language (for narrow screens)
export default function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
    const { language, setLanguage } = useLanguage();

    if (compact) {
        const other = language === 'cs' ? 'en' : 'cs';
        return (
            <button
                onClick={() => setLanguage(other)}
                className="px-2 py-1 rounded text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            >
                {other === 'cs' ? 'CZ' : 'EN'}
            </button>
        );
    }

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
