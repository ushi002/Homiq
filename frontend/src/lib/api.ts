export async function authFetch(url: string, options: RequestInit = {}) {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const res = await fetch(url, { ...options, headers });

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
