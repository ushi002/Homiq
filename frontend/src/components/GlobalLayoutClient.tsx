"use client";

import { usePathname } from 'next/navigation';
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AppHeader from "@/components/AppHeader";
import ThemeToggle from "@/components/ThemeToggle";
import VersionInfo from "@/components/VersionInfo";

export default function GlobalLayoutClient({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    // Login and invite pages have no app header, only the language switcher in the corner
    const isOverlayPage = pathname === '/login' || pathname.startsWith('/invite/');

    return (
        <>
            {isOverlayPage ? (
                <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
                    <ThemeToggle />
                    <LanguageSwitcher />
                </div>
            ) : (
                <AppHeader />
            )}
            {children}
            {!isOverlayPage && (
                <footer className="pb-6 text-center">
                    <VersionInfo />
                </footer>
            )}
        </>
    );
}
