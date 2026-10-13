// Values kept in localStorage, read through useSyncExternalStore: the server render and hydration see
// undefined ("not known yet"), the browser then the stored value. Every write through setStored, and
// a change made in another tab, re-renders the components that read the key.
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
// Fallback when storage is unavailable (private mode, blocked): the value lasts until reload
const memory = new Map<string, string | null>();

export const getStored = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return memory.get(key) ?? null;
    }
};

export function setStored(key: string, value: string | null) {
    try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    } catch {
        memory.set(key, value);
    }
    listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    window.addEventListener('storage', listener);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('storage', listener);
    };
}

export function useStored(key: string): string | null | undefined {
    return useSyncExternalStore(subscribe, () => getStored(key), () => undefined);
}
