"use client";
import { useLanguage } from '@/context/LanguageContext';

// Grey placeholder of a page while its data loads, roughly in the shape of the page:
// "cards" = grid of boxes (buildings), "list" = rows in one box, "form" = narrow form
export default function PageSkeleton({ variant = 'list', rows = 5 }: { variant?: 'cards' | 'list' | 'form'; rows?: number }) {
    const { t } = useLanguage();
    const bar = 'bg-gray-200 rounded animate-pulse';
    const box = 'bg-white -mx-4 sm:mx-0 rounded-none sm:rounded-xl border-x-0 sm:border-x shadow-sm border border-gray-100';

    return (
        <main className="min-h-screen bg-gray-50 p-4 sm:p-8" aria-busy="true">
            <span className="sr-only">{t.common.loading}</span>
            <div className={variant === 'form' ? 'max-w-md mx-auto' : 'max-w-7xl mx-auto'} aria-hidden="true">
                <div className={`${bar} h-4 w-40 mb-3`} />
                <div className={`${bar} h-8 w-64 mb-8`} />
                {variant === 'cards' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: rows }, (_, i) => (
                            <div key={i} className={`${box} p-4 sm:p-6 space-y-3`}>
                                <div className={`${bar} h-5 w-2/3`} />
                                <div className={`${bar} h-4 w-1/2`} />
                                <div className={`${bar} h-4 w-1/4`} />
                            </div>
                        ))}
                    </div>
                )}
                {variant === 'list' && (
                    <div className={`${box} divide-y divide-gray-100`}>
                        {Array.from({ length: rows }, (_, i) => (
                            <div key={i} className="px-4 sm:px-6 py-4 flex justify-between gap-4">
                                <div className={`${bar} h-5 w-1/3`} />
                                <div className={`${bar} h-5 w-16`} />
                            </div>
                        ))}
                    </div>
                )}
                {variant === 'form' && (
                    <div className={`${box} p-4 sm:p-6 space-y-5`}>
                        {Array.from({ length: rows }, (_, i) => (
                            <div key={i} className="space-y-2">
                                <div className={`${bar} h-4 w-24`} />
                                <div className={`${bar} h-9 w-full`} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
