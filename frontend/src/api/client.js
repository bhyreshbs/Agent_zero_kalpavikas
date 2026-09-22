import { supabase } from '../lib/supabase.js';

const BASE = import.meta.env.VITE_API_BASE || '/api';

// ---------------------------------------------------------------------------
// Session management — backed by Supabase Auth
// ---------------------------------------------------------------------------

/**
 * Store a Supabase session returned by the backend after login.
 * Supabase persists it automatically in localStorage under its own key.
 */
export async function setSession(session) {
  if (session?.access_token && session?.refresh_token) {
    await supabase.auth.setSession({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
    });
  }
}

/** Get the current Supabase access token (auto-refreshed by the client). */
async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** Sign out and clear all stored session data. */
export async function logout() {
  await supabase.auth.signOut();
}

/** Check if there is a currently active session (sync snapshot). */
export function isLoggedIn() {
  // supabase.auth.getSession() is async; this reads the in-memory cache.
  // Use in non-async contexts (e.g. route guards).
  try {
    const raw = localStorage.getItem('sb-' + import.meta.env.VITE_SUPABASE_URL?.split('//')[1]?.split('.')[0] + '-auth-token');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!(parsed?.access_token);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// HTTP request helper
// ---------------------------------------------------------------------------
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Game / auth API
// ---------------------------------------------------------------------------
export const api = {
  login:    (payload)         => request('/auth/login', { method: 'POST', body: payload }),
  getState: ()                => request('/game/state'),
  startGame: ()               => request('/game/start', { method: 'POST' }),
  sendAction: (action, payload) => request('/game/action', { method: 'POST', body: { action, payload } }),
  recoveryStart: ()           => request('/game/recovery/start', { method: 'POST' }),
  recoverySubmit: (answer)    => request('/game/recovery/submit', { method: 'POST', body: { answer } }),
  chat: (message, target)     => request('/game/chat', { method: 'POST', body: { message, target } }),
  hint: ()                    => request('/game/hint', { method: 'POST' }),
  leaderboard: ()             => request('/leaderboard'),
  reportSecurityViolation: (reason) => request('/game/security-violation', { method: 'POST', body: { reason } }),
};

// ---------------------------------------------------------------------------
// Admin API
// ---------------------------------------------------------------------------
export const adminApi = {
  async request(path, { method = 'GET', body, adminSecret } = {}) {
    const res = await fetch(`${BASE}/admin${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  },
  teams:         (adminSecret)             => adminApi.request('/teams', { adminSecret }),
  createTeam:    (body, adminSecret)       => adminApi.request('/teams/create', { method: 'POST', body, adminSecret }),
  resetPassword: (id, body, adminSecret)   => adminApi.request(`/teams/${id}/reset-password`, { method: 'POST', body, adminSecret }),
  disqualify:    (id, adminSecret)         => adminApi.request(`/teams/${id}/disqualify`, { method: 'POST', adminSecret }),
  reset:         (id, adminSecret)         => adminApi.request(`/teams/${id}/reset`, { method: 'POST', adminSecret }),
  pause:         (id, adminSecret)         => adminApi.request(`/teams/${id}/pause`, { method: 'POST', adminSecret }),
  resume:        (id, adminSecret)         => adminApi.request(`/teams/${id}/resume`, { method: 'POST', adminSecret }),
  restoreLife:   (id, adminSecret)         => adminApi.request(`/teams/${id}/restore-life`, { method: 'POST', adminSecret }),
  verifyPayment: (id, status, adminSecret) => adminApi.request(`/teams/${id}/payment`, { method: 'PATCH', body: { status }, adminSecret }),
  scoreBreakdown:(id, adminSecret)         => adminApi.request(`/teams/${id}/score-breakdown`, { adminSecret }),
  security:      (id, adminSecret)         => adminApi.request(`/teams/${id}/security`, { adminSecret }),
  config:        (adminSecret)             => adminApi.request('/config', { adminSecret }),
  updateConfig:  (body, adminSecret)       => adminApi.request('/config', { method: 'PATCH', body, adminSecret }),
  async exportCsv(adminSecret) {
    const res = await fetch(`${BASE}/admin/export.csv`, {
      headers: { 'x-admin-secret': adminSecret },
    });
    if (!res.ok) throw new Error('Export failed — check admin secret.');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'agent_zero_results.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
