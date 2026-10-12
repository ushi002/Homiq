"use client";
import React from 'react';
import Link from 'next/link';

export interface Crumb {
    label: string;
    href?: string; // the last crumb (current page) has none
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
    return (
        <nav aria-label="breadcrumb" className="text-sm mb-2">
            <ol className="flex flex-wrap items-center gap-1 text-gray-500">
                {items.map((c, i) => (
                    <li key={i} className="flex items-center gap-1 min-w-0">
                        {i > 0 && <span className="text-gray-300" aria-hidden="true">›</span>}
                        {c.href
                            ? <Link href={c.href} className="text-blue-600 hover:underline truncate">{c.label}</Link>
                            : <span className="text-gray-700 truncate" aria-current="page">{c.label}</span>}
                    </li>
                ))}
            </ol>
        </nav>
    );
}
