"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = React.use(params);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const { login, logout } = useAuth();
    const { t } = useLanguage();

    // Clear any existing session when landing on invite page
    React.useEffect(() => {
        logout(false);
    }, []);

    const handleAcceptInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError(t.invite.passwordMatchError);
            return;
        }

        if (password.length < 8) {
            setError(t.invite.passwordLengthError);
            return;
        }

        setIsLoading(true);

        try {
            const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${API_URL}/accept-invite`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, password }),
            });

            if (res.ok) {
                const data = await res.json();
                // Use context login to ensure state and localStorage are consistent
                login(data.access_token, data.user_id, data.role, data.full_name);
            } else {
                const err = await res.json();
                setError(err.detail || t.invite.failedToAccept);
            }
        } catch (err) {
            console.error(err);
            setError(t.invite.genericError);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-gray-50 font-sans p-4">
            <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full border border-gray-100">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">{t.invite.welcome}</h1>
                    <p className="text-gray-500 mt-2">{t.invite.setPasswordMessage}</p>
                </div>

                {error && (
                    <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleAcceptInvite} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t.invite.newPassword}</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{t.invite.confirmPassword}</label>
                        <input
                            type="password"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-3 border"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-70"
                    >
                        {isLoading ? t.invite.activating : t.invite.activateAccount}
                    </button>
                </form>
            </div>
        </main>
    );
}
