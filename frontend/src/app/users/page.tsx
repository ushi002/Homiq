"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { authFetch } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

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

    // Determine allowed role to create based on current user
    const allowedRole = currentUser?.role === 'admin' ? 'home_lord' : 'owner';

    useEffect(() => {
        setOrigin(window.location.origin);
        fetchUsers();
        // Set default role
        setNewUser(prev => ({ ...prev, role: currentUser?.role === 'admin' ? 'home_lord' : 'owner' }));
    }, [currentUser]);

    const fetchUsers = () => {
        authFetch('http://localhost:8000/users/')
            .then(res => res.json())
            .then(data => setUsers(data))
            .catch(err => console.error(err));
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await authFetch('http://localhost:8000/users/', {
                method: 'POST',
                body: JSON.stringify(newUser)
            });
            if (res.ok) {
                setNewUser({ email: '', full_name: '', role: allowedRole });
                fetchUsers();
            } else {
                const err = await res.json();
                alert(`Failed to create user: ${err.detail}`);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm("Are you sure you want to delete this user?")) return;

        try {
            const res = await authFetch(`http://localhost:8000/users/${userId}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                fetchUsers(); // Refresh list
            } else {
                const err = await res.json();
                alert(`Failed to delete user: ${err.detail}`);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const copyInviteLink = (token: string) => {
        const link = `${origin}/invite/${token}`;
        navigator.clipboard.writeText(link);
        alert("Invite link copied to clipboard: " + link);
    }

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="mb-6">
                <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
                <h1 className="text-3xl font-bold">User Management</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Create User Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h2 className="text-lg font-semibold mb-4">Invite New {currentUser?.role === 'admin' ? 'Home Lord' : 'Owner'}</h2>
                    <form onSubmit={handleCreateUser} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input
                                type="email"
                                required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                                value={newUser.email}
                                onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Full Name</label>
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
                            <label className="block text-sm font-medium text-gray-700">Role</label>
                            <select
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-gray-100 cursor-not-allowed"
                                value={newUser.role}
                                disabled
                            >
                                <option value="home_lord">Home Lord</option>
                                <option value="owner">Owner</option>
                            </select>
                            <p className="text-xs text-gray-500 mt-1">
                                {currentUser?.role === 'admin'
                                    ? "Admins can only create Home Lords."
                                    : "Home Lords can only create Owners."}
                            </p>
                        </div>
                        <button type="submit" className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors">
                            Send Invite
                        </button>
                    </form>
                </div>

                {/* User List */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="font-semibold text-gray-700">All Users</h2>
                    </div>
                    <ul className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
                        {users.map(user => (
                            <li key={user.id} className="px-6 py-4 flex flex-col hover:bg-gray-50">
                                <div className="flex justify-between items-center">
                                    <div className="flex-1">
                                        <p className="font-medium text-gray-900">{user.full_name}</p>
                                        <p className="text-sm text-gray-500">{user.email}</p>
                                    </div>
                                    <div className="flex items-center space-x-4">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                            user.role === 'home_lord' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                            {user.role === 'home_lord' ? 'Home Lord' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                                        </span>
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="text-red-500 hover:text-red-700 text-sm font-medium"
                                            title="Delete User"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                                {user.invite_token && user.status === 'pending' && (
                                    <div className="mt-2 bg-amber-50 p-2 rounded border border-amber-100 flex justify-between items-center">
                                        <span className="text-sm text-amber-800">
                                            Pending Invite: <code className="bg-white px-1 py-0.5 rounded border border-amber-200 text-xs">{`${origin}/invite/${user.invite_token}`}</code>
                                        </span>
                                        <button onClick={() => copyInviteLink(user.invite_token!)} className="text-xs text-blue-600 hover:underline">
                                            Copy Link
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                        {users.length === 0 && (
                            <li className="px-6 py-8 text-center text-gray-400">No users found.</li>
                        )}
                    </ul>
                </div>
            </div>
        </main>
    );
}
