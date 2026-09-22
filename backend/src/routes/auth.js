/**
 * Auth routes — team login only.
 *
 * Registration has been removed. Teams are created exclusively by admins
 * via POST /api/admin/teams/create. Teams can only log in here.
 *
 * Login flow:
 *   1. Look up team by team_name → get the auth email used at creation
 *   2. supabase.auth.signInWithPassword({ email, password })
 *   3. Return Supabase session tokens to the frontend
 */
import { Router } from 'express';
import { dbGet, logAudit } from '../db/index.js';
import { supabaseAdmin } from '../db/supabaseClient.js';

export const authRouter = Router();

// Team name → deterministic email used for Supabase Auth
// (teams never see or use this email; they log in with team name + password)
function teamEmail(teamName) {
  return `${teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}@agentzero.internal`;
}

authRouter.post('/login', async (req, res) => {
  const { teamName, password } = req.body || {};
  if (!teamName || !password) {
    return res.status(400).json({ error: 'teamName and password are required.' });
  }

  try {
    // Look up team to confirm it exists and is not disqualified
    const team = await dbGet(
      'SELECT * FROM teams WHERE team_name = $1',
      [teamName.trim()]
    );
    if (!team) return res.status(401).json({ error: 'Invalid credentials.' });
    if (team.registration_status === 'disqualified') {
      return res.status(403).json({ error: 'Team disqualified.' });
    }

    // Authenticate with Supabase using the team's auto-generated email
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: teamEmail(teamName.trim()),
      password,
    });
    if (error) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    logAudit(team.id, 'team_login', { teamName: team.team_name }).catch(() => {});

    return res.json({
      team: publicTeam(team),
      session: {
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in:    data.session.expires_in,
      },
    });
  } catch (err) {
    console.error('[auth/login] Error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
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
