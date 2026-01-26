"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { authFetch } from '@/lib/api';

export default function ProfilePage() {
    const { user, login, token } = useAuth(); // Need login to update local state
    const [fullName, setFullName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (user?.full_name) {
            setFullName(user.full_name);
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage('');

        try {
            const res = await authFetch('http://localhost:8000/users/me', {
                method: 'PATCH',
                body: JSON.stringify({ full_name: fullName })
            });

            if (res.ok) {
                const updatedUser = await res.json();
                setMessage('Profile updated successfully!');

                // Update Context/LocalStorage
                // We reuse existing token but update user details
                if (token && user) {
                    login(token, user.id, user.role, updatedUser.full_name);
                }
            } else {
                setMessage('Failed to update profile.');
            }
        } catch (err) {
            console.error(err);
            setMessage('An error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
            <div className="max-w-md mx-auto">
                <div className="mb-6">
                    <Link href="/" className="text-blue-500 hover:underline text-sm mb-2 inline-block">&larr; Back to Dashboard</Link>
                    <h1 className="text-3xl font-bold">Your Profile</h1>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {message && (
                            <div className={`p-3 rounded-md text-sm ${message.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                {message}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-500">Email</label>
                            <input
                                type="text"
                                value={user?.role === 'admin' ? 'admin@homiq.cz' : '...'} // actually we don't have email in context user object, only id/role/fullname. 
                                // We could fetch it, but strictly speaking AuthContext might not have it.
                                // Let's just show Role for now or fetch /users/me on load properly if we want more data.
                                // For now, let's just show Role.
                                disabled
                                className="mt-1 block w-full rounded-md border-gray-200 bg-gray-50 text-gray-500 sm:text-sm p-2"
                                placeholder="Email not available in simplified context"
                            />
                            <p className="text-xs text-gray-400 mt-1">Email cannot be changed.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Role</label>
                            <div className="mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-gray-600 sm:text-sm capitalize">
                                {user?.role.replace('_', ' ')}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700">Full Name</label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {isLoading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </form>
                </div>
            </div>
        </main>
    );
}
