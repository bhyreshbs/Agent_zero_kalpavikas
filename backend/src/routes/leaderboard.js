import { Router } from 'express';
import { dbAll } from '../db/index.js';

export const leaderboardRouter = Router();

const TERMINAL_STATUSES = new Set(['completed', 'failed']);

leaderboardRouter.get('/', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT t.team_name as "teamName", s.status, s.current_level as level, s.lives,
              s.recovery_attempts as "recoveryAttempts", s.started_at as "startedAt",
              s.completed_at as "completedAt", s.score,
              s.game_duration_seconds as "gameDurationSeconds"
       FROM game_sessions s
       JOIN teams t ON t.id = s.team_id
       WHERE t.registration_status != 'disqualified'`
    );

    const withTime = rows.map((r) => {
      let timeSeconds = null;
      if (r.startedAt && r.completedAt) {
        const start = r.startedAt instanceof Date ? r.startedAt : new Date(r.startedAt);
        const end   = r.completedAt instanceof Date ? r.completedAt : new Date(r.completedAt);
        const raw   = Math.round((end - start) / 1000);
        timeSeconds = Math.max(0, Math.min(raw, r.gameDurationSeconds));
      }
      return { ...r, timeSeconds };
    });

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

    const active = withTime
      .filter((r) => !TERMINAL_STATUSES.has(r.status))
      .sort((a, b) => b.level - a.level || b.score - a.score);

    const rank = [...terminal, ...active].map((r, i) => ({ rank: i + 1, ...r }));
    res.json({ leaderboard: rank });
  } catch (err) {
    console.error('[leaderboard]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
