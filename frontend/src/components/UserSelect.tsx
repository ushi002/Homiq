"use client";
import React, { useEffect, useState } from 'react';
import { authFetch } from '@/lib/api';

interface User {
    id: string;
    full_name: string;
    email: string;
    role: string;
}

interface UserSelectProps {
    value: string; // The selected user ID
    onChange: (userId: string) => void;
    roleFilter?: string;
}

export default function UserSelect({ value, onChange, roleFilter }: UserSelectProps) {
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        authFetch('/users/')
            .then(res => res.json())
            .then((data: User[]) => {
                if (roleFilter) {
                    setUsers(data.filter(u => u.role === roleFilter));
                } else {
                    // Default behaviour: maybe show owners only? or everyone?
                    // Previous implementation showed everyone but label said "Select Owner"
                    // Let's filter for 'owner' by default if no filter provided, to be safe?
                    // Or just show everyone. Let's keep existing behavior (everyone) but filter if prop exists.
                    setUsers(data);
                }
            })
            .catch(err => console.error(err));
    }, [roleFilter]);

    return (
        <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
        >
            <option value="">-- Select {roleFilter === 'home_lord' ? 'Home Lord' : 'User'} --</option>
            {users.map(user => (
                <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                </option>
            ))}
        </select>
    );
}
