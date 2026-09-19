import { Router } from 'express';
import { requireAdminAuth } from '../middleware/auth.js';
import { db, getConfig, setConfig, logAudit } from '../db/index.js';
import { remainingSeconds } from '../engine/timer.js';
import { computeProfile, selectLevel4Modules, selectLevel5Modules } from '../engine/behaviourProfile.js';
import { getScoreBreakdown } from '../engine/gameEngine.js';

export const adminRouter = Router();
adminRouter.use(requireAdminAuth);

// ---- Teams / sessions overview ----
adminRouter.get('/teams', (req, res) => {
  const teams = db
    .prepare(
      `SELECT t.id, t.team_name as teamName, t.payment_status as paymentStatus,
              t.registration_status as registrationStatus,
              s.status as sessionStatus, s.current_level as currentLevel, s.lives,
              s.score, s.recovery_attempts as recoveryAttempts,
              s.recovery_successes as recoverySuccesses, s.started_at as startedAt,
              s.completed_at as completedAt, s.time_paused_seconds as timePausedSeconds,
              s.paused_at as pausedAt, s.game_duration_seconds as gameDurationSeconds,
              s.focus_violations as focusViolations, s.security_warnings as securityWarnings,
              s.security_life_penalties as securityLifePenalties
       FROM teams t LEFT JOIN game_sessions s ON s.team_id = t.id
       ORDER BY t.created_at DESC`
    )
    .all();

  const enriched = teams.map((t) => ({
    ...t,
    timeRemainingSeconds: t.startedAt
      ? remainingSeconds({
          started_at: t.startedAt,
          game_duration_seconds: t.gameDurationSeconds,
          status: t.sessionStatus,
          time_paused_seconds: t.timePausedSeconds || 0,
          paused_at: t.pausedAt,
        })
      : null,
  }));

  res.json({ teams: enriched });
});

// ---- Dev/debug only: the "Agent Zero is watching" behavioural model ----
// Never exposed to players (spec section 21) — gated behind requireAdminAuth
// like every other route in this file, same ADMIN_SECRET as the rest of the
// admin panel. Shows the LIVE profile (re-derived from current counters via
// computeProfile, not just whatever was locked at Level 3) so it's useful for
// watching a team's raw numbers move during Levels 1-3 too, plus whichever
// locked profile + adaptive modules actually drove their Level 4/5, if any.
adminRouter.get('/teams/:id/behaviour-profile', (req, res) => {
  const session = db.prepare('SELECT * FROM game_sessions WHERE team_id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'No session for this team.' });

  let behaviourFlags = {};
  try {
    behaviourFlags = JSON.parse(session.behaviour_flags || '{}');
  } catch {
    behaviourFlags = {};
  }

  const live = computeProfile(behaviourFlags);
  const locked = behaviourFlags.profile || null;

  res.json({
    currentLevel: session.current_level,
    liveProfile: live, // continuously recomputed from raw counters, even before Level 3 locks it
    lockedProfile: locked, // what Level 4/5 actually used, once Level 3 completed (null before that)
    selectedLevel4Modules: locked ? selectLevel4Modules(locked) : null,
    selectedLevel5Modules: locked ? selectLevel5Modules(locked) : null,
    rawObservations: behaviourFlags.obs || null,
    actionCounts: behaviourFlags.actionCounts || null,
  });
});

// ---- Score audit (spec Part 1) ----
// The one place the Admin dashboard's "DETAILS" panel and the CSV export
// both read from — see gameEngine.getScoreBreakdown, the single authoritative
// scoring calculation shared with the leaderboard and the player result
// screen. Never returns puzzle answers, secret objectives, or credentials —
// only the score arithmetic components.
adminRouter.get('/teams/:id/score-breakdown', (req, res) => {
  const team = db.prepare('SELECT id, team_name as teamName FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found.' });
  const session = db.prepare('SELECT * FROM game_sessions WHERE team_id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'No session for this team.' });

  const breakdown = getScoreBreakdown(session);
  const timeRemainingSeconds = session.started_at
    ? remainingSeconds({
        started_at: session.started_at,
        game_duration_seconds: session.game_duration_seconds,
        status: session.status,
        time_paused_seconds: session.time_paused_seconds || 0,
        paused_at: session.paused_at,
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
    // Per-level completion points, in Level 1-5 order, for the "SCORE AUDIT" list.
    levels: [1, 2, 3, 4, 5].map((n) => ({ level: n, points: breakdown.perLevelScore[n] })),
    lifeScore: breakdown.lifeScore,
    recoveryPenalty: breakdown.recoveryPenalty,
    timeBonus: breakdown.timeBonus,
    efficiencyScore: breakdown.efficiencyScore,
    precision: breakdown.precision,
    baseScore: breakdown.baseScore, // "Display/Base Score" — everything except the tiebreaker
    finalScore: breakdown.finalScore, // "Competitive Score" — exactly what the leaderboard shows
    // Sanity check for anyone auditing by hand: this must always equal finalScore,
    // since both come from the exact same session.score column.
    leaderboardScore: session.score,
  });
});

// ---- Security / anti-cheat monitoring (spec Part 3) ----
adminRouter.get('/teams/:id/security', (req, res) => {
  const session = db.prepare('SELECT * FROM game_sessions WHERE team_id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'No session for this team.' });

  const events = db
    .prepare(
      `SELECT type, reason, created_at as createdAt, penalty_applied as penaltyApplied
       FROM security_events WHERE session_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(session.id);

  res.json({
    totalViolations: session.focus_violations || 0,
    warnings: session.security_warnings || 0,
    lifePenalties: session.security_life_penalties || 0,
    lastViolationAt: session.last_violation_at,
    lastViolationReason: session.last_violation_reason,
    events,
  });
});

adminRouter.patch('/teams/:id/payment', (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'verified', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid payment status.' });
  }
  db.prepare('UPDATE teams SET payment_status = ? WHERE id = ?').run(status, req.params.id);
  logAudit('admin', 'payment_status_updated', { teamId: req.params.id, status });
  res.json({ ok: true });
});

adminRouter.post('/teams/:id/disqualify', (req, res) => {
  db.prepare(`UPDATE teams SET registration_status = 'disqualified' WHERE id = ?`).run(req.params.id);
  db.prepare(`UPDATE game_sessions SET status = 'disqualified' WHERE team_id = ?`).run(req.params.id);
  logAudit('admin', 'team_disqualified', { teamId: req.params.id });
  res.json({ ok: true });
});

adminRouter.post('/teams/:id/reset', (req, res) => {
  // Reset clears the gameplay session for a fresh run — including security
  // violation history, since a new run starts a new clean security state
  // (spec: "if an admin resets a team, reset security violation counters for
  // the new run"). Registration/team records themselves are untouched.
  db.prepare('DELETE FROM security_events WHERE session_id IN (SELECT id FROM game_sessions WHERE team_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM level_results WHERE session_id IN (SELECT id FROM game_sessions WHERE team_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM game_sessions WHERE team_id = ?').run(req.params.id);
  logAudit('admin', 'team_session_reset', { teamId: req.params.id });
  res.json({ ok: true });
});

adminRouter.post('/teams/:id/pause', (req, res) => {
  db.prepare(
    `UPDATE game_sessions SET status = 'paused', paused_at = datetime('now') WHERE team_id = ? AND status != 'paused'`
  ).run(req.params.id);
  logAudit('admin', 'team_paused', { teamId: req.params.id });
  res.json({ ok: true });
});

adminRouter.post('/teams/:id/resume', (req, res) => {
  const session = db.prepare('SELECT * FROM game_sessions WHERE team_id = ?').get(req.params.id);
  if (!session || session.status !== 'paused') return res.status(409).json({ error: 'Not paused.' });
  const pausedFor = session.paused_at
    ? Math.floor((Date.now() - new Date(session.paused_at + 'Z').getTime()) / 1000)
    : 0;
  const restoredStatus = session.lives <= 0 ? 'critical' : session.current_level === 0 ? 'tutorial' : 'active';
  db.prepare(
    `UPDATE game_sessions SET status = ?, paused_at = NULL, time_paused_seconds = time_paused_seconds + ? WHERE team_id = ?`
  ).run(restoredStatus, pausedFor, req.params.id);
  logAudit('admin', 'team_resumed', { teamId: req.params.id });
  res.json({ ok: true });
});

adminRouter.post('/teams/:id/restore-life', (req, res) => {
  db.prepare(
    `UPDATE game_sessions SET lives = lives + 1, status = CASE WHEN status = 'critical' THEN 'active' ELSE status END
     WHERE team_id = ?`
  ).run(req.params.id);
  logAudit('admin', 'life_manually_restored', { teamId: req.params.id });
  res.json({ ok: true });
});

// ---- Event config ----
adminRouter.get('/config', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM admin_config').all();
  res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

adminRouter.patch('/config', (req, res) => {
  const allowed = [
    'game_duration_seconds',
    'max_recoveries',
    'initial_lives',
    'recovery_window_seconds',
    'registration_open',
    'event_started',
    'secure_mode_enabled',
    'fullscreen_required',
    'violation_cooldown_seconds',
  ];
  for (const [key, value] of Object.entries(req.body || {})) {
    if (allowed.includes(key)) setConfig(key, value);
  }
  logAudit('admin', 'config_updated', req.body);
  res.json({ ok: true });
});

// ---- Export ----
// Every score column here comes from the SAME getScoreBreakdown() call the
// Admin score-audit panel uses — the CSV can never disagree with what's on
// screen, because there is only one place that does the arithmetic.
adminRouter.get('/export.csv', (req, res) => {
  const teams = db
    .prepare(`SELECT id, team_name, member1, member2, member3 FROM teams ORDER BY created_at DESC`)
    .all();

  const header = [
    // Original columns — unchanged, so this export never breaks anything
    // already built against it.
    'team_name', 'member1', 'member2', 'member3', 'status', 'current_level', 'lives',
    'score', 'recovery_attempts', 'recovery_successes', 'started_at', 'completed_at',
    // New columns (spec Part 1/2) — all sourced from the same
    // getScoreBreakdown() the Admin score-audit panel reads.
    'recoverySuccesses', 'completionTime',
    'level1Score', 'level2Score', 'level3Score', 'level4Score', 'level5Score',
    'lifeScore', 'recoveryPenalty', 'timeBonus', 'efficiencyScore', 'precision', 'finalScore',
    'focusViolations', 'securityWarnings', 'securityLifePenalties',
  ].join(',');

  const lines = teams.map((t) => {
    const s = db.prepare('SELECT * FROM game_sessions WHERE team_id = ?').get(t.id);
    const b = s ? getScoreBreakdown(s) : null;
    const values = [
      t.team_name, t.member1, t.member2, t.member3 || '',
      s?.status || 'not_started', s?.current_level ?? '', s?.lives ?? '',
      s?.score ?? '', s?.recovery_attempts ?? '', s?.recovery_successes ?? '',
      s?.started_at || '', s?.completed_at || '',
      s?.recovery_successes ?? '', s?.completed_at || '',
      b?.perLevelScore[1] ?? 0, b?.perLevelScore[2] ?? 0, b?.perLevelScore[3] ?? 0,
      b?.perLevelScore[4] ?? 0, b?.perLevelScore[5] ?? 0,
      b?.lifeScore ?? '', b?.recoveryPenalty ?? '', b?.timeBonus ?? '', b?.efficiencyScore ?? '',
      b?.precision ?? '', b?.finalScore ?? '',
      s?.focus_violations || 0, s?.security_warnings || 0, s?.security_life_penalties || 0,
    ];
    return values.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="agent_zero_results.csv"');
  res.send([header, ...lines].join('\n'));
});
