"use client";
import React, { createContext, useCallback, useMemo, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { setStored, useStored } from '@/lib/stored';

type User = { id: string; role: string; full_name?: string; email?: string };

interface AuthContextType {
    token: string | null;
    user: User | null;
    login: (token: string, user_id: string, role: string, full_name?: string, email?: string) => void;
    logout: (shouldRedirect?: boolean) => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    token: null,
    user: null,
    login: () => { },
    logout: () => { },
    isAuthenticated: false,
    isLoading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    // The session lives in localStorage (lib/api.ts renews the token there); undefined = not read yet
    const storedToken = useStored('token');
    const storedUser = useStored('user');
    const isLoading = storedToken === undefined;
    const user = useMemo<User | null>(() => {
        if (!storedToken || !storedUser) return null;
        try {
            return JSON.parse(storedUser);
        } catch {
            return null;
        }
    }, [storedToken, storedUser]);
    const token = user ? storedToken ?? null : null;
    const router = useRouter();

    // Stable, so pages can call them from effects
    const login = useCallback((newToken: string, user_id: string, role: string, full_name?: string, email?: string) => {
        setStored('user', JSON.stringify({ id: user_id, role, full_name, email }));
        setStored('token', newToken);
        router.push('/');
    }, [router]);

    const logout = useCallback((shouldRedirect: boolean = true) => {
        setStored('token', null);
        setStored('user', null);
        if (shouldRedirect) {
            router.push('/login');
        }
    }, [router]);

    return (
        <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
