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

// Numbers of a building card (GET /buildings/stats)
interface BuildingStats {
  building_id: string;
  units: number;
  units_with_owner: number;
  pending_invites: number;
  last_reading: string | null;
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
  const [stats, setStats] = useState<Record<string, BuildingStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { t, language } = useLanguage();
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

    // Numbers on the building cards: loaded separately (InfluxDB), the cards show without them first
    if (user?.role === 'admin' || user?.role === 'home_lord') {
      authFetch('/buildings/stats')
        .then(res => res.ok ? res.json() : [])
        .then((list: BuildingStats[]) => setStats(Object.fromEntries(list.map(s => [s.building_id, s]))))
        .catch(err => console.error(err));
    }
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

  const locale = language === 'cs' ? 'cs-CZ' : 'en-US';
  // Units, owners, pending invites and latest reading of a building
  const renderStats = (s: BuildingStats) => {
    const stale = s.last_reading !== null && Date.now() - Date.parse(s.last_reading) > 7 * 86400000;
    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-4">
        <div>
          <dt className="text-xs text-gray-500">{t.building.units}</dt>
          <dd className="font-medium text-gray-800">{s.units}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">{t.dashboard.withOwner}</dt>
          <dd className="font-medium text-gray-800">
            {s.units_with_owner} / {s.units}
            {s.pending_invites > 0 && <span className="ml-1 text-xs font-normal text-amber-700">({t.dashboard.pendingInvites.replace('{{count}}', String(s.pending_invites))})</span>}
          </dd>
        </div>
        {s.last_reading && (
          <div className="col-span-2">
            <dt className="sr-only">{t.unit.lastReading}</dt>
            <dd className={`text-xs ${stale ? 'text-amber-700 font-medium' : 'text-gray-500'}`} title={stale ? t.unit.lastReadingOld : undefined}>
              {t.unit.lastReading}: {new Date(s.last_reading).toLocaleDateString(locale)}
            </dd>
          </div>
        )}
      </dl>
    );
  };

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
                <p className="text-sm text-gray-500 line-clamp-2 mb-4">
                  {building.description}
                </p>
              )}
              {stats[building.id] && renderStats(stats[building.id])}
              <div className="flex justify-between items-center">
                {user?.role === 'admin' && (
                  <span className={`px-2 py-1 rounded-full text-xs ${building.units_fetched ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {building.units_fetched ? t.dashboard.unitsSynced : t.dashboard.draft}
                  </span>
                )}
                {building.manager && (
                  <span className="text-xs text-gray-500" title={building.manager.email}>
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
