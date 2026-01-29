"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';

interface Building {
  id: string;
  name: string;
  address: string;
  units_fetched: boolean;
  description?: string;
  manager_id?: string;
  manager?: { full_name: string; email: string };
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchBuildings = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/buildings/`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setBuildings(data);
        } else {
          setError(t.login.error); // fallback generic error, or we could add specific one
          if (res.status === 401) logout();
        }
      } catch (error) {
        console.error("Failed to fetch buildings", error);
        setError(t.login.error);
      } finally {
        setLoading(false);
      }
    };

    fetchBuildings();
  }, [token, router]);

  if (loading) return <div className="p-8 text-center">{t.common.loading}</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t.dashboard.title}</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/profile"
              className="text-gray-700 font-medium hover:text-gray-900 hover:underline transition-all"
            >
              {user?.full_name || user?.role}
            </Link>
            <button
              onClick={() => logout()}
              className="bg-red-50 text-red-600 px-4 py-2 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
            >
              {t.common.logout}
            </button>
          </div>
        </div>

        {user?.role === 'admin' && (
          <div className="mb-8 flex gap-4">
            <Link
              href="/buildings/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              + {t.dashboard.addBuilding}
            </Link>
            <Link
              href="/users"
              className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t.dashboard.manageUsers}
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {buildings.map(building => (
            <Link
              href={`/buildings/${building.id}`}
              key={building.id}
              className="block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-6 border border-gray-100"
            >
              <h2 className="text-xl font-semibold text-gray-800 mb-2">{building.name}</h2>
              <p className="text-gray-500 mb-4">{building.address}</p>
              {building.description && (
                <p className="text-sm text-gray-400 line-clamp-2 mb-4">
                  {building.description}
                </p>
              )}
              <div className="flex justify-between items-center">
                {user?.role === 'admin' && (
                  <span className={`px-2 py-1 rounded-full text-xs ${building.units_fetched ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {building.units_fetched ? 'Units Synced' : 'Draft'}
                  </span>
                )}
                {building.manager && (
                  <span className="text-xs text-gray-400" title={building.manager.email}>
                    {t.dashboard.managedBy}: {building.manager.full_name || 'Home Lord'}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>

        {buildings.length === 0 && (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
            {t.dashboard.noBuildings}
          </div>
        )}
      </div>
    </main>
  );
}
