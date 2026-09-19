import { Router } from 'express';
import { db, logAudit } from '../db/index.js';
import { getSessionByTeam, getClientState } from '../engine/gameEngine.js';
import { LEVEL_BY_INDEX, MAIN_LEVEL_COUNT } from '../engine/levels.js';
import { requireTeamAuth } from '../middleware/auth.js';

export const demoRouter = Router();

// Test/demo mode -- spec section 18. Gated behind DEMO_MODE_ENABLED + DEMO_MODE_SECRET
// on top of normal team auth, and must never be reachable on the public event build
// (set DEMO_MODE_ENABLED=false for the deployed instance).
function requireDemoMode(req, res, next) {
  if (process.env.DEMO_MODE_ENABLED !== 'true') {
    return res.status(404).end(); // behaves as if the route doesn't exist
  }
  const secret = req.headers['x-demo-secret'];
  if (!secret || secret !== process.env.DEMO_MODE_SECRET) {
    return res.status(401).json({ error: 'Invalid demo credentials.' });
  }
  next();
}

demoRouter.use(requireDemoMode, requireTeamAuth);

function parse(json) {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}

// Jump straight to a given level index, always going through the same init() every
// real level transition uses -- so the jumped-to level has valid state and won't
// crash on the first real action, exactly like reaching it by playing.
function jumpToLevel(session, index) {
  const memory = parse(session.agent_memory);
  const behaviourFlags = parse(session.behaviour_flags);
  const levelStates = parse(session.level_states);
  const level = LEVEL_BY_INDEX[index];
  levelStates[level.key] = level.init(session, { memory, behaviourFlags });
  // Mirror applyAction(): the real clock starts once we leave the tutorial, however
  // that happens (real play or a demo skip) — never leave it permanently paused.
  const startedAt = index > 0 && !session.started_at ? new Date().toISOString().replace('Z', '') : session.started_at;
  db.prepare(
    `UPDATE game_sessions SET current_level = ?, status = ?, level_states = ?, agent_memory = ?, behaviour_flags = ?, started_at = ? WHERE id = ?`
  ).run(index, index === 0 ? 'tutorial' : 'active', JSON.stringify(levelStates), JSON.stringify(memory), JSON.stringify(behaviourFlags), startedAt, session.id);
  db.prepare(`INSERT OR IGNORE INTO level_results (id, session_id, level) VALUES (lower(hex(randomblob(8))), ?, ?)`).run(session.id, index);
}

demoRouter.post('/skip-level', (req, res) => {
  const session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session.' });
  const nextIndex = Math.min(session.current_level + 1, MAIN_LEVEL_COUNT);
  jumpToLevel(session, nextIndex);
  logAudit('demo', 'skip_level', { teamId: req.team.id, to: nextIndex });
  res.json(getClientState(getSessionByTeam(req.team.id)));
});

demoRouter.post('/set-lives', (req, res) => {
  const { lives } = req.body || {};
  const session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session.' });
  const newLives = Math.max(0, Number(lives) || 0);
  // Mirror the real engine: hitting zero lives puts the session in critical state,
  // exactly like a normal life-losing action would -- so recovery can be tested for real.
  const nextStatus = newLives <= 0 ? 'critical' : session.current_level === 0 ? 'tutorial' : 'active';
  db.prepare('UPDATE game_sessions SET lives = ?, status = ? WHERE id = ?').run(newLives, nextStatus, session.id);
  logAudit('demo', 'set_lives', { teamId: req.team.id, lives: newLives });
  res.json(getClientState(getSessionByTeam(req.team.id)));
});

demoRouter.post('/skip-to-final', (req, res) => {
  const session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session.' });
  jumpToLevel(session, MAIN_LEVEL_COUNT);
  logAudit('demo', 'skip_to_final', { teamId: req.team.id });
  res.json(getClientState(getSessionByTeam(req.team.id)));
});

demoRouter.post('/reset', (req, res) => {
  db.prepare('DELETE FROM level_results WHERE session_id IN (SELECT id FROM game_sessions WHERE team_id = ?)').run(req.team.id);
  db.prepare('DELETE FROM game_sessions WHERE team_id = ?').run(req.team.id);
  logAudit('demo', 'reset', { teamId: req.team.id });
  res.json({ ok: true });
});
