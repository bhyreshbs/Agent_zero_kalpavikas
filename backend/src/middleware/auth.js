/**
 * Auth middleware — Supabase Auth.
 *
 * requireTeamAuth  — verifies Supabase JWT, looks up team by auth_user_id.
 * requireAdminAuth — unchanged (x-admin-secret header).
 */
import { supabaseAdmin } from '../db/supabaseClient.js';
import { dbGet } from '../db/index.js';

export async function requireTeamAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token.' });

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token.' });

    const team = await dbGet('SELECT * FROM teams WHERE auth_user_id = $1', [user.id]);
    if (!team) return res.status(401).json({ error: 'Team not found.' });
    if (team.registration_status === 'disqualified') {
      return res.status(403).json({ error: 'Team disqualified.' });
    }

    req.team = team;
    next();
  } catch (err) {
    console.error('[auth] requireTeamAuth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireAdminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }
  next();
}
