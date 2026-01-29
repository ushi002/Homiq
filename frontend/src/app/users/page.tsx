"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

interface User {
    id: string;
    email: string;
    full_name: string;
    role: string;
    invite_token?: string;
    status?: string;
}

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [newUser, setNewUser] = useState({ email: '', full_name: '', role: '' });
    const { user: currentUser } = useAuth();
    const [origin, setOrigin] = useState('');
    const { t } = useLanguage();

    // Determine allowed role to create based on current user
    const allowedRole = currentUser?.role === 'admin' ? 'home_lord' : 'owner';

    useEffect(() => {
        setOrigin(window.location.origin);
        fetchUsers();
        // Set default role
        setNewUser(prev => ({ ...prev, role: currentUser?.role === 'admin' ? 'home_lord' : 'owner' }));
    }, [currentUser]);

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
        navigator.clipboard.writeText(link);
        alert(`${t.messages.inviteCopied}: ${link}`);
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
                                <div className="flex justify-between items-center">
                                    <div className="flex-1">
                                        {editingUser === user.id ? (
                                            <div className="flex items-center space-x-2">
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
                                            <div className="flex items-center space-x-2">
                                                <p className="font-medium text-gray-900">{user.full_name}</p>
                                                <button onClick={() => startEdit(user)} className="text-xs text-blue-400 hover:text-blue-600">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-sm text-gray-500">{user.email}</p>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
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
                                {user.invite_token && user.status === 'pending' && (
                                    <div className="mt-2 bg-amber-50 p-2 rounded border border-amber-100 flex justify-between items-center">
                                        <span className="text-sm text-amber-800">
                                            {t.users.pendingInvite}: <code className="bg-white px-1 py-0.5 rounded border border-amber-200 text-xs">{`${origin}/invite/${user.invite_token}`}</code>
                                        </span>
                                        <button onClick={() => copyInviteLink(user.invite_token!)} className="text-xs text-blue-600 hover:underline">
                                            {t.users.copyLink}
                                        </button>
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
