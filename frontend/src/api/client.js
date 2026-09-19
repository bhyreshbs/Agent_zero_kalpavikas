const BASE = import.meta.env.VITE_API_BASE || '/api';

function getToken() {
  return localStorage.getItem('az_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('az_token', token);
  else localStorage.removeItem('az_token');
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
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

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
  getState: () => request('/game/state'),
  startGame: () => request('/game/start', { method: 'POST' }),
  sendAction: (action, payload) => request('/game/action', { method: 'POST', body: { action, payload } }),
  recoveryStart: () => request('/game/recovery/start', { method: 'POST' }),
  recoverySubmit: (answer) => request('/game/recovery/submit', { method: 'POST', body: { answer } }),
  chat: (message, target) => request('/game/chat', { method: 'POST', body: { message, target } }),
  hint: () => request('/game/hint', { method: 'POST' }),
  leaderboard: () => request('/leaderboard'),
  reportSecurityViolation: (reason) => request('/game/security-violation', { method: 'POST', body: { reason } }),
};

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
  teams: (adminSecret) => adminApi.request('/teams', { adminSecret }),
  disqualify: (id, adminSecret) => adminApi.request(`/teams/${id}/disqualify`, { method: 'POST', adminSecret }),
  reset: (id, adminSecret) => adminApi.request(`/teams/${id}/reset`, { method: 'POST', adminSecret }),
  pause: (id, adminSecret) => adminApi.request(`/teams/${id}/pause`, { method: 'POST', adminSecret }),
  resume: (id, adminSecret) => adminApi.request(`/teams/${id}/resume`, { method: 'POST', adminSecret }),
  restoreLife: (id, adminSecret) => adminApi.request(`/teams/${id}/restore-life`, { method: 'POST', adminSecret }),
  verifyPayment: (id, status, adminSecret) =>
    adminApi.request(`/teams/${id}/payment`, { method: 'PATCH', body: { status }, adminSecret }),
  scoreBreakdown: (id, adminSecret) => adminApi.request(`/teams/${id}/score-breakdown`, { adminSecret }),
  security: (id, adminSecret) => adminApi.request(`/teams/${id}/security`, { adminSecret }),
  config: (adminSecret) => adminApi.request('/config', { adminSecret }),
  updateConfig: (body, adminSecret) => adminApi.request('/config', { method: 'PATCH', body, adminSecret }),
  async exportCsv(adminSecret) {
    const res = await fetch(`${BASE}/admin/export.csv`, {
      headers: { 'x-admin-secret': adminSecret },
    });
    if (!res.ok) throw new Error('Export failed — check admin secret.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agent_zero_results.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
