"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Building {
  id: string;
  name: string;
  address: string;
  description?: string;
}

export default function Home() {
  const [buildings, setBuildings] = useState<Building[]>([]);

  useEffect(() => {
    fetch('http://localhost:8000/buildings/')
      .then(res => res.json())
      .then(data => setBuildings(data))
      .catch(err => console.error("Failed to fetch buildings", err));
  }, []);

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900 font-sans">
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            Homiq Dashboard
          </h1>
          <p className="text-gray-500 mt-2">Manage your properties and readings</p>
        </div>
        <Link href="/users" className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
          Manage Users
        </Link>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {buildings.map((building) => (
          <Link href={`/buildings/${building.id}`} key={building.id} className="block group">
            <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100 h-full">
              <h2 className="text-xl font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                {building.name}
              </h2>
              <p className="text-gray-500 mt-1 text-sm">{building.address}</p>
              {building.description && (
                <p className="text-gray-400 mt-4 text-sm line-clamp-2">{building.description}</p>
              )}
            </div>
          </Link>
        ))}
        {buildings.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            No buildings found. Check if the backend is running or create one via API.
          </div>
        )}
      </div>
    </main>
  );
}
