// Local development uses Vite's /api proxy. Production supplies the backend origin.
const configuredApiOrigin = import.meta.env.VITE_API_URL?.replace(/\/$/, '');
const API_BASE = configuredApiOrigin ? `${configuredApiOrigin}/api` : '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API_BASE}${path}`, opts);
  const responseText = await res.text();
  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = { message: responseText || `Request failed (${res.status})` };
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ledger:auth-expired'));
    }
    throw new Error(data.message || 'Request failed');
  }

  return data;
}

export const auth = {
  register: (name, email, password) =>
    request('POST', '/auth/register', { name, email, password }),
  login: (email, password) =>
    request('POST', '/auth/login', { email, password }),
  logout: () => request('POST', '/auth/logout'),
};

export const accounts = {
  create: () => request('POST', '/accounts/'),
  list: () => request('GET', '/accounts/'),
  getBalance: (accountId) => request('GET', `/accounts/balance/${accountId}`),
};

export const transactions = {
  create: (fromAccount, toAccount, amount, idempotencyKey) =>
    request('POST', '/transactions/', { fromAccount, toAccount, amount, idempotencyKey }),
};
