"use client";
import React, { createContext, useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';

interface AuthContextType {
    token: string | null;
    user: { id: string; role: string } | null;
    login: (token: string, user_id: string, role: string) => void;
    logout: () => void;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
    token: null,
    user: null,
    login: () => { },
    logout: () => { },
    isAuthenticated: false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [token, setToken] = useState<string | null>(null);
    const [user, setUser] = useState<{ id: string; role: string } | null>(null);
    const router = useRouter();

    useEffect(() => {
        // Load from localStorage
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const login = (newToken: string, user_id: string, role: string) => {
        const userData = { id: user_id, role };
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(userData));
        router.push('/');
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
    };

    return (
        <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
