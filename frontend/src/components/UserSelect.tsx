"use client";
import React, { useEffect, useState } from 'react';

interface User {
    id: string;
    full_name: string;
    email: string;
}

interface UserSelectProps {
    value: string; // The selected user ID
    onChange: (userId: string) => void;
}

export default function UserSelect({ value, onChange }: UserSelectProps) {
    const [users, setUsers] = useState<User[]>([]);

    useEffect(() => {
        fetch('http://localhost:8000/users/')
            .then(res => res.json())
            .then(data => setUsers(data))
            .catch(err => console.error(err));
    }, []);

    return (
        <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
        >
            <option value="">-- Select Owner --</option>
            {users.map(user => (
                <option key={user.id} value={user.id}>
                    {user.full_name} ({user.email})
                </option>
            ))}
        </select>
    );
}
