import { Router } from 'express';
import { db } from '../db/index.js';

export const leaderboardRouter = Router();

// A run is "terminal" the moment it has a final competitive result — completed
// OR failed (see gameEngine.finalizeRun). Both get ranked together, primarily
// by score, so a team that fails partway through still gets a real, comparable
// result instead of disappearing from the board.
const TERMINAL_STATUSES = new Set(['completed', 'failed']);

leaderboardRouter.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.team_name as teamName, s.status, s.current_level as level, s.lives,
              s.recovery_attempts as recoveryAttempts, s.started_at as startedAt,
              s.completed_at as completedAt, s.score, s.game_duration_seconds as gameDurationSeconds
       FROM game_sessions s
       JOIN teams t ON t.id = s.team_id
       WHERE t.registration_status != 'disqualified'`
    )
    .all();

  const withTime = rows.map((r) => {
    let timeSeconds = null;
    if (r.startedAt && r.completedAt) {
      const raw = Math.round((new Date(r.completedAt + 'Z') - new Date(r.startedAt + 'Z')) / 1000);
      // Never let clock drift between "the moment expiry was detected" and the
      // official 15:00 cap show up as 15:03, 15:41, etc. on the board — a
      // terminal run's displayed time is always clamped to the official duration.
      timeSeconds = Math.max(0, Math.min(raw, r.gameDurationSeconds));
    }
    return { ...r, timeSeconds };
  });

  // TERMINAL — completed or failed, ranked score-first (spec: complete more ->
  // preserve lives -> finish faster -> avoid recoveries), never just fastest time.
  const terminal = withTime
    .filter((r) => TERMINAL_STATUSES.has(r.status))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.level - a.level ||
        b.lives - a.lives ||
        a.recoveryAttempts - b.recoveryAttempts ||
        (a.timeSeconds ?? Infinity) - (b.timeSeconds ?? Infinity) ||
        new Date(a.completedAt || 0) - new Date(b.completedAt || 0)
    );

  // ACTIVE — still genuinely in progress (tutorial/active/critical/recovering/
  // paused/not_started). No final time yet by definition; shown separately so
  // an in-progress run is never confused with a ranked competitive result.
  const active = withTime.filter((r) => !TERMINAL_STATUSES.has(r.status)).sort((a, b) => b.level - a.level || b.score - a.score);

  const rank = [...terminal, ...active].map((r, i) => ({ rank: i + 1, ...r }));
  res.json({ leaderboard: rank });
});
