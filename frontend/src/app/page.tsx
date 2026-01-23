"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api';

interface Building {
  id: string;
  name: string;
  address: string;
  description: string;
}

export default function Home() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) return;

    authFetch('http://localhost:8000/buildings/')
      .then(res => res.json())
      .then(data => setBuildings(data))
      .catch(err => console.error(err));
  }, [isAuthenticated]);

  // Protected Route Check (CLIENT SIDE)
  // Ideally middleware does this, but this is fine for now
  useEffect(() => {
    if (!localStorage.getItem('token')) {
      router.push('/login');
    }
  }, [router]);

  if (!isAuthenticated) return null;

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            Homiq Dashboard
          </h1>
          <p className="text-gray-500 mt-2">
            Welcome, <span className="font-semibold text-gray-800">{user?.role}</span>
          </p>
        </div>
        <div className="space-x-4">
          {(user?.role === 'home_lord' || user?.role === 'admin') && (
            <Link href="/users" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
              Manage Users
            </Link>
          )}
          <button
            onClick={logout}
            className="bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors shadow-sm"
          >
            Logout
          </button>
        </div>
      </header>

      {buildings.length === 0 ? (
        <div className="text-center py-20">
          <h2 className="text-xl text-gray-400">No buildings found.</h2>
          <p className="text-gray-400 text-sm mt-2">Check if the backend is running or ask Admin to assign you a building.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {buildings.map((building) => (
            <Link key={building.id} href={`/buildings/${building.id}`} className="group">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all h-full flex flex-col">
                <div className="mb-4">
                  <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 mb-1 group-hover:text-blue-600 transition-colors">{building.name}</h2>
                  <p className="text-sm text-gray-500 line-clamp-2">{building.address}</p>
                </div>
                {building.description && (
                  <p className="text-sm text-gray-400 mt-auto pt-4 border-t border-gray-50">{building.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
