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
} from '../engine/gameEngine.js';

export const gameRouter = Router();
gameRouter.use(requireTeamAuth);

// Anti-cheat: rate-limit action submissions per team (spec section 23).
const actionLimiter = rateLimit({
  windowMs: 5000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.team.id,
  message: { error: 'Too many actions — slow down.' },
});

// Chat is a side-channel (dialogue only, never touches state) so it can afford a
// looser limit than structured actions — still capped to prevent API-cost abuse.
const chatLimiter = rateLimit({
  windowMs: 10000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.team.id,
  message: { error: 'Slow down a little before talking to the agent again.' },
});

function expireIfNeeded(session) {
  reconcileTimerExpiry(session);
  return reconcileRecoveryDeadline(session);
}

// GET /api/game/state — also how a browser refresh restores the session (spec section 21).
gameRouter.get('/state', (req, res) => {
  let session = getSessionByTeam(req.team.id);
  if (!session) session = createSession(req.team.id);
  session = expireIfNeeded(session);
  res.json(getClientState(session));
});

gameRouter.post('/start', (req, res) => {
  let session = getSessionByTeam(req.team.id) || createSession(req.team.id);
  session = startSession(session);
  res.json(getClientState(session));
});

gameRouter.post('/action', actionLimiter, (req, res) => {
  let session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session. Call /start first.' });
  session = expireIfNeeded(session);

  const { action, payload } = req.body || {};
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ error: 'action is required.' });
  }

  const outcome = applyAction(session, action, payload);
  if (outcome.error) return res.status(409).json(outcome);
  res.json(outcome);
});

gameRouter.post('/recovery/start', actionLimiter, (req, res) => {
  let session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session.' });
  session = expireIfNeeded(session);
  const outcome = requestRecovery(session);
  if (outcome.error) return res.status(409).json(outcome);
  res.json(outcome);
});

gameRouter.post('/recovery/submit', actionLimiter, (req, res) => {
  let session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session.' });
  session = expireIfNeeded(session);
  const { answer } = req.body || {};
  const outcome = submitRecoveryAnswer(session, answer);
  if (outcome.error) return res.status(409).json(outcome);
  res.json(outcome);
});

// Free-text chat with the current level's agent — flavor/personality only.
// Never mutates lives, score, level, or the timer; see gameEngine.chat().
gameRouter.post('/chat', chatLimiter, async (req, res) => {
  let session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session. Call /start first.' });
  session = expireIfNeeded(session);

  const { message, target } = req.body || {};
  try {
    const outcome = await chat(session, message, target);
    if (outcome.error) return res.status(409).json(outcome);
    res.json(outcome);
  } catch (err) {
    console.error('[game/chat] unexpected error:', err);
    res.status(500).json({ error: 'The agent is not responding right now.' });
  }
});

// Up to 2 hints per level, the 2nd costing a life — see gameEngine.requestHint().
gameRouter.post('/hint', actionLimiter, (req, res) => {
  let session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session. Call /start first.' });
  session = expireIfNeeded(session);

  const outcome = requestHint(session);
  if (outcome.error) return res.status(409).json(outcome);
  res.json(outcome);
});

// Secure Game Mode: the client reports an observed browser event (tab hidden,
// window blurred, fullscreen exited) — the server decides everything else
// (dedup, violation number, warning vs life loss). A generous but bounded
// limiter: genuine alt-tabbing during a run shouldn't ever hit this, but it
// stops a malicious client from spamming the endpoint.
const securityLimiter = rateLimit({
  windowMs: 5000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.team.id,
  message: { error: 'Too many security events — slow down.' },
});

gameRouter.post('/security-violation', securityLimiter, (req, res) => {
  let session = getSessionByTeam(req.team.id);
  if (!session) return res.status(400).json({ error: 'No session. Call /start first.' });
  session = expireIfNeeded(session);

  const { reason } = req.body || {};
  const outcome = reportSecurityViolation(session, reason);
  res.json(outcome);
});
