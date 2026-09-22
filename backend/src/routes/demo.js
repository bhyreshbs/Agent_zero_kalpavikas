import { Router } from 'express';
import { dbRun, logAudit } from '../db/index.js';
import { getSessionByTeam, getClientState } from '../engine/gameEngine.js';
import { LEVEL_BY_INDEX, MAIN_LEVEL_COUNT } from '../engine/levels.js';
import { requireTeamAuth } from '../middleware/auth.js';
import { nanoid } from 'nanoid';

export const demoRouter = Router();

function requireDemoMode(req, res, next) {
  if (process.env.DEMO_MODE_ENABLED !== 'true') return res.status(404).end();
  const secret = req.headers['x-demo-secret'];
  if (!secret || secret !== process.env.DEMO_MODE_SECRET) {
    return res.status(401).json({ error: 'Invalid demo credentials.' });
  }
  next();
}

demoRouter.use(requireDemoMode, requireTeamAuth);

function parseJson(val) {
  if (!val) return {};
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return {}; }
}

async function jumpToLevel(session, index) {
  const memory         = parseJson(session.agent_memory);
  const behaviourFlags = parseJson(session.behaviour_flags);
  const levelStates    = parseJson(session.level_states);
  const level          = LEVEL_BY_INDEX[index];
  levelStates[level.key] = level.init(session, { memory, behaviourFlags });

  const startedAt = index > 0 && !session.started_at ? new Date().toISOString() : session.started_at;

  await dbRun(
    `UPDATE game_sessions
     SET current_level = $1, status = $2, level_states = $3,
         agent_memory = $4, behaviour_flags = $5, started_at = $6
     WHERE id = $7`,
    [
      index,
      index === 0 ? 'tutorial' : 'active',
      JSON.stringify(levelStates),
      JSON.stringify(memory),
      JSON.stringify(behaviourFlags),
      startedAt || null,
      session.id,
    ]
  );
  await dbRun(
    `INSERT INTO level_results (session_id, level) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [session.id, index]
  );
}

demoRouter.post('/skip-level', async (req, res) => {
  try {
    const session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session.' });
    const nextIndex = Math.min(session.current_level + 1, MAIN_LEVEL_COUNT);
    await jumpToLevel(session, nextIndex);
    await logAudit('demo', 'skip_level', { teamId: req.team.id, to: nextIndex });
    const fresh = await getSessionByTeam(req.team.id);
    res.json(await getClientState(fresh));
  } catch (err) {
    console.error('[demo/skip-level]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

demoRouter.post('/set-lives', async (req, res) => {
  try {
    const { lives } = req.body || {};
    const session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session.' });
    const newLives   = Math.max(0, Number(lives) || 0);
    const nextStatus = newLives <= 0 ? 'critical' : session.current_level === 0 ? 'tutorial' : 'active';
    await dbRun(
      'UPDATE game_sessions SET lives = $1, status = $2 WHERE id = $3',
      [newLives, nextStatus, session.id]
    );
    await logAudit('demo', 'set_lives', { teamId: req.team.id, lives: newLives });
    const fresh = await getSessionByTeam(req.team.id);
    res.json(await getClientState(fresh));
  } catch (err) {
    console.error('[demo/set-lives]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

demoRouter.post('/skip-to-final', async (req, res) => {
  try {
    const session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session.' });
    await jumpToLevel(session, MAIN_LEVEL_COUNT);
    await logAudit('demo', 'skip_to_final', { teamId: req.team.id });
    const fresh = await getSessionByTeam(req.team.id);
    res.json(await getClientState(fresh));
  } catch (err) {
    console.error('[demo/skip-to-final]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

demoRouter.post('/reset', async (req, res) => {
  try {
    const session = await getSessionByTeam(req.team.id);
    if (session) {
      await dbRun('DELETE FROM level_results WHERE session_id = $1', [session.id]);
      await dbRun('DELETE FROM game_sessions WHERE id = $1', [session.id]);
    }
    await logAudit('demo', 'reset', { teamId: req.team.id });
    res.json({ ok: true });
  } catch (err) {
    console.error('[demo/reset]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
