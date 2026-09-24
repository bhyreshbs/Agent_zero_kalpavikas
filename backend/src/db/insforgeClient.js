/**
 * InsForge Auth client — used ONLY by the Express backend.
 *
 * Talks to the documented InsForge Auth REST API (`/api/auth/*`) with plain
 * fetch, so there is no SDK dependency. The admin calls (register/delete users)
 * authenticate with INSFORGE_API_KEY, which is a full-access admin key:
 * never import this file from frontend code and never log its values.
 *
 * Env: INSFORGE_URL (e.g. https://<appkey>.<region>.insforge.app), INSFORGE_API_KEY
 */

const REQUEST_TIMEOUT_MS = 10_000;

export class InsForgeError extends Error {
  constructor(message, { status = 0, code = null } = {}) {
    super(message);
    this.name = 'InsForgeError';
    this.status = status;
    this.code = code;
  }
}

function baseUrl() {
  return (process.env.INSFORGE_URL || '').replace(/\/+$/, '');
}

async function call(path, { method = 'GET', body, bearer } = {}) {
  const url = baseUrl();
  if (!url) throw new InsForgeError('INSFORGE_URL is not configured.', { status: 0, code: 'CONFIG' });

  let res;
  try {
    res = await fetch(`${url}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Network failure / timeout: status 0 lets callers tell "service down" from "bad credentials".
    throw new InsForgeError(`InsForge request failed (${err.name})`, { status: 0, code: 'NETWORK' });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new InsForgeError(data.message || data.error || `InsForge request failed (${res.status})`, {
      status: res.status,
      code: data.error || null,
    });
  }
  return data;
}

function adminKey() {
  const key = process.env.INSFORGE_API_KEY;
  if (!key) throw new InsForgeError('INSFORGE_API_KEY is not configured.', { status: 0, code: 'CONFIG' });
  return key;
}

/** Create an Auth user (admin key; works while public sign-up is disabled). Returns { id, email }. */
export async function registerUser({ email, password, name }) {
  const data = await call('/api/auth/users?client_type=server', {
    method: 'POST',
    bearer: adminKey(),
    body: { email, password, ...(name ? { name } : {}) },
  });
  return data.user;
}

/** Password sign-in. Returns { user, accessToken, refreshToken }. Throws InsForgeError(401) on bad credentials. */
export async function signInWithPassword(email, password) {
  return call('/api/auth/sessions?client_type=server', {
    method: 'POST',
    body: { method: 'password', email, password },
  });
}

/**
 * Resolve an access token to its user. Returns null if the token is invalid/expired
 * (HTTP 401/403); throws InsForgeError for anything else (network, 5xx) so callers
 * can answer "service unavailable" instead of wrongly signing the player out.
 */
export async function getUserFromToken(accessToken) {
  try {
    const data = await call('/api/auth/sessions/current', { bearer: accessToken });
    return data.user || null;
  } catch (err) {
    if (err instanceof InsForgeError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
}

/** Exchange a refresh token for a new access token (refresh token rotates). */
export async function refreshSession(refreshToken) {
  return call('/api/auth/refresh?client_type=server', {
    method: 'POST',
    body: { refreshToken },
  });
}

/** Best-effort server-side logout. */
export async function logoutSession(accessToken) {
  return call('/api/auth/logout', { method: 'POST', bearer: accessToken });
}

/** Delete Auth users by id (admin key). */
export async function deleteUsers(userIds) {
  return call('/api/auth/users', { method: 'DELETE', bearer: adminKey(), body: { userIds } });
}

/** Seconds until a JWT expires, from its (unverified) `exp` claim; null if unreadable. Never logs the token. */
export function secondsUntilExpiry(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? Math.max(0, payload.exp - Math.floor(Date.now() / 1000)) : null;
  } catch {
    return null;
  }
}
