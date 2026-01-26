const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function authFetch(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
    const res = await fetch(fullUrl, { ...options, headers });

    if (res.status === 401) {
        // Redirect to login if unauthorized and clear token
        localStorage.removeItem('token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('role');
        window.location.href = '/login';
        throw new Error("Unauthorized");
    }

    return res;
}
