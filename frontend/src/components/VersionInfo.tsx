"use client";
import { useLanguage } from '@/context/LanguageContext';
import { WEB_VERSION, formatVersion, useServerVersion } from '@/lib/version';

// "Homiq 2026.10.13 · a876087", with a label on a development instance (login page and page footer)
export default function VersionInfo({ className = '' }: { className?: string }) {
    const { t } = useLanguage();
    const server = useServerVersion();
    return (
        <p className={`text-xs text-gray-400 tabular-nums ${className}`}>
            Homiq {formatVersion(WEB_VERSION) ?? t.version.unknown}
            {server?.env === 'dev' && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">{t.version.dev}</span>
            )}
        </p>
    );
}
