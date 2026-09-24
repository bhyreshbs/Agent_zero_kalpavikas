/**
 * Auth routes — team login only.
 *
 * Registration has been removed. Teams are created exclusively by admins
 * via POST /api/admin/teams/create. Teams can only log in here.
 *
 * Login flow (InsForge Auth):
 *   1. Look up team by team_name → confirm it exists and is not disqualified
 *   2. InsForge password sign-in with the deterministic team email
 *   3. Return the InsForge session tokens to the frontend
 *
 * The browser never talks to InsForge directly: session refresh and logout are
 * also proxied through this router (/refresh, /logout).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { dbGet, logAudit } from '../db/index.js';
import {
  signInWithPassword,
  refreshSession,
  logoutSession,
  secondsUntilExpiry,
  InsForgeError,
} from '../db/insforgeClient.js';

export const authRouter = Router();

// Team name → deterministic email used for InsForge Auth
// (teams never see or use this email; they log in with team name + password)
function teamEmail(teamName) {
  return `${teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}@agentzero.internal`;
}

// Guards the auth provider against a misbehaving client stuck in a refresh loop.
const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many session refreshes — slow down.' },
});

function publicSession({ accessToken, refreshToken }) {
  return {
    access_token:  accessToken,
    refresh_token: refreshToken,
    expires_in:    secondsUntilExpiry(accessToken),
  };
}

authRouter.post('/login', async (req, res) => {
  const { teamName, password } = req.body || {};
  if (!teamName || !password || typeof teamName !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'teamName and password are required.' });
  }

  try {
    // Look up team to confirm it exists and is not disqualified
    // Team-name lookup is case-insensitive and ignores leading/trailing spaces. Only the
    // comparison is normalised (lower/btrim on both sides); the stored name is never changed.
    // A unique index on lower(btrim(team_name)) guarantees at most one match.
    // The password is NOT normalised and stays case-sensitive.
    const team = await dbGet(
      'SELECT * FROM teams WHERE lower(btrim(team_name)) = lower($1)',
      [teamName.trim()]
    );
    if (!team) return res.status(401).json({ error: 'Invalid credentials.' });
    if (team.registration_status === 'disqualified') {
      return res.status(403).json({ error: 'Team disqualified.' });
    }

    // Authenticate with InsForge using the team's auto-generated email
    let data;
    try {
      // Auth email comes from the registered (stored) name, not from what was typed.
      data = await signInWithPassword(teamEmail(team.team_name), password);
    } catch (err) {
      if (err instanceof InsForgeError && err.status >= 400 && err.status < 500) {
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
      throw err;
    }
    if (!data?.accessToken || !data?.refreshToken) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    logAudit(team.id, 'team_login', { teamName: team.team_name }).catch(() => {});

    return res.json({
      team: publicTeam(team),
      session: publicSession(data),
    });
  } catch (err) {
    console.error('[auth/login] Error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Exchange a refresh token for a new session. Deliberately unauthenticated by
// access token (it is expired when this is called); the refresh token is the credential.
authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  const refreshToken = req.body?.refresh_token;
  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ error: 'refresh_token is required.' });
  }
  try {
    const data = await refreshSession(refreshToken);
    if (!data?.accessToken || !data?.refreshToken) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.json({ session: publicSession(data) });
  } catch (err) {
    if (err instanceof InsForgeError && err.status >= 400 && err.status < 500) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    console.error('[auth/refresh] Error:', err.name, err.status || '');
    // Provider unreachable: not a credential failure, so the client must keep its session.
    return res.status(503).json({ error: 'Authentication service unavailable. Please retry.' });
  }
});

// Best-effort sign-out. The client always clears its own stored session regardless.
authRouter.post('/logout', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { await logoutSession(token); } catch { /* token may already be expired */ }
  }
  return res.json({ ok: true });
});

function publicTeam(team) {
  return {
    id: team.id,
    teamName: team.team_name,
    members: [team.member1, team.member2, team.member3].filter(Boolean),
    paymentStatus: team.payment_status,
    registrationStatus: team.registration_status,
    role: team.role,
  };
}
