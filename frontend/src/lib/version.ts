// Version of the running web (baked in at build: version-env.sh -> docker compose build args) and of
// the server (GET /health, public). Format: "2026.10.13 · a876087" (commit date · short hash).
import { useEffect, useState } from 'react';
import { API_URL } from './api';

export interface VersionInfo {
    date: string | null;
    commit: string | null;
    built: string | null; // ISO time of the build
    env?: string | null;  // server only: "dev" on a development instance
}

export const WEB_VERSION: VersionInfo = {
    date: process.env.NEXT_PUBLIC_APP_DATE || null,
    commit: process.env.NEXT_PUBLIC_APP_COMMIT || null,
    built: process.env.NEXT_PUBLIC_BUILD_TIME || null,
};

// null when the build did not get the version from git
export const formatVersion = (v: VersionInfo | null): string | null =>
    v?.date && v.commit ? `${v.date} · ${v.commit}` : null;

// One request per page load, shared by every component showing the version
let serverVersion: Promise<VersionInfo | null> | null = null;

export function useServerVersion(): VersionInfo | null {
    const [version, setVersion] = useState<VersionInfo | null>(null);
    useEffect(() => {
        serverVersion ??= fetch(`${API_URL}/health`)
            .then(res => res.ok ? res.json() : null)
            .then(json => json?.version ?? null)
            .catch(() => null);
        let active = true;
        serverVersion.then(v => { if (active) setVersion(v); });
        return () => { active = false; };
    }, []);
    return version;
}
