import { useEffect } from 'react';

// Browser tab title of a page: "<title> – Homiq", just "Homiq" until the title is known
export const usePageTitle = (title?: string | null) => {
    useEffect(() => {
        document.title = title ? `${title} – Homiq` : 'Homiq';
    }, [title]);
};
