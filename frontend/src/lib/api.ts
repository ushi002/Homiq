import { setStored } from './stored';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// A session lasts 8 hours (backend). While the user is active the token is renewed once less than
// half of it is left, so only someone idle for 8 hours has to log in again.
const RENEW_WHEN_LEFT_MS = 4 * 60 * 60 * 1000;
let renewing: Promise<void> | null = null;

const expiresAt = (token: string): number | null => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
};

async function renewIfNeeded(token: string) {
    const exp = expiresAt(token);
    if (exp === null || exp - Date.now() > RENEW_WHEN_LEFT_MS) return;
    // Several requests at once share one renewal
    renewing ??= fetch(`${API_URL}/token/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
        .then(async res => {
            if (res.ok) setStored('token', (await res.json()).access_token);
        })
        .catch(() => { /* keep the current token, it is still valid */ })
        .finally(() => { renewing = null; });
    await renewing;
}

export async function authFetch(url: string, options: RequestInit = {}) {
    const current = localStorage.getItem('token');
    if (current) await renewIfNeeded(current);
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
    const res = await fetch(fullUrl, { ...options, headers });

    if (res.status === 401) {
        // Session expired: clear it (same keys as AuthContext) and go to login
        setStored('token', null);
        setStored('user', null);
        window.location.href = '/login';
        throw new Error("Unauthorized");
    }

    return res;
}
