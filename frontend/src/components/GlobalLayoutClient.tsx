"use client";

import { usePathname } from 'next/navigation';
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function GlobalLayoutClient({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    // Apply absolute positioning for login and invite pages
    const isOverlayPage = pathname === '/login' || pathname.startsWith('/invite/');

    return (
        <>
            <div className={isOverlayPage ? "absolute top-4 right-4 z-50" : "flex justify-end p-4 bg-gray-50"}>
                <LanguageSwitcher />
            </div>
            {children}
        </>
    );
}
