"use client";

import { usePathname } from 'next/navigation';
import LanguageSwitcher from "@/components/LanguageSwitcher";
import AppHeader from "@/components/AppHeader";

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
                <div className="absolute top-4 right-4 z-50">
                    <LanguageSwitcher />
                </div>
            ) : (
                <AppHeader />
            )}
            {children}
        </>
    );
}
