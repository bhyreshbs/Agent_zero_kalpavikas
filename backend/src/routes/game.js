import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireTeamAuth } from '../middleware/auth.js';
import {
  createSession,
  startSession,
  getSessionByTeam,
  getClientState,
  applyAction,
  requestRecovery,
  submitRecoveryAnswer,
  reconcileRecoveryDeadline,
  reconcileTimerExpiry,
  chat,
  requestHint,
  reportSecurityViolation,
  exitSession,
} from '../engine/gameEngine.js';

export const gameRouter = Router();
gameRouter.use(requireTeamAuth);

const actionLimiter = rateLimit({
  windowMs: 5000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.team.id,
  message: { error: 'Too many actions — slow down.' },
});

const chatLimiter = rateLimit({
  windowMs: 10000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.team.id,
  message: { error: 'Slow down a little before talking to the agent again.' },
});

const securityLimiter = rateLimit({
  windowMs: 5000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.team.id,
  message: { error: 'Too many security events — slow down.' },
});

async function expireIfNeeded(session) {
  await reconcileTimerExpiry(session);
  return reconcileRecoveryDeadline(session);
}

// GET /api/game/state
gameRouter.get('/state', async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id);
    if (!session) session = await createSession(req.team.id);
    session = await expireIfNeeded(session);
    res.json(await getClientState(session));
  } catch (err) {
    console.error('[game/state]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

gameRouter.post('/start', async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id) || await createSession(req.team.id);
    session = await startSession(session);
    res.json(await getClientState(session));
  } catch (err) {
    console.error('[game/start]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

gameRouter.post('/exit', actionLimiter, async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session found.' });
    session = await exitSession(session);
    res.json(await getClientState(session));
  } catch (err) {
    console.error('[game/exit]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

gameRouter.post('/action', actionLimiter, async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session. Call /start first.' });
    session = await expireIfNeeded(session);

    const { action, payload } = req.body || {};
    if (!action || typeof action !== 'string') {
      return res.status(400).json({ error: 'action is required.' });
    }

    const outcome = await applyAction(session, action, payload);
    if (outcome.error) return res.status(409).json(outcome);
    res.json(outcome);
  } catch (err) {
    console.error('[game/action]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

gameRouter.post('/recovery/start', actionLimiter, async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session.' });
    session = await expireIfNeeded(session);
    const outcome = await requestRecovery(session);
    if (outcome.error) return res.status(409).json(outcome);
    res.json(outcome);
  } catch (err) {
    console.error('[game/recovery/start]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

gameRouter.post('/recovery/submit', actionLimiter, async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session.' });
    session = await expireIfNeeded(session);
    const { answer } = req.body || {};
    const outcome = await submitRecoveryAnswer(session, answer);
    if (outcome.error) return res.status(409).json(outcome);
    res.json(outcome);
  } catch (err) {
    console.error('[game/recovery/submit]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

gameRouter.post('/chat', chatLimiter, async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session. Call /start first.' });
    session = await expireIfNeeded(session);

    const { message, target } = req.body || {};
    const outcome = await chat(session, message, target);
    if (outcome.error) return res.status(409).json(outcome);
    res.json(outcome);
  } catch (err) {
    console.error('[game/chat] unexpected error:', err);
    res.status(500).json({ error: 'The agent is not responding right now.' });
  }
});

gameRouter.post('/hint', actionLimiter, async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session. Call /start first.' });
    session = await expireIfNeeded(session);

    const outcome = await requestHint(session);
    if (outcome.error) return res.status(409).json(outcome);
    res.json(outcome);
  } catch (err) {
    console.error('[game/hint]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

gameRouter.post('/security-violation', securityLimiter, async (req, res) => {
  try {
    let session = await getSessionByTeam(req.team.id);
    if (!session) return res.status(400).json({ error: 'No session. Call /start first.' });
    session = await expireIfNeeded(session);

    const { reason } = req.body || {};
    const outcome = await reportSecurityViolation(session, reason);
    res.json(outcome);
  } catch (err) {
    console.error('[game/security-violation]', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
