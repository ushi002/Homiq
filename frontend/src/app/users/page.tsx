"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface User {
    id: string;
    email: string;
    full_name: string;
    role: string;
    last_login_at?: string;
    invite_token?: string;
    invite_expires_at?: string;
    created_at?: string;
    status?: string;
    assignments?: Assignment[];
}

interface Assignment {
    type: 'building' | 'unit';
    id: string;
    name: string;
    detail?: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [newUser, setNewUser] = useState({ email: '', full_name: '', role: '' });
    const { user: currentUser, token, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const [origin, setOrigin] = useState('');
    const { t } = useLanguage();

    // Determine allowed role to create based on current user
    const allowedRole = currentUser?.role === 'admin' ? 'home_lord' : 'owner';

    useEffect(() => {
        if (authLoading) return;
        if (!token) {
            router.push('/login');
            return;
        }

        // Restrict access to Admins only
        if (currentUser?.role !== 'admin') {
            router.push('/');
            return;
        }

        setOrigin(window.location.origin);
        fetchUsers();
        // Set default role
        setNewUser(prev => ({ ...prev, role: currentUser?.role === 'admin' ? 'home_lord' : 'owner' }));
    }, [currentUser, token, authLoading, router]);

    const fetchUsers = () => {
        authFetch('/users/')
            .then(res => res.json())
            .then(data => setUsers(data))
            .catch(err => console.error(err));
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await authFetch('/users/', {
                method: 'POST',
                body: JSON.stringify(newUser)
            });
            if (res.ok) {
                setNewUser({ email: '', full_name: '', role: allowedRole });
                fetchUsers();
            } else {
                const err = await res.json();
                alert(`${t.messages.errorCreateUser}: ${err.detail}`);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm(t.messages.confirmDeleteUser)) return;

        try {
            const res = await authFetch(`/users/${userId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                fetchUsers(); // Refresh list
            } else {
                const err = await res.json();
                alert(`${t.messages.errorDeleteUser}: ${err.detail}`);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const copyInviteLink = (token: string) => {
        const link = `${origin}/invite/${token}`;

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(link)
                .then(() => alert(`${t.messages.inviteCopied}: ${link}`))
                .catch(err => {
                    console.error('Async: Could not copy text: ', err);
                    fallbackCopyTextToClipboard(link);
                });
        } else {
            fallbackCopyTextToClipboard(link);
        }
    };

    const fallbackCopyTextToClipboard = (text: string) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Ensure it's not visible but part of DOM
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                alert(`${t.messages.inviteCopied}: ${text}`);
            } else {
                console.error('Fallback: unable to copy');
                prompt("Copy this link manually:", text);
            }
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
            prompt("Copy this link manually:", text);
        }

        document.body.removeChild(textArea);
    };

    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const startEdit = (user: User) => {
        setEditingUser(user.id);
        setEditName(user.full_name || '');
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setEditName('');
    };

    const saveEdit = async (userId: string) => {
        try {
            const res = await authFetch(`/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_name: editName })
            });
            if (res.ok) {
                fetchUsers();
                setEditingUser(null);
            } else {
                const err = await res.json();
                alert(`${t.messages.errorUpdateUser}: ${err.detail}`);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleUnassign = async (assignment: Assignment) => {
        if (!confirm(t.messages.confirmUnassign.replace('{{name}}', assignment.name))) return;

        try {
            let url = '';
            if (assignment.type === 'building') {
                url = `/buildings/${assignment.id}/assign_manager`; // No manager_id param = unassign
            } else {
                url = `/units/${assignment.id}/assign`; // No owner_id param = unassign
            }

            const res = await authFetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                fetchUsers();
            } else {
                const err = await res.json();
                alert(`${t.messages.errorUnassign}: ${err.detail}`);
            }
        } catch (err) {
            console.error(err);
            alert(t.messages.errorGeneric);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        // Treat naive date strings as UTC
        const date = !dateStr.endsWith('Z') && !dateStr.includes('+') ? new Date(dateStr + 'Z') : new Date(dateStr);
        return date.toLocaleString();
    };

    const isExpired = (dateStr?: string) => {
        if (!dateStr) return false;
        // Treat naive date strings as UTC
        const date = !dateStr.endsWith('Z') && !dateStr.includes('+') ? new Date(dateStr + 'Z') : new Date(dateStr);
        return date < new Date();
    };

    if (authLoading || !token || currentUser?.role !== 'admin') {
        return <div className="p-8 text-center">{t.common.loading}</div>;
    }

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6">
                <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">{t.users.backToDashboard}</Link>
                <h1 className="text-3xl font-bold">{t.users.title}</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Create User Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-semibold mb-4">{t.users.inviteNew}</h2>
                    <form onSubmit={handleCreateUser} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">{t.common.email}</label>
                            <input
                                type="email"
                                required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                value={newUser.email}
                                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">{t.users.fullName}</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                value={newUser.full_name}
                                onChange={e => setNewUser({ ...newUser, full_name: e.target.value })}
                            />
                        </div>
                        {/* Password field removed for invite flow */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700">{t.users.role}</label>
                            <select
                                className={`mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white`}
                                value={newUser.role}
                                onChange={e => setNewUser({ ...newUser, role: e.target.value })}
                                disabled={currentUser?.role !== 'admin'}
                            >
                                <option value="home_lord">{t.users.roleHomeLord}</option>
                                <option value="owner">{t.users.roleOwner}</option>
                                <option value="admin">{t.users.roleAdmin}</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {currentUser?.role === 'admin'
                                    ? t.users.adminInfo
                                    : t.users.homeLordInfo}
                            </p>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors">
                            {t.users.sendInvite}
                        </button>
                    </form>
                </div>

                {/* User List */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="font-semibold text-gray-700">{t.users.allUsers}</h2>
                    </div>
                    <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                        {users.map(user => (
                            <li key={user.id} className="px-6 py-4 flex flex-col hover:bg-gray-50">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        {editingUser === user.id ? (
                                            <div className="flex items-center space-x-2 mb-1">
                                                <input
                                                    type="text"
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    className="border rounded px-2 py-1 text-sm w-full max-w-xs"
                                                />
                                                <button onClick={() => saveEdit(user.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">{t.common.save}</button>
                                                <button onClick={cancelEdit} className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">{t.common.cancel}</button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center space-x-2 mb-1">
                                                <p className="font-medium text-gray-900">{user.full_name}</p>
                                                <button onClick={() => startEdit(user)} className="text-xs text-blue-400 hover:text-blue-600">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-sm text-gray-500">{user.email}</p>
                                        <p className="text-xs text-gray-400 mt-0.5" title="User created at">
                                            🕒 {formatDate(user.created_at)}
                                        </p>
                                        {user.last_login_at && (
                                            <p className="text-xs text-gray-400 mt-0.5" title="Last login">
                                                🔑 {formatDate(user.last_login_at)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center space-x-3 ml-4">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                            user.role === 'home_lord' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                            {user.role === 'home_lord' ? t.users.roleHomeLord :
                                                user.role === 'admin' ? t.users.roleAdmin :
                                                    t.users.roleOwner}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="text-red-500 hover:text-red-700 text-sm font-medium"
                                            title="Delete User"
                                        >
                                            {t.common.delete}
                                        </button>
                                    </div>
                                </div>

                                {/* Assignments */}
                                {user.assignments && user.assignments.length > 0 && (
                                    <div className="mt-2 pl-2 border-l-2 border-gray-100">
                                        <p className="text-xs text-gray-400 mb-1 font-semibold uppercase">{t.users.assignedTo}:</p>
                                        <div className="flex flex-wrap gap-2">
                                            {user.assignments.map((assignment, idx) => (
                                                <div key={idx} className="flex items-center bg-gray-100 rounded-md px-2 py-1 text-xs text-gray-700 border border-gray-200">
                                                    <span className="mr-2">
                                                        {assignment.type === 'building' ? '🏢' : '🏠'}
                                                        <span className="font-semibold ml-1">{assignment.name}</span>
                                                        {assignment.detail && <span className="text-gray-500 ml-1">({assignment.detail})</span>}
                                                    </span>
                                                    <button
                                                        onClick={() => handleUnassign(assignment)}
                                                        className="text-gray-400 hover:text-red-600 ml-1 p-0.5 rounded-full hover:bg-gray-200 transition-colors"
                                                        title={t.common.unassign}
                                                    >
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Invitation Info */}
                                {user.invite_token && user.status === 'pending' && (
                                    <div className="mt-3 bg-white p-3 rounded-md border border-amber-200 shadow-sm">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-semibold text-amber-900 border-b border-amber-100 pb-1">{t.users.pendingInvite}</span>
                                            {isExpired(user.invite_expires_at) ? (
                                                <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs font-bold rounded-full border border-red-200">
                                                    EXPIRED
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-bold rounded-full border border-green-200">
                                                    VALID
                                                </span>
                                            )}
                                        </div>

                                        <div className="text-xs space-y-1 text-gray-600 mb-2">
                                            <div className="flex justify-between">
                                                <span>Created:</span>
                                                <span className="font-mono">{formatDate(user.created_at)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Expires:</span>
                                                <span className="font-mono">{formatDate(user.invite_expires_at)}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center space-x-2 bg-gray-50 p-1.5 rounded border border-gray-200">
                                            <code className="text-xs text-gray-600 break-all flex-1">{`${origin}/invite/${user.invite_token}`}</code>
                                            <button
                                                onClick={() => copyInviteLink(user.invite_token!)}
                                                className="text-blue-600 hover:text-blue-800 p-1 hover:bg-blue-50 rounded"
                                                title={t.users.copyLink}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                        {users.length === 0 && (
                            <li className="px-6 py-8 text-center text-gray-400">{t.unit.noData}</li>
                        )}
                    </ul>
                </div>
            </div>
        </main>
    );
}
