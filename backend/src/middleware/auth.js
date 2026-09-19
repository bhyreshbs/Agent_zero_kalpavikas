import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

export function signTeamToken(team) {
  return jwt.sign({ teamId: team.id, role: team.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
}

export function requireTeamAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(payload.teamId);
    if (!team) return res.status(401).json({ error: 'Team not found.' });
    if (team.registration_status === 'disqualified') {
      return res.status(403).json({ error: 'Team disqualified.' });
    }
    req.team = team;
    next();
  } catch {
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
