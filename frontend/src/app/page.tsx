"use client";
import { BUTTON, CARD } from '@/lib/ui';
import OwnerSummary from '@/components/OwnerSummary';
import PageSkeleton from '@/components/PageSkeleton';
import { usePageTitle } from '@/lib/pageTitle';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { authFetch } from '@/lib/api';

interface Building {
  id: string;
  name: string;
  address: string;
  units_fetched: boolean;
  description?: string;
  manager_id?: string;
  manager?: { full_name: string; email: string };
}

interface OwnedUnit {
  id: string;
  unit_number: string;
  building_id: string;
}

export default function Dashboard() {
  const { user, token, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [ownedUnits, setOwnedUnits] = useState<OwnedUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { t } = useLanguage();
  usePageTitle(user?.role === 'owner' ? t.dashboard.myUnits : t.dashboard.title);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      router.push('/login');
      return;
    }

    const fetchBuildings = async () => {
      let redirecting = false;
      try {
        // An owner of a single unit goes straight to it, with more units they get a list of them
        if (user?.role === 'owner') {
          const unitsRes = await authFetch('/units/');
          if (unitsRes.ok) {
            const units = await unitsRes.json();
            if (units.length === 1) {
              redirecting = true; // keep the loading state until the unit page opens
              router.replace(`/units/${units[0].id}`);
              return;
            }
            setOwnedUnits(units);
          }
        }

        const res = await authFetch('/buildings/');
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
        if (!redirecting) setLoading(false);
      }
    };

    fetchBuildings();
  }, [token, router, authLoading, user?.role]);

  if (authLoading || !token || loading) return <PageSkeleton variant={user?.role === 'owner' ? 'list' : 'cards'} rows={user?.role === 'owner' ? 2 : 3} />;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;

  if (user?.role === 'owner') {
    // Plain unit list for when the consumption summary cannot be loaded
    const fallbackUnits = ownedUnits
      .map(u => ({ ...u, building_name: buildings.find(b => b.id === u.building_id)?.name ?? '' }))
      .sort((a, c) => a.building_name.localeCompare(c.building_name) || a.unit_number.localeCompare(c.unit_number, undefined, { numeric: true }));

    return (
      <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">{t.dashboard.myUnits}</h1>
          <OwnerSummary fallbackUnits={fallbackUnits} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t.dashboard.title}</h1>

        {user?.role === 'admin' && (
          <div className="mb-8 flex gap-4">
            <Link
              href="/buildings/new"
              className={BUTTON}
            >
              + {t.dashboard.addBuilding}
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {buildings.map(building => (
            <Link
              href={`/buildings/${building.id}`}
              key={building.id}
              className={`${CARD} block hover:shadow-md transition-shadow p-4 sm:p-6`}
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
                    {building.units_fetched ? t.dashboard.unitsSynced : t.dashboard.draft}
                  </span>
                )}
                {building.manager && (
                  <span className="text-xs text-gray-400" title={building.manager.email}>
                    {t.dashboard.managedBy}: {building.manager.full_name || t.users.roleHomeLord}
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
