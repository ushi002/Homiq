"use client";
import { BUTTON, CARD, INPUT, LABEL, PAGE } from '@/lib/ui';
import PageSkeleton from '@/components/PageSkeleton';
import { usePageTitle } from '@/lib/pageTitle';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useApiErrorReason } from '@/lib/apiError';
import { authFetch } from '@/lib/api';
import { WEB_VERSION, VersionInfo, formatVersion, useServerVersion } from '@/lib/version';

export default function ProfilePage() {
    const { user, login, token, isLoading: authLoading } = useAuth(); // Need login to update local state
    const { t } = useLanguage();
    usePageTitle(t.profile.title);
    const router = useRouter();
    const [fullName, setFullName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (authLoading) return;
        if (!token) {
            router.push('/login');
            return;
        }
        if (user?.full_name) {
            setFullName(user.full_name);
        }
    }, [user, token, router, authLoading]);

    if (authLoading || !token) return <PageSkeleton variant="form" rows={3} />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');

        try {
            const res = await authFetch('/users/me', {
                method: 'PATCH',
                body: JSON.stringify({ full_name: fullName })
            });

            if (res.ok) {
                const updatedUser = await res.json();
                setMessage(t.profile.successUpdate);

                // Update Context/LocalStorage
                // We reuse existing token but update user details
                if (token && user) {
                    login(token, user.id, user.role, updatedUser.full_name, user.email);
                }
            } else {
                setMessage(t.profile.errorUpdate);
            }
        } catch (err) {
            console.error(err);
            setMessage(t.login.error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className={PAGE}>
            <div className="max-w-md mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl font-bold">{t.profile.title}</h1>
                </div>

                <div className={`${CARD} p-4 sm:p-6`}>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {message && (
                            <div className={`p-3 rounded-md text-sm ${message.includes(t.profile.successUpdate) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {message}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-500">{t.profile.email}</label>
                            <input
                                type="text"
                                value={user?.email || ''}
                                disabled
                                className="mt-1 block w-full rounded-md border-gray-200 bg-gray-50 text-gray-500 sm:text-sm p-2"
                            />
                            <p className="text-xs text-gray-500 mt-1">{t.profile.emailReadOnly}</p>
                        </div>

                        <div>
                            <label className={LABEL}>{t.profile.role}</label>
                            <div className="mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-600 sm:text-sm capitalize">
                                {(() => {
                                    switch (user?.role) {
                                        case 'admin': return t.users.roleAdmin;
                                        case 'home_lord': return t.users.roleHomeLord;
                                        case 'owner': return t.users.roleOwner;
                                        default: return user?.role || '';
                                    }
                                })()}
                            </div>
                        </div>

                        <div>
                            <label className={LABEL}>{t.profile.fullName}</label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className={INPUT}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {isLoading ? t.common.loading : t.profile.saveChanges}
                        </button>
                    </form>
                </div>

                {/* Change Password Section */}
                <div className={`${CARD} p-4 sm:p-6 mt-6`}>
                    <h2 className="text-lg font-semibold mb-4 text-gray-800">{t.profile.changePassword}</h2>
                    <ChangePasswordForm />
                </div>

                <AboutSection />
            </div>
        </main>
    );
}

const ChangePasswordForm = () => {
    const [passwords, setPasswords] = useState({ old_password: '', new_password: '', confirm_password: '' });
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { t } = useLanguage();
    const apiErrorReason = useApiErrorReason();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');

        if (passwords.new_password !== passwords.confirm_password) {
            setMessage(t.profile.errorMismatch);
            return;
        }

        setIsLoading(true);
        try {
            const res = await authFetch('/users/me/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ old_password: passwords.old_password, new_password: passwords.new_password })
            });

            if (res.ok) {
                setMessage(t.profile.successPassword);
                setPasswords({ old_password: '', new_password: '', confirm_password: '' });
            } else {
                const err = await res.json();
                setMessage(`${t.profile.errorPassword}${apiErrorReason(err.detail) ?? t.messages.errorGeneric}`);
            }
        } catch (err) {
            console.error(err);
            setMessage(t.login.error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
                <div className={`p-3 rounded-md text-sm ${message.includes(t.profile.successPassword) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message}
                </div>
            )}
            <div>
                <label className={LABEL}>{t.profile.oldPassword}</label>
                <input
                    type="password"
                    required
                    className={INPUT}
                    value={passwords.old_password}
                    onChange={e => setPasswords({ ...passwords, old_password: e.target.value })}
                />
            </div>
            <div>
                <label className={LABEL}>{t.profile.newPassword}</label>
                <input
                    type="password"
                    required
                    className={INPUT}
                    value={passwords.new_password}
                    onChange={e => setPasswords({ ...passwords, new_password: e.target.value })}
                />
            </div>
            <div>
                <label className={LABEL}>{t.profile.confirmPassword}</label>
                <input
                    type="password"
                    required
                    className={INPUT}
                    value={passwords.confirm_password}
                    onChange={e => setPasswords({ ...passwords, confirm_password: e.target.value })}
                />
            </div>
            <button
                type="submit"
                disabled={isLoading}
                className={`${BUTTON} w-full`}
            >
                {isLoading ? t.common.loading : t.profile.updatePassword}
            </button>
        </form>
    );
}

// Versions of the web and the server; they differ when the browser runs an older web (reload) or
// the update did not rebuild both parts
function AboutSection() {
    const { t, language } = useLanguage();
    const server = useServerVersion();
    const locale = language === 'cs' ? 'cs-CZ' : 'en-US';
    const built = (v: VersionInfo | null) =>
        v?.built ? `${t.version.built} ${new Date(v.built).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}` : '';
    const row = (label: string, v: VersionInfo | null) => (
        <div className="flex flex-wrap justify-between gap-x-4 py-2">
            <dt className="text-gray-500">{label}</dt>
            <dd className="text-right tabular-nums">
                {formatVersion(v) ?? t.version.unknown}
                {built(v) && <span className="block text-xs text-gray-500">{built(v)}</span>}
            </dd>
        </div>
    );
    const mismatch = server && formatVersion(server) && formatVersion(WEB_VERSION) && server.commit !== WEB_VERSION.commit;
    return (
        <div className={`${CARD} p-4 sm:p-6 mt-6`}>
            <h2 className="text-lg font-semibold mb-2 text-gray-800">
                {t.version.about}
                {server?.env === 'dev' && (
                    <span className="ml-2 align-middle px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-xs font-medium">{t.version.dev}</span>
                )}
            </h2>
            <dl className="text-sm divide-y divide-gray-100">
                {row(t.version.web, WEB_VERSION)}
                {row(t.version.server, server)}
            </dl>
            {mismatch && <p className="mt-3 text-sm text-amber-700">{t.version.mismatch}</p>}
        </div>
    );
}
