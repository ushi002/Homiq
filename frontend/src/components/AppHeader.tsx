"use client";
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';

export default function AppHeader() {
    const { user, token, logout } = useAuth();
    const { t } = useLanguage();
    const pathname = usePathname();

    const links = [
        // Owners see a list of their units on the home page, not buildings
        { href: '/', label: user?.role === 'owner' ? t.dashboard.myUnits : t.nav.buildings, active: pathname === '/' || pathname.startsWith('/buildings') || pathname.startsWith('/units') },
        ...(user?.role === 'admin' || user?.role === 'home_lord' ? [{ href: '/users', label: t.nav.users, active: pathname.startsWith('/users') }] : []),
    ];
    const name = user?.full_name || user?.email || '';

    return (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
            <div className="px-4 sm:px-8 h-14 flex items-center gap-1.5 sm:gap-6">
                <Link href="/" className="font-bold text-lg text-blue-700">Homiq</Link>
                {token && (
                    <nav className="flex gap-1 text-sm">
                        {links.map(l => (
                            <Link
                                key={l.href}
                                href={l.href}
                                aria-current={l.active ? 'page' : undefined}
                                className={`px-1.5 sm:px-3 py-1.5 rounded-md ${l.active ? 'bg-blue-50 text-blue-800 font-medium' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                            >
                                {l.label}
                            </Link>
                        ))}
                    </nav>
                )}
                <div className="ml-auto flex items-center gap-1 sm:gap-4">
                    <ThemeToggle />
                    <span className="sm:hidden"><LanguageSwitcher compact /></span>
                    <span className="hidden sm:block"><LanguageSwitcher /></span>
                    {token && (
                        <>
                            <Link href="/profile" title={t.nav.profile} className={`text-sm hover:underline ${pathname.startsWith('/profile') ? 'text-blue-800 font-medium' : 'text-gray-700'}`}>
                                <span className="hidden sm:inline">{name}</span>
                                <span className="sm:hidden w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center">
                                    {name.charAt(0).toUpperCase() || '?'}
                                </span>
                            </Link>
                            <button
                                onClick={() => logout()}
                                title={t.common.logout}
                                aria-label={t.common.logout}
                                className="text-sm text-red-600 hover:bg-red-50 px-2 sm:px-3 py-1.5 rounded-md"
                            >
                                <span className="hidden sm:inline">{t.common.logout}</span>
                                {/* Arrow leaving a door: logout icon on narrow screens */}
                                <svg className="sm:hidden w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                                </svg>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}
