import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.js';
import { dbGet, dbAll, dbRun, getConfig, setConfig, logAudit } from '../db/index.js';
import { supabaseAdmin } from '../db/supabaseClient.js';
import { remainingSeconds } from '../engine/timer.js';
import { computeProfile, selectLevel4Modules, selectLevel5Modules } from '../engine/behaviourProfile.js';
import { getScoreBreakdown } from '../engine/gameEngine.js';

export const adminRouter = Router();
adminRouter.use(requireAdminAuth);

// Derives the deterministic Supabase Auth email from a team name.
// Must match the formula used in auth.js login.
function teamEmail(teamName) {
  return `${teamName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}@agentzero.internal`;
}

// ============================================================================
// TEAM CREATION (admin-only) — the only way to create teams in the system
// ============================================================================
adminRouter.post('/teams/create', async (req, res) => {
  const { teamName, password, member1, member2, member3, contact } = req.body || {};

  if (!teamName || !password || !member1 || !member2 || !contact) {
    return res.status(400).json({ error: 'teamName, password, member1, member2, and contact are required.' });
  }
  if (teamName.trim().length < 2) {
    return res.status(400).json({ error: 'Team name must be at least 2 characters.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // Check for duplicate team name
  const existing = await dbGet('SELECT id FROM teams WHERE team_name = $1', [teamName.trim()]);
  if (existing) {
    return res.status(409).json({ error: 'A team with that name already exists.' });
  }

  try {
    // 1. Create Supabase Auth user (handles password hashing securely)
    const email = teamEmail(teamName.trim());
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,   // skip email confirmation — admin controls accounts
    });
    if (authError) {
      console.error('[admin/teams/create] Supabase auth error:', authError.message);
      return res.status(500).json({ error: `Failed to create auth account: ${authError.message}` });
    }

    // 2. Insert team record linked to auth user
    const { rows } = await dbRun(
      `INSERT INTO teams (auth_user_id, team_name, member1, member2, member3, contact)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [authData.user.id, teamName.trim(), member1, member2, member3 || null, contact]
    );
    const team = rows[0];

    await logAudit('admin', 'team_created', { teamName: team.team_name, teamId: team.id });

    return res.status(201).json({ team: publicTeam(team) });
  } catch (err) {
    console.error('[admin/teams/create] Error:', err.message);
    return res.status(500).json({ error: 'Failed to create team.' });
  }
});

// Reset a team's password (admin only)
adminRouter.post('/teams/:id/reset-password', async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const team = await dbGet('SELECT * FROM teams WHERE id = $1', [req.params.id]);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  if (!team.auth_user_id) return res.status(400).json({ error: 'Team has no auth account.' });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(team.auth_user_id, { password });
  if (error) return res.status(500).json({ error: error.message });

  await logAudit('admin', 'team_password_reset', { teamId: team.id });
  res.json({ ok: true });
});

// ============================================================================
// TEAMS / SESSIONS OVERVIEW
// ============================================================================
adminRouter.get('/teams', async (req, res) => {
  try {
    const teams = await dbAll(
      `SELECT t.id, t.team_name as "teamName", t.payment_status as "paymentStatus",
              t.registration_status as "registrationStatus",
              s.status as "sessionStatus", s.current_level as "currentLevel", s.lives,
              s.score, s.recovery_attempts as "recoveryAttempts",
              s.recovery_successes as "recoverySuccesses", s.started_at as "startedAt",
              s.completed_at as "completedAt", s.time_paused_seconds as "timePausedSeconds",
              s.paused_at as "pausedAt", s.game_duration_seconds as "gameDurationSeconds",
              s.focus_violations as "focusViolations", s.security_warnings as "securityWarnings",
              s.security_life_penalties as "securityLifePenalties"
       FROM teams t LEFT JOIN game_sessions s ON s.team_id = t.id
       ORDER BY t.created_at DESC`
    );

    const enriched = teams.map((t) => ({
      ...t,
      timeRemainingSeconds: t.startedAt
        ? remainingSeconds({
            started_at: t.startedAt instanceof Date ? t.startedAt.toISOString() : t.startedAt,
            game_duration_seconds: t.gameDurationSeconds,
            status: t.sessionStatus,
            time_paused_seconds: t.timePausedSeconds || 0,
            paused_at: t.pausedAt instanceof Date ? t.pausedAt.toISOString() : t.pausedAt,
          })
        : null,
    }));

    res.json({ teams: enriched });
  } catch (err) {
    console.error('[admin/teams]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ============================================================================
// BEHAVIOUR PROFILE
// ============================================================================
adminRouter.get('/teams/:id/behaviour-profile', async (req, res) => {
  try {
    const session = await dbGet('SELECT * FROM game_sessions WHERE team_id = $1', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'No session for this team.' });

    const behaviourFlags = session.behaviour_flags || {};
    const live   = computeProfile(behaviourFlags);
    const locked = behaviourFlags.profile || null;

    res.json({
      currentLevel:          session.current_level,
      liveProfile:           live,
      lockedProfile:         locked,
      selectedLevel4Modules: locked ? selectLevel4Modules(locked) : null,
      selectedLevel5Modules: locked ? selectLevel5Modules(locked) : null,
      rawObservations:       behaviourFlags.obs          || null,
      actionCounts:          behaviourFlags.actionCounts || null,
    });
  } catch (err) {
    console.error('[admin/behaviour-profile]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ============================================================================
// SCORE AUDIT
// ============================================================================
adminRouter.get('/teams/:id/score-breakdown', async (req, res) => {
  try {
    const team = await dbGet('SELECT id, team_name as "teamName" FROM teams WHERE id = $1', [req.params.id]);
    if (!team) return res.status(404).json({ error: 'Team not found.' });

    const session = await dbGet('SELECT * FROM game_sessions WHERE team_id = $1', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'No session for this team.' });

    const breakdown = await getScoreBreakdown(session);
    const started = session.started_at instanceof Date ? session.started_at.toISOString() : session.started_at;
    const timeRemainingSeconds = started
      ? remainingSeconds({
          started_at: started,
          game_duration_seconds: session.game_duration_seconds,
          status: session.status,
          time_paused_seconds: session.time_paused_seconds || 0,
          paused_at: session.paused_at instanceof Date ? session.paused_at.toISOString() : session.paused_at,
        })
      : null;

    res.json({
      teamId: team.id,
      teamName: team.teamName,
      status: session.status,
      currentLevel: session.current_level,
      lives: session.lives,
      recoveryAttempts: session.recovery_attempts,
      recoverySuccesses: session.recovery_successes,
      timeRemainingSeconds,
      levels: [1, 2, 3, 4, 5].map((n) => ({ level: n, points: breakdown.perLevelScore[n] })),
      lifeScore:       breakdown.lifeScore,
      recoveryPenalty: breakdown.recoveryPenalty,
      timeBonus:       breakdown.timeBonus,
      efficiencyScore: breakdown.efficiencyScore,
      precision:       breakdown.precision,
      baseScore:       breakdown.baseScore,
      finalScore:      breakdown.finalScore,
      leaderboardScore: session.score,
    });
  } catch (err) {
    console.error('[admin/score-breakdown]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ============================================================================
// SECURITY MONITORING
// ============================================================================
adminRouter.get('/teams/:id/security', async (req, res) => {
  try {
    const session = await dbGet('SELECT * FROM game_sessions WHERE team_id = $1', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'No session for this team.' });

    const events = await dbAll(
      `SELECT type, reason, created_at as "createdAt", penalty_applied as "penaltyApplied"
       FROM security_events WHERE session_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [session.id]
    );

    res.json({
      totalViolations:   session.focus_violations          || 0,
      warnings:          session.security_warnings         || 0,
      lifePenalties:     session.security_life_penalties   || 0,
      lastViolationAt:   session.last_violation_at,
      lastViolationReason: session.last_violation_reason,
      events,
    });
  } catch (err) {
    console.error('[admin/security]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ============================================================================
// TEAM MANAGEMENT ACTIONS
// ============================================================================
adminRouter.patch('/teams/:id/payment', async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['pending', 'verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid payment status.' });
    }
    await dbRun('UPDATE teams SET payment_status = $1 WHERE id = $2', [status, req.params.id]);
    await logAudit('admin', 'payment_status_updated', { teamId: req.params.id, status });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/payment]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

adminRouter.post('/teams/:id/disqualify', async (req, res) => {
  try {
    await dbRun(`UPDATE teams SET registration_status = 'disqualified' WHERE id = $1`, [req.params.id]);
    await dbRun(`UPDATE game_sessions SET status = 'disqualified' WHERE team_id = $1`, [req.params.id]);
    await logAudit('admin', 'team_disqualified', { teamId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/disqualify]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

adminRouter.post('/teams/:id/reset', async (req, res) => {
  try {
    const session = await dbGet('SELECT id FROM game_sessions WHERE team_id = $1', [req.params.id]);
    if (session) {
      await dbRun('DELETE FROM security_events WHERE session_id = $1', [session.id]);
      await dbRun('DELETE FROM level_results WHERE session_id = $1', [session.id]);
      await dbRun('DELETE FROM game_sessions WHERE id = $1', [session.id]);
    }
    await logAudit('admin', 'team_session_reset', { teamId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/reset]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

adminRouter.post('/teams/:id/pause', async (req, res) => {
  try {
    await dbRun(
      `UPDATE game_sessions SET status = 'paused', paused_at = NOW()
       WHERE team_id = $1 AND status != 'paused'`,
      [req.params.id]
    );
    await logAudit('admin', 'team_paused', { teamId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/pause]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

adminRouter.post('/teams/:id/resume', async (req, res) => {
  try {
    const session = await dbGet('SELECT * FROM game_sessions WHERE team_id = $1', [req.params.id]);
    if (!session || session.status !== 'paused') {
      return res.status(409).json({ error: 'Not paused.' });
    }
    let pausedFor = 0;
    if (session.paused_at) {
      const pAt = session.paused_at instanceof Date ? session.paused_at : new Date(session.paused_at);
      pausedFor = Math.floor((Date.now() - pAt.getTime()) / 1000);
    }
    const restoredStatus = session.lives <= 0 ? 'critical' : session.current_level === 0 ? 'tutorial' : 'active';
    await dbRun(
      `UPDATE game_sessions SET status = $1, paused_at = NULL,
       time_paused_seconds = time_paused_seconds + $2 WHERE team_id = $3`,
      [restoredStatus, pausedFor, req.params.id]
    );
    await logAudit('admin', 'team_resumed', { teamId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/resume]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

adminRouter.post('/teams/:id/restore-life', async (req, res) => {
  try {
    await dbRun(
      `UPDATE game_sessions SET lives = lives + 1,
       status = CASE WHEN status = 'critical' THEN 'active' ELSE status END
       WHERE team_id = $1`,
      [req.params.id]
    );
    await logAudit('admin', 'life_manually_restored', { teamId: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[admin/restore-life]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ============================================================================
// EVENT CONFIG
// ============================================================================
adminRouter.get('/config', async (req, res) => {
  try {
    const rows = await dbAll('SELECT key, value FROM admin_config');
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

adminRouter.patch('/config', async (req, res) => {
  const allowed = [
    'game_duration_seconds', 'max_recoveries', 'initial_lives',
    'recovery_window_seconds', 'registration_open', 'event_started',
    'secure_mode_enabled', 'fullscreen_required', 'violation_cooldown_seconds',
  ];
  try {
    for (const [key, value] of Object.entries(req.body || {})) {
      if (allowed.includes(key)) await setConfig(key, value);
    }
    await logAudit('admin', 'config_updated', req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ============================================================================
// CSV EXPORT
// ============================================================================
adminRouter.get('/export.csv', async (req, res) => {
  try {
    const teams = await dbAll(
      `SELECT id, team_name, member1, member2, member3 FROM teams ORDER BY created_at DESC`
    );

    const header = [
      'team_name','member1','member2','member3','status','current_level','lives',
      'score','recovery_attempts','recovery_successes','started_at','completed_at',
      'recoverySuccesses','completionTime',
      'level1Score','level2Score','level3Score','level4Score','level5Score',
      'lifeScore','recoveryPenalty','timeBonus','efficiencyScore','precision','finalScore',
      'focusViolations','securityWarnings','securityLifePenalties',
    ].join(',');

    const lines = await Promise.all(
      teams.map(async (t) => {
        const s = await dbGet('SELECT * FROM game_sessions WHERE team_id = $1', [t.id]);
        const b = s ? await getScoreBreakdown(s) : null;
        const values = [
          t.team_name, t.member1, t.member2, t.member3 || '',
          s?.status || 'not_started', s?.current_level ?? '', s?.lives ?? '',
          s?.score ?? '', s?.recovery_attempts ?? '', s?.recovery_successes ?? '',
          s?.started_at   ? (s.started_at instanceof Date   ? s.started_at.toISOString()   : s.started_at)   : '',
          s?.completed_at ? (s.completed_at instanceof Date ? s.completed_at.toISOString() : s.completed_at) : '',
          s?.recovery_successes ?? '', s?.completed_at || '',
          b?.perLevelScore[1] ?? 0, b?.perLevelScore[2] ?? 0, b?.perLevelScore[3] ?? 0,
          b?.perLevelScore[4] ?? 0, b?.perLevelScore[5] ?? 0,
          b?.lifeScore ?? '', b?.recoveryPenalty ?? '', b?.timeBonus ?? '',
          b?.efficiencyScore ?? '', b?.precision ?? '', b?.finalScore ?? '',
          s?.focus_violations || 0, s?.security_warnings || 0, s?.security_life_penalties || 0,
        ];
        return values.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
      })
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="agent_zero_results.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (err) {
    console.error('[admin/export]', err);
    res.status(500).json({ error: 'Export failed.' });
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
    createdAt: team.created_at,
  };
}
