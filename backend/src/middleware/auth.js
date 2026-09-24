/**
 * Auth middleware — InsForge Auth.
 *
 * requireTeamAuth  — verifies the InsForge access token, looks up the team by
 *                    auth_user_id, rejects disqualified teams.
 * requireAdminAuth — unchanged (x-admin-secret header).
 */
import { createHash } from 'node:crypto';
import { getUserFromToken, secondsUntilExpiry, InsForgeError } from '../db/insforgeClient.js';
import { dbGet } from '../db/index.js';

// Every game request (and the 4 s state poll of every team) needs the token
// resolved to a user. To avoid one InsForge round trip per request, a token that
// was just verified is remembered briefly, capped by the token's own expiry.
// A revoked/deleted user is therefore still accepted for at most VERIFY_TTL_MS;
// team status (e.g. disqualified) is NOT cached — it is read from the DB every time.
const VERIFY_TTL_MS = 15_000;
const CACHE_MAX_ENTRIES = 2000;
const verified = new Map(); // sha256(token) -> { userId, until }

function cacheKey(token) {
  return createHash('sha256').update(token).digest('hex');
}

function remember(token, userId) {
  if (verified.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of verified) if (v.until <= now) verified.delete(k);
    if (verified.size >= CACHE_MAX_ENTRIES) verified.clear();
  }
  const expSeconds = secondsUntilExpiry(token);
  const ttl = expSeconds == null ? VERIFY_TTL_MS : Math.min(VERIFY_TTL_MS, expSeconds * 1000);
  if (ttl > 0) verified.set(cacheKey(token), { userId, until: Date.now() + ttl });
}

export async function requireTeamAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token.' });

  try {
    let userId;
    const hit = verified.get(cacheKey(token));
    if (hit && hit.until > Date.now()) {
      userId = hit.userId;
    } else {
      const user = await getUserFromToken(token);
      if (!user) return res.status(401).json({ error: 'Invalid or expired token.' });
      userId = user.id;
      remember(token, userId);
    }

    const team = await dbGet('SELECT * FROM teams WHERE auth_user_id = $1', [userId]);
    if (!team) return res.status(401).json({ error: 'Team not found.' });
    if (team.registration_status === 'disqualified') {
      return res.status(403).json({ error: 'Team disqualified.' });
    }

    req.team = team;
    next();
  } catch (err) {
    console.error('[auth] requireTeamAuth error:', err.name, err.status || '');
    if (err instanceof InsForgeError) {
      // Auth provider unreachable: do NOT answer 401, or clients would drop a valid session.
      return res.status(503).json({ error: 'Authentication service unavailable. Please retry.' });
    }
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export function requireAdminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }
  next();
}
