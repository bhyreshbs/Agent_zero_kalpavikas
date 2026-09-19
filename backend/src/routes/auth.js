import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { db, getConfig, logAudit } from '../db/index.js';
import { signTeamToken } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  if (getConfig('registration_open') !== 'true') {
    return res.status(403).json({ error: 'Registration is closed.' });
  }

  const { teamName, member1, member2, member3, contact, password } = req.body || {};

  if (!teamName || !member1 || !member2 || !contact || !password) {
    return res.status(400).json({ error: 'teamName, member1, member2, contact, and password are required.' });
  }
  if (teamName.trim().length < 2) {
    return res.status(400).json({ error: 'Invalid team size / name.' });
  }
  // Team size 2-3: member1 + member2 required, member3 optional (spec section 16).

  const existing = db.prepare('SELECT id FROM teams WHERE team_name = ?').get(teamName.trim());
  if (existing) {
    return res.status(409).json({ error: 'A team with that name is already registered.' });
  }

  const id = nanoid();
  const passwordHash = await bcrypt.hash(password, 10);

  db.prepare(
    `INSERT INTO teams (id, team_name, member1, member2, member3, contact, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, teamName.trim(), member1, member2, member3 || null, contact, passwordHash);

  logAudit(id, 'team_registered', { teamName });

  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(id);
  res.status(201).json({
    team: publicTeam(team),
    token: signTeamToken(team),
  });
});

authRouter.post('/login', async (req, res) => {
  const { teamName, password } = req.body || {};
  if (!teamName || !password) return res.status(400).json({ error: 'teamName and password are required.' });

  const team = db.prepare('SELECT * FROM teams WHERE team_name = ?').get(teamName.trim());
  if (!team) return res.status(401).json({ error: 'Invalid credentials.' });

  const valid = await bcrypt.compare(password, team.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });
  if (team.registration_status === 'disqualified') {
    return res.status(403).json({ error: 'Team disqualified.' });
  }

  res.json({ team: publicTeam(team), token: signTeamToken(team) });
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
