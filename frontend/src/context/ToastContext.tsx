"use client";
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

type Kind = 'success' | 'error';

interface Toast {
    id: number;
    kind: Kind;
    message: string;
}

interface ToastOptions {
    // Show the message after the next page load (for actions followed by a reload or redirect)
    afterReload?: boolean;
}

interface ToastApi {
    success: (message: string, options?: ToastOptions) => void;
    error: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi>({ success: () => { }, error: () => { } });
const PENDING_KEY = 'pendingToast';
// Success disappears on its own, an error stays longer so it can be read
const DURATION: Record<Kind, number> = { success: 4000, error: 10000 };

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const { t } = useLanguage();

    const dismiss = useCallback((id: number) => setToasts(list => list.filter(x => x.id !== id)), []);

    const show = useCallback((kind: Kind, message: string, options?: ToastOptions) => {
        if (options?.afterReload) {
            try {
                sessionStorage.setItem(PENDING_KEY, JSON.stringify({ kind, message }));
                return;
            } catch {
                // storage unavailable: show it right away
            }
        }
        const id = nextId++;
        setToasts(list => [...list, { id, kind, message }]);
        setTimeout(() => dismiss(id), DURATION[kind]);
    }, [dismiss]);

    // A message left by the previous page (see afterReload)
    useEffect(() => {
        try {
            const pending = sessionStorage.getItem(PENDING_KEY);
            if (pending) {
                sessionStorage.removeItem(PENDING_KEY);
                const { kind, message } = JSON.parse(pending);
                show(kind, message);
            }
        } catch {
            // ignore
        }
    }, [show]);

    const api = React.useMemo(() => ({
        success: (m: string, o?: ToastOptions) => show('success', m, o),
        error: (m: string, o?: ToastOptions) => show('error', m, o),
    }), [show]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="fixed z-50 bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 flex flex-col gap-2" aria-live="polite">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        role={toast.kind === 'error' ? 'alert' : 'status'}
                        className={`flex items-start gap-3 rounded-lg border shadow-lg px-4 py-3 text-sm bg-white ${toast.kind === 'error' ? 'border-red-200' : 'border-green-200'}`}
                    >
                        <span aria-hidden="true" className={`mt-0.5 font-bold ${toast.kind === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                            {toast.kind === 'error' ? '!' : '✓'}
                        </span>
                        <p className="flex-1 text-gray-800 whitespace-pre-line break-words">{toast.message}</p>
                        <button onClick={() => dismiss(toast.id)} aria-label={t.common.close} className="text-gray-400 hover:text-gray-700 leading-none text-lg">×</button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);
