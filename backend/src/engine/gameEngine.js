import { dbGet, dbAll, dbRun, getClient, getConfig, logAudit } from '../db/index.js';
import { nanoid } from 'nanoid';
import { LEVEL_BY_INDEX, MAIN_LEVEL_COUNT } from './levels.js';
import { remainingSeconds, isExpired, isRecoveryExpired, finalRemainingSeconds, finalRemainingMs, finalElapsedMs } from './timer.js';
import { generateRecoveryPuzzle, validateRecoveryAnswer } from './recoveryPuzzle.js';
import { agentChat } from './agentEngine.js';
import { recordActionObservation, recordChatObservation, finalizeProfile, buildFinalReveal } from './behaviourProfile.js';

const MAX_RECOVERIES  = async () => Number((await getConfig('max_recoveries')) ?? 3);
const INITIAL_LIVES   = async () => Number((await getConfig('initial_lives'))   ?? 5);
const RECOVERY_WINDOW = async () => Number((await getConfig('recovery_window_seconds')) ?? 30);
const MAX_HINTS_PER_LEVEL = 2;

// ---------------------------------------------------------------------------
// SCORING — identical logic to original, now fully async
// ---------------------------------------------------------------------------
const LEVEL_PROGRESSION_POINTS = { 1: 1000, 2: 2000, 3: 3000, 4: 4000, 5: 5000 };
const LIFE_BONUS_PER_LIFE = 250;
const RECOVERY_PENALTY_PER_ATTEMPT = 500;
const TIME_SCORE_MAX = 5000;
const EFFICIENCY_BASE = 2000;
const EFFICIENCY_PENALTY_PER_UNNECESSARY_ACTION = 50;
const PRECISION_SCALE = 1000;

async function scoreComponents(session, { includeTimeBonus }) {
  const perLevelScore = {};
  for (let l = 1; l <= 5; l++) perLevelScore[l] = 0;

  const rows = await dbAll(
    `SELECT level FROM level_results WHERE session_id = $1 AND completed = 1 AND level BETWEEN 1 AND 5`,
    [session.id]
  );
  let progression = 0;
  for (const r of rows) {
    const pts = LEVEL_PROGRESSION_POINTS[r.level] || 0;
    perLevelScore[r.level] = pts;
    progression += pts;
  }

  const lifeScore = Math.max(0, session.lives) * LIFE_BONUS_PER_LIFE;
  const recoveryPenalty = (session.recovery_attempts || 0) * RECOVERY_PENALTY_PER_ATTEMPT;
  const unnecessaryActions = unnecessaryActionCount(session);
  const efficiency = Math.max(0, EFFICIENCY_BASE - unnecessaryActions * EFFICIENCY_PENALTY_PER_UNNECESSARY_ACTION);

  let timeScore = 0;
  if (includeTimeBonus) {
    const totalMs = (session.game_duration_seconds || 1) * 1000;
    const remainingMs = session.completed_at
      ? finalRemainingMs(session)
      : Math.max(0, remainingSeconds(session) * 1000);
    timeScore = Math.floor((remainingMs / totalMs) * TIME_SCORE_MAX);
  }

  const baseScore = progression + lifeScore + timeScore + efficiency - recoveryPenalty;
  const precision = Math.floor(finalElapsedMs(session)) % PRECISION_SCALE;
  const finalScore = Math.max(0, baseScore * PRECISION_SCALE + precision);

  return { perLevelScore, progressionScore: progression, lifeScore, recoveryPenalty, timeBonus: timeScore, efficiencyScore: efficiency, precision, baseScore, finalScore };
}

async function calculateScore(session, opts) {
  return (await scoreComponents(session, opts)).finalScore;
}

export async function calculateFinalScore(session) {
  return calculateScore(session, { includeTimeBonus: session.status === 'completed' });
}

export async function getScoreBreakdown(session) {
  return scoreComponents(session, { includeTimeBonus: session.status === 'completed' });
}

function unnecessaryActionCount(session) {
  const bf = parseJson(session.behaviour_flags);
  const actionCounts = bf.actionCounts || {};
  return Object.values(actionCounts).reduce((sum, n) => sum + Math.max(0, n - 1), 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'disqualified']);

function parseJson(val) {
  if (val === null || val === undefined) return {};
  if (typeof val === 'object') return val; // pg JSONB auto-parses
  try { return JSON.parse(val); } catch { return {}; }
}

function toJsonStr(val) {
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

async function saveSession(session) {
  await dbRun(
    `UPDATE game_sessions SET
      status                  = $1,
      started_at              = $2,
      completed_at            = $3,
      current_level           = $4,
      lives                   = $5,
      max_lives_gained        = $6,
      score                   = $7,
      recovery_attempts       = $8,
      recovery_successes      = $9,
      behaviour_flags         = $10,
      agent_memory            = $11,
      level_states            = $12,
      time_paused_seconds     = $13,
      paused_at               = $14,
      recovery_started_at     = $15,
      focus_violations        = $16,
      security_warnings       = $17,
      security_life_penalties = $18,
      last_violation_at       = $19,
      last_violation_reason   = $20
    WHERE id = $21`,
    [
      session.status,
      session.started_at        || null,
      session.completed_at      || null,
      session.current_level,
      session.lives,
      session.max_lives_gained  || 0,
      session.score,
      session.recovery_attempts,
      session.recovery_successes,
      toJsonStr(session.behaviour_flags),
      toJsonStr(session.agent_memory),
      toJsonStr(session.level_states),
      session.time_paused_seconds || 0,
      session.paused_at         || null,
      session.recovery_started_at || null,
      session.focus_violations  || 0,
      session.security_warnings || 0,
      session.security_life_penalties || 0,
      session.last_violation_at || null,
      session.last_violation_reason || null,
      session.id,
    ]
  );
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export async function getSessionByTeam(teamId) {
  return dbGet('SELECT * FROM game_sessions WHERE team_id = $1', [teamId]);
}

export async function getSessionById(id) {
  return dbGet('SELECT * FROM game_sessions WHERE id = $1', [id]);
}

export async function createSession(teamId) {
  const existing = await getSessionByTeam(teamId);
  if (existing) return existing;

  const gameSeed = nanoid(10);
  const duration = Number((await getConfig('game_duration_seconds')) ?? 900);
  const lives    = await INITIAL_LIVES();

  const res = await dbRun(
    `INSERT INTO game_sessions
     (team_id, game_seed, status, game_duration_seconds, current_level, lives)
     VALUES ($1, $2, 'not_started', $3, 0, $4)
     ON CONFLICT (team_id) DO NOTHING
     RETURNING id`,
    [teamId, gameSeed, duration, lives]
  );

  if (res.rows.length > 0) {
    await logAudit(teamId, 'session_created', { sessionId: res.rows[0].id });
  }
  return getSessionByTeam(teamId);
}

export async function finalizeRun(session, finalStatus) {
  if (TERMINAL_STATUSES.has(session.status) && session.completed_at) return session;
  
  if (session.status === 'active' && session.paused_at && !TERMINAL_STATUSES.has(session.status)) {
    const pAt = session.paused_at instanceof Date ? session.paused_at : new Date(session.paused_at + (session.paused_at.endsWith('Z') ? '' : 'Z'));
    const start = pAt.getTime();
    const elapsed = Math.floor((Date.now() - start) / 1000);
    session.time_paused_seconds = (session.time_paused_seconds || 0) + elapsed;
    session.paused_at = null;
  }
  
  session.status = finalStatus;
  if (!session.completed_at) {
    session.completed_at = new Date().toISOString();
  }
  session.score = await calculateScore(session, { includeTimeBonus: finalStatus === 'completed' });
  await saveSession(session);
  await logAudit(session.team_id, finalStatus === 'completed' ? 'game_completed' : 'game_failed', {
    score: session.score,
    level: session.current_level,
  });
  return session;
}

export async function reconcileTimerExpiry(session) {
  if (isExpired(session) && !TERMINAL_STATUSES.has(session.status)) {
    await finalizeRun(session, 'failed');
  }
  return session;
}

// ---------------------------------------------------------------------------
// Client state (sent to frontend on every game route response)
// ---------------------------------------------------------------------------

export async function getClientState(session) {
  const level        = LEVEL_BY_INDEX[session.current_level];
  const levelStates  = parseJson(session.level_states);
  const behaviourFlags = parseJson(session.behaviour_flags);
  const memory       = parseJson(session.agent_memory);
  const remaining    = TERMINAL_STATUSES.has(session.status) ? finalRemainingSeconds(session) : remainingSeconds(session);
  const hintsUsed    = (behaviourFlags.hintsUsedByLevel || {})[session.current_level] || 0;

  const maxRec  = await MAX_RECOVERIES();
  const initLiv = await INITIAL_LIVES();
  const recWin  = await RECOVERY_WINDOW();

  let recovery = null;
  if (session.status === 'recovering' && session.recovery_started_at) {
    const ts = typeof session.recovery_started_at === 'string'
      ? new Date(session.recovery_started_at.endsWith('Z') ? session.recovery_started_at : session.recovery_started_at + 'Z')
      : new Date(session.recovery_started_at);
    const elapsed = Math.floor((Date.now() - ts.getTime()) / 1000);
    recovery = { secondsRemaining: Math.max(0, recWin - elapsed) };
  }

  const secureEnabled  = (await getConfig('secure_mode_enabled'))  !== 'false';
  const fsRequired     = (await getConfig('fullscreen_required'))  !== 'false';

  return {
    status: session.status,
    isTransition: session.status === 'paused' && session.paused_at === null,
    currentLevel: session.current_level,
    levelName: level?.name ?? null,
    levelDifficulty: level?.difficulty ?? null,
    lives: session.lives,
    initialLives: initLiv,
    maxLives: initLiv + maxRec,
    score: session.score,
    recoveryAttemptsUsed: session.recovery_attempts,
    recoverySuccesses: session.recovery_successes,
    recoveriesRemaining: maxRec - session.recovery_attempts,
    recovery,
    secureMode: { enabled: secureEnabled, fullscreenRequired: fsRequired },
    focusViolations: session.focus_violations || 0,
    securityWarnings: session.security_warnings || 0,
    securityLifePenalties: session.security_life_penalties || 0,
    timeRemainingSeconds: remaining,
    gameDurationSeconds: session.game_duration_seconds,
    hintsUsed,
    hintsRemaining: Math.max(0, MAX_HINTS_PER_LEVEL - hintsUsed),
    level:
      session.status === 'active' || session.status === 'tutorial'
        ? level?.describe(levelStates[level.key], memory, behaviourFlags)
        : null,
    finalReveal: session.status === 'completed' ? buildFinalReveal(behaviourFlags) : null,
  };
}

// ---------------------------------------------------------------------------
// Start session
// ---------------------------------------------------------------------------

export async function startSession(session) {
  if (session.status !== 'not_started') return session;
  session.status = 'tutorial';

  const levelStates    = parseJson(session.level_states);
  const memory         = parseJson(session.agent_memory);
  const behaviourFlags = parseJson(session.behaviour_flags);
  levelStates.tutorial = LEVEL_BY_INDEX[0].init(session, { memory, behaviourFlags });

  session.level_states  = JSON.stringify(levelStates);
  session.agent_memory  = JSON.stringify(memory);

  await dbRun(
    `INSERT INTO level_results (session_id, level) VALUES ($1, 0)`,
    [session.id]
  );
  await saveSession(session);
  await logAudit(session.team_id, 'session_started', {});
  return session;
}

// ---------------------------------------------------------------------------
// Apply action — the main game loop handler
// Wrapped in a PostgreSQL transaction for concurrency safety.
// ---------------------------------------------------------------------------

export async function applyAction(session, action, payload) {
  const isTransition = session.status === 'paused' && session.paused_at === null;

  if (session.status === 'paused' && !isTransition) return { error: 'Session is paused by admin.' };

  if (action === 'ENTER_SECTOR') {
    if (!isTransition) {
      return { error: 'Not in transition state.', clientState: await getClientState(session) };
    }
    const client = await getClient();
    try {
      await client.query('BEGIN');
      session.status = 'active';
      session.paused_at = new Date().toISOString();
      await client.query(
        `UPDATE game_sessions SET status = $1, paused_at = $2 WHERE id = $3`,
        [session.status, session.paused_at, session.id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return {
      result: { ok: true, message: 'Sector active.' },
      lifeLost: false,
      levelCompleted: false,
      advancedToLevel: null,
      clientState: await getClientState(session),
    };
  }

  if (isTransition) {
    return { error: 'Must enter sector first.', clientState: await getClientState(session) };
  }

  if (isExpired(session)) {
    await reconcileTimerExpiry(session);
    return { error: 'TIME_UP', clientState: await getClientState(session) };
  }
  if (['completed', 'failed', 'disqualified'].includes(session.status)) {
    return { error: `Session already ${session.status}.` };
  }
  if (session.status === 'critical') {
    return { error: 'Session is in critical state — resolve the recovery puzzle first.' };
  }

  const level          = LEVEL_BY_INDEX[session.current_level];
  const levelStates    = parseJson(session.level_states);
  const behaviourFlags = parseJson(session.behaviour_flags);
  const memory         = parseJson(session.agent_memory);

  behaviourFlags.actionCounts = behaviourFlags.actionCounts || {};
  behaviourFlags.actionCounts[action] = (behaviourFlags.actionCounts[action] || 0) + 1;

  const outcome = level.act(session, levelStates[level.key], action, payload, { behaviourFlags, memory });

  recordActionObservation(behaviourFlags, level.index, action, payload, outcome);

  levelStates[level.key]     = outcome.levelState;
  session.level_states       = JSON.stringify(levelStates);
  session.behaviour_flags    = JSON.stringify(behaviourFlags);
  session.agent_memory       = JSON.stringify(memory);

  // Use a transaction for the multi-step update
  const client = await getClient();
  let lifeLostThisTurn = false;
  let advanced = false;

  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE level_results SET attempts = attempts + 1, failures = failures + $1
       WHERE session_id = $2 AND level = $3`,
      [outcome.lifeLost ? 1 : 0, session.id, level.index]
    );

    if (outcome.lifeLost && level.costsLife) {
      session.lives -= 1;
      lifeLostThisTurn = true;
      await logAudit(session.team_id, 'life_lost', { level: level.index, lives: session.lives });
    }

    const maxRec = await MAX_RECOVERIES();
    const initLiv = await INITIAL_LIVES();

    if (outcome.completed) {
      const levelPoints = LEVEL_PROGRESSION_POINTS[level.index] || 0;
      await client.query(
        `UPDATE level_results SET completed = 1, completed_at = NOW(), score = $1
         WHERE session_id = $2 AND level = $3`,
        [levelPoints, session.id, level.index]
      );

      if (level.index >= MAIN_LEVEL_COUNT) {
        await client.query('COMMIT');
        client.release();
        await finalizeRun(session, 'completed');
        return {
          result: outcome.result,
          lifeLost: lifeLostThisTurn,
          levelCompleted: true,
          advancedToLevel: null,
          clientState: await getClientState(session),
        };
      } else {
        const nextIndex = level.index + 1;
        session.current_level = nextIndex;
        session.status = 'paused'; // Transition state

        if (session.paused_at) {
          const pAt = session.paused_at instanceof Date ? session.paused_at : new Date(session.paused_at + (session.paused_at.endsWith('Z') ? '' : 'Z'));
          const start = pAt.getTime();
          const elapsed = Math.floor((Date.now() - start) / 1000);
          session.time_paused_seconds = (session.time_paused_seconds || 0) + elapsed;
          session.paused_at = null;
        }

        if (level.index === 0 && !session.started_at) {
          session.started_at = new Date().toISOString();
        }
        if (level.index === 3) {
          finalizeProfile(behaviourFlags);
          session.behaviour_flags = JSON.stringify(behaviourFlags);
        }

        const nextLevel = LEVEL_BY_INDEX[nextIndex];
        levelStates[nextLevel.key] = nextLevel.init(session, { memory, behaviourFlags });
        session.level_states    = JSON.stringify(levelStates);
        session.behaviour_flags = JSON.stringify(behaviourFlags);
        session.agent_memory    = JSON.stringify(memory);

        await client.query(
          `INSERT INTO level_results (session_id, level) VALUES ($1, $2)`,
          [session.id, nextIndex]
        );
        advanced = true;
      }
    }

    if (session.lives <= 0 && session.status !== 'completed') {
      session.status = 'critical';
      await logAudit(session.team_id, 'entered_critical', {});
    }

    if (!['completed', 'failed'].includes(session.status)) {
      session.score = await calculateScore(session, { includeTimeBonus: false });
    }

    // Save session within the transaction
    await client.query(
      `UPDATE game_sessions SET
        status=$1, started_at=$2, completed_at=$3, current_level=$4, lives=$5,
        max_lives_gained=$6, score=$7, recovery_attempts=$8, recovery_successes=$9,
        behaviour_flags=$10, agent_memory=$11, level_states=$12,
        time_paused_seconds=$13, paused_at=$14, recovery_started_at=$15,
        focus_violations=$16, security_warnings=$17, security_life_penalties=$18,
        last_violation_at=$19, last_violation_reason=$20
       WHERE id=$21`,
      [
        session.status, session.started_at || null, session.completed_at || null,
        session.current_level, session.lives, session.max_lives_gained || 0,
        session.score, session.recovery_attempts, session.recovery_successes,
        toJsonStr(session.behaviour_flags), toJsonStr(session.agent_memory),
        toJsonStr(session.level_states), session.time_paused_seconds || 0,
        session.paused_at || null, session.recovery_started_at || null,
        session.focus_violations || 0, session.security_warnings || 0,
        session.security_life_penalties || 0, session.last_violation_at || null,
        session.last_violation_reason || null, session.id,
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    result: outcome.result,
    lifeLost: lifeLostThisTurn,
    levelCompleted: outcome.completed,
    advancedToLevel: advanced ? session.current_level : null,
    clientState: await getClientState(session),
  };
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export async function reconcileRecoveryDeadline(session) {
  if (session.status !== 'recovering') return session;
  const recWin = await RECOVERY_WINDOW();
  if (isRecoveryExpired(session, recWin)) {
    session.recovery_attempts += 1;
    session.recovery_started_at = null;
    const maxRec = await MAX_RECOVERIES();
    if (session.recovery_attempts >= maxRec) {
      await logAudit(session.team_id, 'recovery_timeout', { attempts: session.recovery_attempts });
      await finalizeRun(session, 'failed');
    } else {
      session.status = 'critical';
      await logAudit(session.team_id, 'recovery_timeout', { attempts: session.recovery_attempts });
      await saveSession(session);
    }
  }
  return session;
}

export async function requestRecovery(session) {
  const recWin = await RECOVERY_WINDOW();
  if (session.status === 'recovering' && session.recovery_started_at) {
    const puzzle = generateRecoveryPuzzle(session);
    const { _answer, ...safePuzzle } = puzzle;
    const ts = typeof session.recovery_started_at === 'string'
      ? new Date(session.recovery_started_at.endsWith('Z') ? session.recovery_started_at : session.recovery_started_at + 'Z')
      : new Date(session.recovery_started_at);
    const elapsed = Math.floor((Date.now() - ts.getTime()) / 1000);
    return { puzzle: { ...safePuzzle, windowSeconds: Math.max(0, recWin - elapsed) } };
  }
  if (session.status !== 'critical') return { error: 'Not in critical state.' };

  const maxRec = await MAX_RECOVERIES();
  if (session.recovery_attempts >= maxRec) {
    await finalizeRun(session, 'failed');
    return { error: 'No recovery attempts remaining.', clientState: await getClientState(session) };
  }

  session.status = 'recovering';
  session.recovery_started_at = new Date().toISOString();
  await saveSession(session);

  const puzzle = generateRecoveryPuzzle(session);
  const { _answer, ...safePuzzle } = puzzle;
  return { puzzle: { ...safePuzzle, windowSeconds: recWin } };
}

export async function submitRecoveryAnswer(session, answer) {
  if (session.status !== 'recovering') return { error: 'No recovery in progress.' };

  const recWin = await RECOVERY_WINDOW();
  const expired = isRecoveryExpired(session, recWin);
  const correct = !expired && validateRecoveryAnswer(session, answer);

  session.recovery_attempts += 1;
  session.recovery_started_at = null;

  const maxRec  = await MAX_RECOVERIES();
  const initLiv = await INITIAL_LIVES();

  if (correct) {
    session.lives = Math.min(session.lives + 1, initLiv + maxRec);
    session.recovery_successes += 1;
    session.status = 'active';
    session.score  = await calculateScore(session, { includeTimeBonus: false });
    await logAudit(session.team_id, 'recovery_success', { lives: session.lives });
  } else {
    if (session.recovery_attempts >= maxRec) {
      await logAudit(session.team_id, 'recovery_exhausted', { expired });
      await finalizeRun(session, 'failed');
    } else {
      session.status = 'critical';
      session.score  = await calculateScore(session, { includeTimeBonus: false });
      await logAudit(session.team_id, 'recovery_failed', { expired, attemptsLeft: maxRec - session.recovery_attempts });
    }
  }

  await saveSession(session);
  return { correct, expired, clientState: await getClientState(session) };
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
const CHAT_LOG_LIMIT   = 12;
const AGENT_FACTS_LIMIT = 5;

function buildChatContext(session, levelStates, behaviourFlags, memory, target, extra) {
  const level = LEVEL_BY_INDEX[session.current_level];
  const base = {
    level: session.current_level,
    levelName: level.name,
    playerBehaviour: {
      leftChoices:       behaviourFlags.leftChoices       || 0,
      rightChoices:      behaviourFlags.rightChoices      || 0,
      agentTrustCount:   behaviourFlags.agentTrustCount   || 0,
      chatCountByLevel:  behaviourFlags.chatCountByLevel  || {},
      actionCounts:      behaviourFlags.actionCounts      || {},
    },
    agentState: null,
  };

  const ls        = levelStates[level.key] || {};
  const agentFacts = memory.agentFacts || {};

  if (level.index === 3) {
    const speaker = target === 'B' ? 'B' : 'A';
    base.agentState = {
      id: speaker,
      selfInterested: ls.selfInterested === speaker,
      cooperative: !!ls.cooperative?.[speaker],
      facts: (agentFacts[`3:${speaker}`] || []).slice(-AGENT_FACTS_LIMIT),
    };
  } else if (level.index === 4) {
    base.agentState = { id: 'GUIDE', totalChats: extra?.totalChats || 0 };
  } else if (level.index === 5) {
    base.agentState = {
      id: 'ZERO',
      trustLevel:   ls.trustLevel   || 0,
      state:        ls.agentState   || 'UNCERTAIN',
      codeProvided: ls.codeProvided || false,
      knowsCore:    ls.knowsCore    || false,
      planAccepted: ls.planAccepted || false,
    };
  }
  return base;
}

function intentToAction(level, intent, playerMessage, target) {
  if (level === 3) {
    if (intent === 'REVEAL_CLAIM') return { action: target === 'B' ? 'ASK_B' : 'ASK_A' };
    if (intent === 'REASSURE')     return { action: target === 'B' ? 'REASSURE_B' : 'REASSURE_A' };
    return null;
  }
  if (level === 5) {
    if (intent === 'PRIORITIZE_ESCAPE') return { action: 'INSTRUCT_PRIORITIZE_ESCAPE', payload: {} };
    if (intent === 'NEGOTIATE')         return { action: 'NEGOTIATE', payload: {} };
    if (intent === 'DEMAND_EXIT')       return { action: 'INSTRUCT_OPEN_EXIT_DIRECTLY', payload: {} };
    if (intent === 'QUESTION_OBJECTIVE')return { action: 'ASK_OBJECTIVE', payload: {} };
    if (intent === 'ASK_PROTECTING')    return { action: 'ASK_PROTECTING', payload: {} };
    if (intent === 'PROPOSE_PLAN')      return { action: 'PROPOSE_PLAN', payload: {} };
    if (intent === 'PROVIDE_CODE') {
      const match = playerMessage.match(/\b(\d{3})\b/);
      if (match) return { action: 'PROVIDE_ACCESS_CODE', payload: { code: match[1] } };
    }
    return null;
  }
  return null;
}

const ENGINE_RESOLVED_DIALOGUE = ['REVEAL_CLAIM', 'REASSURE', 'QUESTION_OBJECTIVE', 'ASK_PROTECTING', 'PROPOSE_PLAN'];

export async function chat(session, message, target) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { error: 'A message is required.' };
  }
  if (!['tutorial', 'active'].includes(session.status)) {
    return { error: `Chat is unavailable while the session is ${session.status}.` };
  }

  const levelStates    = parseJson(session.level_states);
  const behaviourFlags = parseJson(session.behaviour_flags);
  const memory         = parseJson(session.agent_memory);
  memory.agentFacts    = memory.agentFacts || {};

  const level          = LEVEL_BY_INDEX[session.current_level];
  const trimmedMessage = message.trim().slice(0, 300);
  const speaker        = level.index === 3 ? (target === 'B' ? 'B' : 'A') : null;
  const factKey        = level.index === 3 ? `3:${speaker}` : `${level.index}:default`;

  behaviourFlags.chatCountByLevel = behaviourFlags.chatCountByLevel || {};
  behaviourFlags.chatCountByLevel[level.index] = (behaviourFlags.chatCountByLevel[level.index] || 0) + 1;
  behaviourFlags.agentTrustCount = (behaviourFlags.agentTrustCount || 0) + 1;
  const totalChats = Object.values(behaviourFlags.chatCountByLevel).reduce((a, b) => a + b, 0);

  recordChatObservation(behaviourFlags, level.index, trimmedMessage);

  const context = buildChatContext(session, levelStates, behaviourFlags, memory, target, { totalChats });
  let response  = await agentChat(context, trimmedMessage);

  const mapped = intentToAction(level.index, response.intent, trimmedMessage, target);
  if (mapped) {
    const ls      = levelStates[level.key];
    const outcome = level.act(session, ls, mapped.action, mapped.payload || {}, { behaviourFlags, memory });
    levelStates[level.key] = outcome.levelState;
    if (ENGINE_RESOLVED_DIALOGUE.includes(response.intent)) {
      response = { ...response, dialogue: outcome.result.agentLine || outcome.result.message };
    }
  }

  if (response.memoryUpdates?.length) {
    memory.agentFacts[factKey] = [...(memory.agentFacts[factKey] || []), ...response.memoryUpdates].slice(-AGENT_FACTS_LIMIT);
  }
  if (response.relationshipUpdate) {
    memory.agentRelationship = memory.agentRelationship || {};
    const current = memory.agentRelationship[factKey] || 0;
    memory.agentRelationship[factKey] = Math.max(-5, Math.min(5, current + response.relationshipUpdate.trustDelta));
  }

  if (!response.dialogue) response = { ...response, dialogue: 'Processing...' };

  memory.chatLog = memory.chatLog || [];
  memory.chatLog.push({ level: session.current_level, player: trimmedMessage, agent: response.dialogue, at: Date.now() });
  if (memory.chatLog.length > CHAT_LOG_LIMIT) memory.chatLog = memory.chatLog.slice(-CHAT_LOG_LIMIT);

  session.level_states    = JSON.stringify(levelStates);
  session.behaviour_flags = JSON.stringify(behaviourFlags);
  session.agent_memory    = JSON.stringify(memory);

  await dbRun(
    `UPDATE game_sessions SET level_states = $1, behaviour_flags = $2, agent_memory = $3 WHERE id = $4`,
    [toJsonStr(levelStates), toJsonStr(behaviourFlags), toJsonStr(memory), session.id]
  );
  await logAudit(session.team_id, 'chat', { level: session.current_level, source: response.source, intent: response.intent });

  return { dialogue: response.dialogue, source: response.source, clientState: await getClientState(session) };
}

// ---------------------------------------------------------------------------
// Hints
// ---------------------------------------------------------------------------
const HINTS_BY_LEVEL = {
  1: ["The agent's advice depends on something you're carrying, not just where you go.", 'Collect the key before you open the blue door.'],
  2: ["The agent warned you not to touch something for a reason.", 'Press the button, then read each object\u2019s description again — one of them will have changed.'],
  3: ['Ask either agent directly which route is safe — both are truthful about that part.', 'One agent wants something for themselves. Tell them they will escape too.'],
  4: ['Inspect all three objects before deciding — read what each one says closely.', 'One of the descriptions sounds alive. The other two sound like dead ends.'],
  5: ['Ask Agent Zero what it is protecting, specifically.', 'Once you know what it protects, propose a plan that keeps that safe too.'],
};

export async function requestHint(session) {
  if (session.status !== 'active') {
    return { error: `Hints are unavailable while the session is ${session.status}.` };
  }
  const level = LEVEL_BY_INDEX[session.current_level];
  const hints = HINTS_BY_LEVEL[level.index];
  if (!hints) return { error: 'No hints available for this level.' };

  const behaviourFlags = parseJson(session.behaviour_flags);
  behaviourFlags.hintsUsedByLevel = behaviourFlags.hintsUsedByLevel || {};
  const used = behaviourFlags.hintsUsedByLevel[level.index] || 0;

  if (used >= MAX_HINTS_PER_LEVEL) return { error: 'No hints remaining for this level.' };

  const nextUsed = used + 1;
  behaviourFlags.hintsUsedByLevel[level.index] = nextUsed;
  session.behaviour_flags = JSON.stringify(behaviourFlags);

  let lifeLostThisTurn = false;
  if (nextUsed === MAX_HINTS_PER_LEVEL) {
    session.lives -= 1;
    lifeLostThisTurn = true;
    await logAudit(session.team_id, 'hint_life_lost', { level: level.index, lives: session.lives });
    if (session.lives <= 0) {
      session.status = 'critical';
      await logAudit(session.team_id, 'entered_critical', { via: 'hint' });
    }
  }

  await dbRun(
    `UPDATE game_sessions SET behaviour_flags = $1, lives = $2, status = $3 WHERE id = $4`,
    [toJsonStr(behaviourFlags), session.lives, session.status, session.id]
  );
  await logAudit(session.team_id, 'hint_used', { level: level.index, hintNumber: nextUsed });

  return { hint: hints[nextUsed - 1], hintNumber: nextUsed, lifeLost: lifeLostThisTurn, clientState: await getClientState(session) };
}

// ---------------------------------------------------------------------------
// Security violations (anti-cheat)
// ---------------------------------------------------------------------------
const VALID_VIOLATION_REASONS = new Set(['visibility_hidden', 'fullscreen_exit', 'window_blur']);

export async function reportSecurityViolation(session, reason) {
  const safeReason = VALID_VIOLATION_REASONS.has(reason) ? reason : 'window_blur';

  if ((await getConfig('secure_mode_enabled')) === 'false') {
    return { ignored: true, reason: 'secure_mode_disabled', clientState: await getClientState(session) };
  }
  if (!['tutorial', 'active', 'critical', 'recovering'].includes(session.status)) {
    return { ignored: true, reason: 'session_not_active', clientState: await getClientState(session) };
  }

  const cooldownSeconds = Number((await getConfig('violation_cooldown_seconds')) ?? 2);
  if (session.last_violation_at) {
    const lastTs = typeof session.last_violation_at === 'string'
      ? new Date(session.last_violation_at.endsWith('Z') ? session.last_violation_at : session.last_violation_at + 'Z')
      : new Date(session.last_violation_at);
    const sinceLast = (Date.now() - lastTs.getTime()) / 1000;
    if (sinceLast < cooldownSeconds) {
      return {
        deduped: true,
        violationNumber: session.focus_violations || 0,
        warning: (session.focus_violations || 0) <= 1,
        lifeLost: false,
        clientState: await getClientState(session),
      };
    }
  }

  session.focus_violations     = (session.focus_violations     || 0) + 1;
  session.last_violation_at    = new Date().toISOString();
  session.last_violation_reason = safeReason;

  const violationNumber = session.focus_violations;
  const isWarningOnly   = violationNumber === 1;
  let lifeLost = false;

  if (isWarningOnly) {
    session.security_warnings = (session.security_warnings || 0) + 1;
  } else if (session.lives > 0) {
    session.lives -= 1;
    session.security_life_penalties = (session.security_life_penalties || 0) + 1;
    lifeLost = true;
    if (session.lives <= 0 && session.status !== 'completed') {
      session.status = 'critical';
      await logAudit(session.team_id, 'entered_critical', { via: 'security_violation' });
    }
  }

  await dbRun(
    `INSERT INTO security_events (session_id, team_id, type, reason, penalty_applied)
     VALUES ($1, $2, $3, $4, $5)`,
    [session.id, session.team_id, isWarningOnly ? 'warning' : 'life_penalty', safeReason, lifeLost ? 1 : 0]
  );

  if (!['completed', 'failed'].includes(session.status)) {
    session.score = await calculateScore(session, { includeTimeBonus: false });
  }

  await saveSession(session);
  await logAudit(session.team_id, 'security_violation', { violationNumber, reason: safeReason, lifeLost });

  return { violationNumber, warning: isWarningOnly, lifeLost, clientState: await getClientState(session) };
}
