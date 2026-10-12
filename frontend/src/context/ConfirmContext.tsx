"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';

interface ConfirmOptions {
    danger?: boolean; // destructive action: red confirm button
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

// In-app replacement of window.confirm(): `if (!(await confirm(text))) return;`
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const { t } = useLanguage();
    const [state, setState] = useState<{ message: string; danger: boolean } | null>(null);
    const resolver = useRef<((value: boolean) => void) | null>(null);
    const confirmButton = useRef<HTMLButtonElement>(null);
    const cancelButton = useRef<HTMLButtonElement>(null);

    const confirm = useCallback<ConfirmFn>((message, options) => {
        setState({ message, danger: !!options?.danger });
        return new Promise<boolean>(resolve => { resolver.current = resolve; });
    }, []);

    const close = (result: boolean) => {
        resolver.current?.(result);
        resolver.current = null;
        setState(null);
    };

    useEffect(() => {
        if (!state) return;
        // Enter must not confirm a destructive action by accident
        (state.danger ? cancelButton : confirmButton).current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [state]);

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            {state && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => close(false)}>
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <p className="text-gray-800 whitespace-pre-line">{state.message}</p>
                        <div className="mt-6 flex justify-end gap-3">
                            <button ref={cancelButton} onClick={() => close(false)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-medium">
                                {t.common.cancel}
                            </button>
                            <button
                                ref={confirmButton}
                                onClick={() => close(true)}
                                className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${state.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {t.common.yes}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
}

export const useConfirm = () => useContext(ConfirmContext);
