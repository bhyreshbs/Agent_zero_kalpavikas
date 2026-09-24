const BASE = import.meta.env.VITE_API_BASE || '/api';

// ---------------------------------------------------------------------------
// Session management — InsForge Auth tokens issued through the Express backend.
// The browser only ever talks to the Express API (/auth/login, /auth/refresh,
// /auth/logout); it holds { access_token, refresh_token, expires_at } locally.
// ---------------------------------------------------------------------------
const SESSION_KEY = 'az_session';
const REFRESH_SKEW_MS = 30_000; // refresh slightly before the access token expires
const AUTH_PATHS = new Set(['/auth/login', '/auth/refresh', '/auth/logout']);

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s?.access_token ? s : null;
  } catch {
    return null;
  }
}

function writeSession(s) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
}

function expiryMs(session) {
  if (typeof session.expires_in === 'number') return Date.now() + session.expires_in * 1000;
  try {
    const payload = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch { /* fall through */ }
  return Date.now() + 5 * 60_000;
}

/** Store the session returned by POST /auth/login. */
export async function setSession(session) {
  if (session?.access_token && session?.refresh_token) {
    writeSession({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
      expires_at:    expiryMs(session),
    });
  }
}

// One refresh at a time (all callers share the same in-flight promise) so
// concurrent requests and the 4 s poll never spend the same refresh token twice.
let refreshInFlight = null;

// Resolves { ok: true, token } | { ok: false, definitive: boolean }.
//   definitive = the server rejected the refresh token → the session is over.
//   !definitive = network/5xx/rate-limit → keep the session and try again later.
function refreshSession() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const used = readSession();
    if (!used?.refresh_token) return { ok: false, definitive: true };
    let res;
    try {
      res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: used.refresh_token }),
      });
    } catch {
      return { ok: false, definitive: false };
    }
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.session?.access_token && data.session?.refresh_token) {
        writeSession({
          access_token:  data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at:    expiryMs(data.session),
        });
        return { ok: true, token: data.session.access_token };
      }
      return { ok: false, definitive: false };
    }
    if (res.status === 400 || res.status === 401) {
      // Another tab may have already rotated the refresh token; use its session instead of logging out.
      const current = readSession();
      if (current && current.refresh_token !== used.refresh_token) return { ok: true, token: current.access_token };
      clearSession();
      return { ok: false, definitive: true };
    }
    return { ok: false, definitive: false };
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

/** Current access token, refreshed first if it is about to expire. Null when logged out. */
export async function getToken() {
  const s = readSession();
  if (!s) return null;
  if (s.expires_at - Date.now() > REFRESH_SKEW_MS) return s.access_token;
  const r = await refreshSession();
  if (r.ok) return r.token;
  // Transient failure: the old token may still be valid, let the request decide.
  return r.definitive ? null : s.access_token;
}

/** End the session: best-effort server sign-out, always clear local tokens. */
export async function logout() {
  const s = readSession();
  clearSession();
  if (s?.access_token) {
    try {
      await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${s.access_token}` } });
    } catch { /* offline: local session is already cleared */ }
  }
}

/** Check whether a session is stored (sync). A stored refresh token makes an expired access token recoverable. */
export function isLoggedIn() {
  return !!readSession();
}

// Session is unrecoverable: clear it and send the player to the login page (once).
function handleSessionExpired() {
  clearSession();
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
}

// ---------------------------------------------------------------------------
// HTTP request helper
// ---------------------------------------------------------------------------
async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const send = (token) => fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const token = await getToken();
  let res = await send(token);

  // Expired/rejected access token: refresh once and retry once. Never loops:
  // the retry is not retried, and auth endpoints never trigger a refresh.
  if (res.status === 401 && token && !AUTH_PATHS.has(path)) {
    const r = await refreshSession();
    if (r.ok) {
      res = await send(r.token);
      if (res.status === 401) handleSessionExpired();
    } else if (r.definitive) {
      handleSessionExpired();
    }
  }

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
  exit: ()                    => request('/game/exit', { method: 'POST' }),
  sendAction: (action, payload) => request('/game/action', { method: 'POST', body: { action, payload } }),
  recoveryStart: ()           => request('/game/recovery/start', { method: 'POST' }),
  recoverySubmit: (answer)    => request('/game/recovery/submit', { method: 'POST', body: { answer } }),
  chat: (message, target)     => request('/game/chat', { method: 'POST', body: { message, target } }),
  hint: ()                    => request('/game/hint', { method: 'POST' }),
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
  leaderboard:   (adminSecret) => {
    return fetch(`${BASE}/leaderboard`, {
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    });
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
