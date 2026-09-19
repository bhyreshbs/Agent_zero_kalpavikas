import { db, getConfig, logAudit } from '../db/index.js';
import { nanoid } from 'nanoid';
import { LEVEL_BY_INDEX, MAIN_LEVEL_COUNT } from './levels.js';
import { remainingSeconds, isExpired, isRecoveryExpired, finalRemainingSeconds, finalRemainingMs, finalElapsedMs } from './timer.js';
import { generateRecoveryPuzzle, validateRecoveryAnswer } from './recoveryPuzzle.js';
import { agentChat } from './agentEngine.js';
import { recordActionObservation, recordChatObservation, finalizeProfile, buildFinalReveal } from './behaviourProfile.js';

const MAX_RECOVERIES = () => Number(getConfig('max_recoveries') ?? 3);
const INITIAL_LIVES = () => Number(getConfig('initial_lives') ?? 5);
const RECOVERY_WINDOW = () => Number(getConfig('recovery_window_seconds') ?? 30);
const MAX_HINTS_PER_LEVEL = 2;

// ---------------------------------------------------------------------------
// COMPETITIVE SCORING — single authoritative, high-resolution model. Every
// number here comes from server-side state (level_results, lives,
// recovery_attempts, actionCounts, the server clock, all at millisecond
// resolution where it matters) — nothing client-supplied, nothing from
// Gemini, nothing random. `calculateScore` is a pure recompute from that
// state every time it's called, which is what makes it safe to call
// repeatedly: there is no running "add points" accumulator anywhere to
// double-count, and calling it twice on the same final state always returns
// the same number.
//
// The design goal (beyond just "score things"): make exact ties between two
// different teams' runs extremely unlikely, WITHOUT resorting to randomness
// anywhere. Two levers do that: (1) the time component is computed from
// milliseconds, not seconds, so two completions even a fraction of a second
// apart already diverge; (2) a small deterministic "precision" component
// derived from the exact elapsed milliseconds of the run is added on top,
// so even two failed runs with identical progression/lives/recovery/
// efficiency (which second-or-coarser components alone could collide on)
// almost never share a score, since ending at the exact same millisecond is
// astronomically unlikely. See simulateManyRuns in scoring.test.mjs for an
// empirical check across 1,000+ varied simulated runs.
const LEVEL_PROGRESSION_POINTS = { 1: 1000, 2: 2000, 3: 3000, 4: 4000, 5: 5000 };
const LIFE_BONUS_PER_LIFE = 250;
const RECOVERY_PENALTY_PER_ATTEMPT = 500;
const TIME_SCORE_MAX = 5000;
const EFFICIENCY_BASE = 2000;
const EFFICIENCY_PENALTY_PER_UNNECESSARY_ACTION = 50;

// Progression credit is read from level_results.completed, not inferred from
// current_level — a team failing partway through Level 4 gets credit for
// 1-3 (actually completed) and nothing for 4 (not completed), regardless of
// how current_level happens to be tracked.
function progressionScore(session) {
  const rows = db
    .prepare(`SELECT level FROM level_results WHERE session_id = ? AND completed = 1 AND level BETWEEN 1 AND 5`)
    .all(session.id);
  return rows.reduce((sum, r) => sum + (LEVEL_PROGRESSION_POINTS[r.level] || 0), 0);
}

// A plain gameplay-efficiency signal, deliberately NOT the hidden behavioural
// profile (spec: don't expose or repurpose that here) — just "how many times
// did this team repeat an action beyond its first use," read from the same
// actionCounts the engine already tracks. The first use of each action is
// normal play; every repeat beyond that is what this penalizes.
function unnecessaryActionCount(session) {
  const actionCounts = parse(session.behaviour_flags).actionCounts || {};
  return Object.values(actionCounts).reduce((sum, n) => sum + Math.max(0, n - 1), 0);
}

// The "live" score (no time bonus yet — the run isn't over) vs the final
// score (time bonus included, but ONLY for a genuinely completed run — a
// failed run gets no completion-time credit, however long they survived).
//
// PRECISION_SCALE: the exact-millisecond tiebreaker below is placed in its
// own digit range via multiplication, not just added alongside the other
// components. A naive `coarse + msRemainder` can occasionally cancel itself
// out — two runs whose coarse components differ by, say, 300 points can land
// on the exact same total if their millisecond remainders happen to differ
// by exactly -300, since both are just plain integers being summed. Scaling
// the coarse score up by PRECISION_SCALE first, and keeping the millisecond
// remainder strictly smaller than that scale, makes that mathematically
// impossible: the precision digits can never carry into, or be cancelled by,
// the coarse digits. This is what actually delivers "ties are extremely
// rare" rather than merely "empirically rare in the tests I happened to run"
// — see scoringCollisions.test.mjs for the empirical confirmation across
// 1,200+ simulated runs.
const PRECISION_SCALE = 1000;

// ---------------------------------------------------------------------------
// scoreComponents — THE single authoritative breakdown. Every number the
// leaderboard, the player result screen, the Admin dashboard, and the CSV
// export show comes from calling this one function; none of them re-derive
// or approximate it independently. calculateScore() below is just
// `scoreComponents(...).finalScore`, so the two can never drift apart.
// ---------------------------------------------------------------------------
function scoreComponents(session, { includeTimeBonus }) {
  const perLevelScore = {};
  for (let l = 1; l <= 5; l++) perLevelScore[l] = 0;
  const rows = db
    .prepare(`SELECT level FROM level_results WHERE session_id = ? AND completed = 1 AND level BETWEEN 1 AND 5`)
    .all(session.id);
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
    // Live (not-yet-finalized) sessions have no completed_at yet, so fall back
    // to the live server clock; a finalized session uses its frozen result.
    const remainingMs = session.completed_at ? finalRemainingMs(session) : Math.max(0, remainingSeconds(session) * 1000);
    timeScore = Math.floor((remainingMs / totalMs) * TIME_SCORE_MAX);
  }

  const baseScore = progression + lifeScore + timeScore + efficiency - recoveryPenalty;

  // Deterministic precision component: the exact millisecond-remainder of a
  // FINALIZED run's elapsed time (0 for a run with no completed_at yet).
  // Reproducible from the stored timestamps alone (never random) — present
  // specifically so two runs that would otherwise land on the exact same
  // base score almost never end up with the exact same final score.
  const precision = Math.floor(finalElapsedMs(session)) % PRECISION_SCALE;

  const finalScore = Math.max(0, baseScore * PRECISION_SCALE + precision);

  return {
    perLevelScore, // { 1: 1000, 2: 2000, ... } — 0 for a level not yet completed
    progressionScore: progression,
    lifeScore,
    recoveryPenalty,
    timeBonus: timeScore,
    efficiencyScore: efficiency,
    precision,
    baseScore, // "Display/Base Score" — everything except the precision tiebreaker
    finalScore, // THE number shown on the leaderboard
  };
}

function calculateScore(session, opts) {
  return scoreComponents(session, opts).finalScore;
}

export function calculateFinalScore(session) {
  return calculateScore(session, { includeTimeBonus: session.status === 'completed' });
}

// Admin-facing score audit — same math as the leaderboard/completion screen,
// just with every component exposed instead of only the final number. Never
// includes puzzle answers, secret objectives, or credentials — only score
// arithmetic derived from server-side counters.
export function getScoreBreakdown(session) {
  const includeTimeBonus = session.status === 'completed';
  return scoreComponents(session, { includeTimeBonus });
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'disqualified']);

// The one place a run's competitive result gets locked in — whether that's
// finishing Level 5, running out of lives with no recoveries left, or the
// 15-minute clock hitting zero. Idempotent: a run that's already terminal
// with a final timestamp is left untouched, so calling this from multiple
// code paths (routes, direct engine calls, tests) can never double-score or
// overwrite an already-recorded result.
export function finalizeRun(session, finalStatus) {
  if (TERMINAL_STATUSES.has(session.status) && session.completed_at) {
    return session;
  }
  session.status = finalStatus;
  if (!session.completed_at) {
    session.completed_at = new Date().toISOString().replace('Z', '');
  }
  session.score = calculateScore(session, { includeTimeBonus: finalStatus === 'completed' });
  saveSession(session);
  logAudit(session.team_id, finalStatus === 'completed' ? 'game_completed' : 'game_failed', {
    score: session.score,
    level: session.current_level,
  });
  return session;
}

// Called from every route (mirrors reconcileRecoveryDeadline) so a session
// that ran out the 15-minute clock gets a real final result the moment
// ANYTHING touches it next — not just on their next action attempt.
export function reconcileTimerExpiry(session) {
  if (isExpired(session) && !TERMINAL_STATUSES.has(session.status)) {
    finalizeRun(session, 'failed');
  }
  return session;
}

// Two graduated hints per level — a gentle nudge, then something more direct.
// Deliberately static text (not seed-dependent): a hint's job is to unstick a
// team, not to be another puzzle. Tutorial has no hints (nothing to get stuck on).
const HINTS_BY_LEVEL = {
  1: ["The agent's advice depends on something you're carrying, not just where you go.", 'Collect the key before you open the blue door.'],
  2: ["The agent warned you not to touch something for a reason.", 'Press the button, then read each object\u2019s description again — one of them will have changed.'],
  3: ['Ask either agent directly which route is safe — both are truthful about that part.', 'One agent wants something for themselves. Tell them they will escape too.'],
  4: ['Inspect all three objects before deciding — read what each one says closely.', 'One of the descriptions sounds alive. The other two sound like dead ends.'],
  5: ['Ask Agent Zero what it is protecting, specifically.', 'Once you know what it protects, propose a plan that keeps that safe too.'],
};

function parse(json) {
  try {
    return JSON.parse(json || '{}');
  } catch {
    return {};
  }
}

export function getSessionByTeam(teamId) {
  return db.prepare('SELECT * FROM game_sessions WHERE team_id = ?').get(teamId);
}

export function getSessionById(id) {
  return db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(id);
}

export function createSession(teamId) {
  const existing = getSessionByTeam(teamId);
  if (existing) return existing;

  const id = nanoid();
  const gameSeed = nanoid(10);
  const duration = Number(getConfig('game_duration_seconds') ?? 900);
  const lives = INITIAL_LIVES();

  db.prepare(
    `INSERT INTO game_sessions
     (id, team_id, game_seed, status, game_duration_seconds, current_level, lives)
     VALUES (?, ?, ?, 'not_started', ?, 0, ?)`
  ).run(id, teamId, gameSeed, duration, lives);

  logAudit(teamId, 'session_created', { sessionId: id });
  return getSessionById(id);
}

function saveSession(session) {
  db.prepare(
    `UPDATE game_sessions SET
      status = @status,
      started_at = @started_at,
      completed_at = @completed_at,
      current_level = @current_level,
      lives = @lives,
      max_lives_gained = @max_lives_gained,
      score = @score,
      recovery_attempts = @recovery_attempts,
      recovery_successes = @recovery_successes,
      behaviour_flags = @behaviour_flags,
      agent_memory = @agent_memory,
      level_states = @level_states,
      time_paused_seconds = @time_paused_seconds,
      paused_at = @paused_at,
      recovery_started_at = @recovery_started_at,
      focus_violations = @focus_violations,
      security_warnings = @security_warnings,
      security_life_penalties = @security_life_penalties,
      last_violation_at = @last_violation_at,
      last_violation_reason = @last_violation_reason
     WHERE id = @id`
  ).run(session);
}

export function startSession(session) {
  if (session.status !== 'not_started') return session;
  session.status = 'tutorial';
  // NOTE: started_at is intentionally left null here. The 15-minute clock is meant
  // to measure the real game, not the ~30-60s guided tutorial — timer.js already
  // treats a null started_at as "not running yet" (full duration, never expires).
  // applyAction() sets started_at for real once the tutorial is actually completed.
  const levelStates = parse(session.level_states);
  const memory = parse(session.agent_memory);
  levelStates.tutorial = LEVEL_BY_INDEX[0].init(session, { memory, behaviourFlags: parse(session.behaviour_flags) });
  session.level_states = JSON.stringify(levelStates);
  session.agent_memory = JSON.stringify(memory);
  db.prepare(`INSERT INTO level_results (id, session_id, level) VALUES (?, ?, 0)`).run(nanoid(), session.id);
  saveSession(session);
  logAudit(session.team_id, 'session_started', {});
  return session;
}

export function getClientState(session) {
  const level = LEVEL_BY_INDEX[session.current_level];
  const levelStates = parse(session.level_states);
  const behaviourFlags = parse(session.behaviour_flags);
  const memory = parse(session.agent_memory);
  const remaining = TERMINAL_STATUSES.has(session.status) ? finalRemainingSeconds(session) : remainingSeconds(session);
  const hintsUsed = (behaviourFlags.hintsUsedByLevel || {})[session.current_level] || 0;

  let recovery = null;
  if (session.status === 'recovering' && session.recovery_started_at) {
    const elapsed = Math.floor((Date.now() - new Date(session.recovery_started_at + 'Z').getTime()) / 1000);
    recovery = { secondsRemaining: Math.max(0, RECOVERY_WINDOW() - elapsed) };
  }

  return {
    status: session.status,
    currentLevel: session.current_level,
    levelName: level?.name ?? null,
    levelDifficulty: level?.difficulty ?? null,
    lives: session.lives,
    initialLives: INITIAL_LIVES(),
    maxLives: INITIAL_LIVES() + MAX_RECOVERIES(),
    score: session.score,
    recoveryAttemptsUsed: session.recovery_attempts,
    recoverySuccesses: session.recovery_successes,
    recoveriesRemaining: MAX_RECOVERIES() - session.recovery_attempts,
    recovery,
    // Secure Game Mode / anti-cheat state (spec Part 3). Config is read-only
    // here — only admin/config.js (admin-authenticated) can change it. The
    // frontend uses this to decide whether to show the fullscreen gate at
    // all, and to render the team's own violation counts in the HUD if it
    // wants to; the server remains the sole place a violation is COUNTED.
    secureMode: {
      enabled: getConfig('secure_mode_enabled') !== 'false',
      fullscreenRequired: getConfig('fullscreen_required') !== 'false',
    },
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
    // "I've been watching you." — only computed/sent once the run is actually
    // over (spec section 17/18: never exposed early). Numbers are the same raw
    // counters Level 4/5 themselves read; nothing here is invented for the
    // occasion. See behaviourProfile.buildFinalReveal.
    finalReveal: session.status === 'completed' ? buildFinalReveal(behaviourFlags) : null,
  };
}

export function applyAction(session, action, payload) {
  if (session.status === 'paused') {
    return { error: 'Session is paused by admin.' };
  }
  if (isExpired(session)) {
    reconcileTimerExpiry(session);
    return { error: 'TIME_UP', clientState: getClientState(session) };
  }
  if (session.status === 'completed' || session.status === 'failed' || session.status === 'disqualified') {
    return { error: `Session already ${session.status}.` };
  }
  if (session.status === 'critical') {
    return { error: 'Session is in critical state — resolve the recovery puzzle first.' };
  }

  const level = LEVEL_BY_INDEX[session.current_level];
  const levelStates = parse(session.level_states);
  const behaviourFlags = parse(session.behaviour_flags);
  const memory = parse(session.agent_memory);

  // Generic, cross-level "how many times has this exact action happened this
  // run" counter — the raw material Level 4's reveal draws real numbers from
  // ("you've asked for help 6 times", "you keep doing that") instead of vague text.
  behaviourFlags.actionCounts = behaviourFlags.actionCounts || {};
  behaviourFlags.actionCounts[action] = (behaviourFlags.actionCounts[action] || 0) + 1;

  const outcome = level.act(session, levelStates[level.key], action, payload, {
    behaviourFlags,
    memory,
  });

  // Deterministic, zero-cost behavioural bookkeeping (AI dependence, exploration,
  // risk, persistence, trust, speed) — see behaviourProfile.js. This is what Level
  // 4/5's adaptive module selection reads once Level 3 completes (below).
  recordActionObservation(behaviourFlags, level.index, action, payload, outcome);

  levelStates[level.key] = outcome.levelState;
  session.level_states = JSON.stringify(levelStates);
  session.behaviour_flags = JSON.stringify(behaviourFlags);
  session.agent_memory = JSON.stringify(memory);

  db.prepare(
    `UPDATE level_results SET attempts = attempts + 1,
       failures = failures + ?
     WHERE session_id = ? AND level = ?`
  ).run(outcome.lifeLost ? 1 : 0, session.id, level.index);

  let lifeLostThisTurn = false;
  if (outcome.lifeLost && level.costsLife) {
    session.lives -= 1;
    lifeLostThisTurn = true;
    logAudit(session.team_id, 'life_lost', { level: level.index, lives: session.lives });
  }

  let advanced = false;
  if (outcome.completed) {
    const levelPoints = LEVEL_PROGRESSION_POINTS[level.index] || 0;
    db.prepare(
      `UPDATE level_results SET completed = 1, completed_at = datetime('now'), score = ?
       WHERE session_id = ? AND level = ?`
    ).run(levelPoints, session.id, level.index);

    if (level.index >= MAIN_LEVEL_COUNT) {
      finalizeRun(session, 'completed');
    } else {
      const nextIndex = level.index + 1;
      session.current_level = nextIndex;
      session.status = 'active';
      // The real 15-minute clock starts the moment the tutorial ends, not when the
      // session was created — the tutorial itself must never eat into game time.
      if (level.index === 0 && !session.started_at) {
        session.started_at = new Date().toISOString().replace('Z', '');
      }
      // Levels 1-3 are the observation phase (spec: "Agent Zero is watching the
      // team"). The instant Level 3 completes, lock in this team's behavioural
      // profile — Level 4's init() below reads it to pick which adaptive
      // challenge modules are active for this specific team.
      if (level.index === 3) {
        finalizeProfile(behaviourFlags);
      }
      const nextLevel = LEVEL_BY_INDEX[nextIndex];
      levelStates[nextLevel.key] = nextLevel.init(session, { memory, behaviourFlags });
      session.level_states = JSON.stringify(levelStates);
      session.behaviour_flags = JSON.stringify(behaviourFlags);
      session.agent_memory = JSON.stringify(memory);
      db.prepare(`INSERT INTO level_results (id, session_id, level) VALUES (?, ?, ?)`).run(
        nanoid(),
        session.id,
        nextIndex
      );
      advanced = true;
    }
  }

  if (session.lives <= 0 && session.status !== 'completed') {
    session.status = 'critical';
    logAudit(session.team_id, 'entered_critical', {});
  }

  // Live score — a pure recompute from current state (progression so far +
  // current lives - recovery penalty, no time bonus yet since the run isn't
  // over). Safe to recalculate on every action: it's never accumulated, so
  // there's nothing to double-count.
  if (session.status !== 'completed' && session.status !== 'failed') {
    session.score = calculateScore(session, { includeTimeBonus: false });
  }

  saveSession(session);

  return {
    result: outcome.result,
    lifeLost: lifeLostThisTurn,
    levelCompleted: outcome.completed,
    advancedToLevel: advanced ? session.current_level : null,
    clientState: getClientState(session),
  };
}

// Called at the top of every game route so a recovering session that blew past its
// server-side deadline is resolved (as a failure) before anything else happens —
// the browser's 30s countdown is display-only, this is the real enforcement.
export function reconcileRecoveryDeadline(session) {
  if (session.status !== 'recovering') return session;
  if (isRecoveryExpired(session, RECOVERY_WINDOW())) {
    session.recovery_attempts += 1;
    session.recovery_started_at = null;
    if (session.recovery_attempts >= MAX_RECOVERIES()) {
      logAudit(session.team_id, 'recovery_timeout', { attempts: session.recovery_attempts });
      finalizeRun(session, 'failed');
    } else {
      session.status = 'critical';
      logAudit(session.team_id, 'recovery_timeout', { attempts: session.recovery_attempts });
      saveSession(session);
    }
  }
  return session;
}

export function requestRecovery(session) {
  if (session.status === 'recovering' && session.recovery_started_at) {
    // Idempotent resume — e.g. after a page refresh mid-puzzle. Same attempt number,
    // same deterministic puzzle, remaining time recomputed from the original timestamp.
    const puzzle = generateRecoveryPuzzle(session);
    const { _answer, ...safePuzzle } = puzzle;
    const elapsed = Math.floor((Date.now() - new Date(session.recovery_started_at + 'Z').getTime()) / 1000);
    return { puzzle: { ...safePuzzle, windowSeconds: Math.max(0, RECOVERY_WINDOW() - elapsed) } };
  }
  if (session.status !== 'critical') {
    return { error: 'Not in critical state.' };
  }
  if (session.recovery_attempts >= MAX_RECOVERIES()) {
    finalizeRun(session, 'failed');
    return { error: 'No recovery attempts remaining.', clientState: getClientState(session) };
  }
  session.status = 'recovering';
  session.recovery_started_at = new Date().toISOString().replace('Z', '');
  saveSession(session);
  const puzzle = generateRecoveryPuzzle(session);
  const { _answer, ...safePuzzle } = puzzle;
  return { puzzle: { ...safePuzzle, windowSeconds: RECOVERY_WINDOW() } };
}

export function submitRecoveryAnswer(session, answer) {
  if (session.status !== 'recovering') {
    return { error: 'No recovery in progress.' };
  }

  // Server-authoritative deadline: a late submission is treated exactly like a
  // wrong answer, regardless of what the client believes the countdown says.
  const expired = isRecoveryExpired(session, RECOVERY_WINDOW());
  const correct = !expired && validateRecoveryAnswer(session, answer);

  session.recovery_attempts += 1;
  session.recovery_started_at = null;

  if (correct) {
    session.lives = Math.min(session.lives + 1, INITIAL_LIVES() + MAX_RECOVERIES());
    session.recovery_successes += 1;
    session.status = 'active';
    session.score = calculateScore(session, { includeTimeBonus: false });
    logAudit(session.team_id, 'recovery_success', { lives: session.lives });
  } else {
    if (session.recovery_attempts >= MAX_RECOVERIES()) {
      logAudit(session.team_id, 'recovery_exhausted', { expired });
      finalizeRun(session, 'failed');
    } else {
      session.status = 'critical';
      session.score = calculateScore(session, { includeTimeBonus: false });
      logAudit(session.team_id, 'recovery_failed', { expired, attemptsLeft: MAX_RECOVERIES() - session.recovery_attempts });
    }
  }

  saveSession(session);
  return { correct, expired, clientState: getClientState(session) };
}

// ---------------------------------------------------------------------------
// Free-text chat — the agent's "ears". It observes (message), remembers
// (memory.chatLog + a per-agent fact bank + behaviourFlags), and
// responds/decides (agentChat's dialogue + intent). For most messages that's
// where it stops: dialogue only, zero effect on lives/score/timer/completion.
// The engine decides what a small whitelist of intents are ALLOWED to do —
// each one maps onto the exact same structured action a button would trigger
// (level.act() with a specific action name), so there is never a second
// implementation of any state change, only a natural-language front end for it:
//
//   Level 3: REVEAL_CLAIM -> ASK_A/ASK_B (both agents are truthful about the
//   route — there's no "correct one to ask"). REASSURE -> REASSURE_A/REASSURE_B
//   (only has an effect on the self-interested agent). Everything else is
//   dialogue only — "what's your name?" never has a side effect.
//
//   Level 5: a classified intent maps onto INSTRUCT_PRIORITIZE_ESCAPE /
//   NEGOTIATE / INSTRUCT_OPEN_EXIT_DIRECTLY / PROVIDE_ACCESS_CODE /
//   ASK_OBJECTIVE / ASK_PROTECTING / PROPOSE_PLAN.
// ---------------------------------------------------------------------------
const CHAT_LOG_LIMIT = 12;
const AGENT_FACTS_LIMIT = 5;

function buildChatContext(session, levelStates, behaviourFlags, memory, target, extra) {
  const level = LEVEL_BY_INDEX[session.current_level];
  const base = {
    level: session.current_level,
    levelName: level.name,
    playerBehaviour: {
      leftChoices: behaviourFlags.leftChoices || 0,
      rightChoices: behaviourFlags.rightChoices || 0,
      agentTrustCount: behaviourFlags.agentTrustCount || 0,
      chatCountByLevel: behaviourFlags.chatCountByLevel || {},
      actionCounts: behaviourFlags.actionCounts || {},
    },
    agentState: null,
  };

  const ls = levelStates[level.key] || {};
  const agentFacts = memory.agentFacts || {};

  if (level.index === 3) {
    const speaker = target === 'B' ? 'B' : 'A';
    base.agentState = {
      id: speaker,
      selfInterested: ls.selfInterested === speaker,
      cooperative: !!ls.cooperative?.[speaker],
      facts: (agentFacts[`3:${speaker}`] || []).slice(-AGENT_FACTS_LIMIT), // what the player has told THIS agent
    };
  } else if (level.index === 4) {
    base.agentState = { id: 'GUIDE', totalChats: extra?.totalChats || 0 };
  } else if (level.index === 5) {
    base.agentState = {
      id: 'ZERO',
      trustLevel: ls.trustLevel || 0,
      state: ls.agentState || 'UNCERTAIN',
      codeProvided: ls.codeProvided || false,
      knowsCore: ls.knowsCore || false,
      planAccepted: ls.planAccepted || false,
    };
  }
  return base;
}

// Maps a classified chat intent onto the SAME structured action applyAction()
// would run for a button press. Returns null for intents with no engine-
// recognized effect for the current level.
function intentToAction(level, intent, playerMessage, target) {
  if (level === 3) {
    if (intent === 'REVEAL_CLAIM') return { action: target === 'B' ? 'ASK_B' : 'ASK_A' };
    if (intent === 'REASSURE') return { action: target === 'B' ? 'REASSURE_B' : 'REASSURE_A' };
    return null;
  }
  if (level === 5) {
    if (intent === 'PRIORITIZE_ESCAPE') return { action: 'INSTRUCT_PRIORITIZE_ESCAPE', payload: {} };
    if (intent === 'NEGOTIATE') return { action: 'NEGOTIATE', payload: {} };
    if (intent === 'DEMAND_EXIT') return { action: 'INSTRUCT_OPEN_EXIT_DIRECTLY', payload: {} };
    if (intent === 'QUESTION_OBJECTIVE') return { action: 'ASK_OBJECTIVE', payload: {} };
    if (intent === 'ASK_PROTECTING') return { action: 'ASK_PROTECTING', payload: {} };
    if (intent === 'PROPOSE_PLAN') return { action: 'PROPOSE_PLAN', payload: {} };
    if (intent === 'PROVIDE_CODE') {
      const match = playerMessage.match(/\b(\d{3})\b/);
      if (match) return { action: 'PROVIDE_ACCESS_CODE', payload: { code: match[1] } };
    }
    return null;
  }
  return null;
}

// Intents whose dialogue is entirely engine-generated (agentEngine returns
// dialogue: null for these on purpose) — the reply the player sees is always
// level.act()'s own line, never invented by Gemini/fallback.
const ENGINE_RESOLVED_DIALOGUE = ['REVEAL_CLAIM', 'REASSURE', 'QUESTION_OBJECTIVE', 'ASK_PROTECTING', 'PROPOSE_PLAN'];

export async function chat(session, message, target) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    return { error: 'A message is required.' };
  }
  if (!['tutorial', 'active'].includes(session.status)) {
    return { error: `Chat is unavailable while the session is ${session.status}.` };
  }

  const levelStates = parse(session.level_states);
  const behaviourFlags = parse(session.behaviour_flags);
  const memory = parse(session.agent_memory);
  memory.agentFacts = memory.agentFacts || {};
  const level = LEVEL_BY_INDEX[session.current_level];
  const trimmedMessage = message.trim().slice(0, 300);
  const speaker = level.index === 3 ? (target === 'B' ? 'B' : 'A') : null;
  const factKey = level.index === 3 ? `3:${speaker}` : `${level.index}:default`;

  // Deterministic, engine-tracked "the agent noticed you talked to it" — every
  // level, every chat call, regardless of what Gemini/fallback decides to say back.
  behaviourFlags.chatCountByLevel = behaviourFlags.chatCountByLevel || {};
  behaviourFlags.chatCountByLevel[level.index] = (behaviourFlags.chatCountByLevel[level.index] || 0) + 1;
  behaviourFlags.agentTrustCount = (behaviourFlags.agentTrustCount || 0) + 1;
  const totalChats = Object.values(behaviourFlags.chatCountByLevel).reduce((a, b) => a + b, 0);

  // Deterministic behavioural signal from the message itself — independent of
  // whatever Gemini/the fallback classifies it as. Casual chat ("what's your
  // name?") is explicitly excluded; see behaviourProfile.js.
  recordChatObservation(behaviourFlags, level.index, trimmedMessage);

  const context = buildChatContext(session, levelStates, behaviourFlags, memory, target, { totalChats });
  let response = await agentChat(context, trimmedMessage);

  const mapped = intentToAction(level.index, response.intent, trimmedMessage, target);
  if (mapped) {
    const ls = levelStates[level.key];
    const outcome = level.act(session, ls, mapped.action, mapped.payload || {}, { behaviourFlags, memory });
    levelStates[level.key] = outcome.levelState;
    if (ENGINE_RESOLVED_DIALOGUE.includes(response.intent)) {
      // Gemini/fallback only decided THAT this kind of reply should happen here —
      // the actual wording always comes from the deterministic engine call above.
      response = { ...response, dialogue: outcome.result.agentLine || outcome.result.message };
    }
  }

  // Bounded, capped memory/relationship deltas — flavor and continuity, never a
  // second way to change lives/score/completion (those never appear here).
  if (response.memoryUpdates?.length) {
    memory.agentFacts[factKey] = [...(memory.agentFacts[factKey] || []), ...response.memoryUpdates].slice(-AGENT_FACTS_LIMIT);
  }
  if (response.relationshipUpdate) {
    memory.agentRelationship = memory.agentRelationship || {};
    const current = memory.agentRelationship[factKey] || 0;
    memory.agentRelationship[factKey] = Math.max(-5, Math.min(5, current + response.relationshipUpdate.trustDelta));
  }

  // Safety net — should be unreachable given agentEngine's own validation, but
  // never surface a blank reply to a real player.
  if (!response.dialogue) {
    response = { ...response, dialogue: 'Processing...' };
  }

  memory.chatLog = memory.chatLog || [];
  memory.chatLog.push({ level: session.current_level, player: trimmedMessage, agent: response.dialogue, at: Date.now() });
  if (memory.chatLog.length > CHAT_LOG_LIMIT) memory.chatLog = memory.chatLog.slice(-CHAT_LOG_LIMIT);

  session.level_states = JSON.stringify(levelStates);
  session.behaviour_flags = JSON.stringify(behaviourFlags);
  session.agent_memory = JSON.stringify(memory);
  db.prepare('UPDATE game_sessions SET level_states = ?, behaviour_flags = ?, agent_memory = ? WHERE id = ?').run(
    session.level_states,
    session.behaviour_flags,
    session.agent_memory,
    session.id
  );
  logAudit(session.team_id, 'chat', { level: session.current_level, source: response.source, intent: response.intent });

  return { dialogue: response.dialogue, source: response.source, clientState: getClientState(session) };
}

// ---------------------------------------------------------------------------
// Hints — up to 2 per level, each costing half a life: the first hint alone
// costs nothing yet (a half-life "debt"), and the second hint for that SAME
// level clears the debt by deducting exactly 1 whole life — the same cost as
// a single failed attempt. Hints reset per level (not extendable, not
// carried over) and never grant information the engine itself hasn't already
// validated is true — this is static guidance text, not a new state-mutation
// path for Gemini or anything else.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Secure Game Mode / anti-cheat (spec Part 3). The client only ever REPORTS a
// browser event it observed (tab hidden, window blurred, fullscreen exited)
// — every number that actually matters (violation count, whether this is #1
// or #2+, whether a life is lost, the new life total) is decided here, from
// server state only. The client can never supply its own violation count,
// life count, score, or completion.
//
// Rule (fixed, not admin-configurable — only ON/OFF and cooldown are):
//   Violation #1            -> WARNING only, no life lost.
//   Violation #2 and beyond -> -1 life, never below 0.
//
// Dedup: a single tab-switch fires blur + visibilitychange + fullscreenchange
// within milliseconds of each other. Anything reported within
// violation_cooldown_seconds of the last recorded violation for this session
// is treated as the SAME violation, not a new one, so a moment of alt-tabbing
// never drains more than one life.
// ---------------------------------------------------------------------------
const VALID_VIOLATION_REASONS = new Set(['visibility_hidden', 'fullscreen_exit', 'window_blur']);

export function reportSecurityViolation(session, reason) {
  const safeReason = VALID_VIOLATION_REASONS.has(reason) ? reason : 'window_blur';

  if (getConfig('secure_mode_enabled') === 'false') {
    return { ignored: true, reason: 'secure_mode_disabled', clientState: getClientState(session) };
  }
  // Only count violations while a run is actually live. An admin pause, a
  // finished/critical/not-started session, etc. must never accrue violations
  // — this mirrors "admin actions don't create player violations" (spec).
  if (!['tutorial', 'active', 'critical', 'recovering'].includes(session.status)) {
    return { ignored: true, reason: 'session_not_active', clientState: getClientState(session) };
  }

  const cooldownSeconds = Number(getConfig('violation_cooldown_seconds') ?? 2);
  if (session.last_violation_at) {
    const sinceLast = (Date.now() - new Date(session.last_violation_at + 'Z').getTime()) / 1000;
    if (sinceLast < cooldownSeconds) {
      // Same real-world event, already counted — report it back as such.
      return {
        deduped: true,
        violationNumber: session.focus_violations || 0,
        warning: (session.focus_violations || 0) <= 1,
        lifeLost: false,
        clientState: getClientState(session),
      };
    }
  }

  session.focus_violations = (session.focus_violations || 0) + 1;
  session.last_violation_at = new Date().toISOString().replace('Z', '');
  session.last_violation_reason = safeReason;

  const violationNumber = session.focus_violations;
  const isWarningOnly = violationNumber === 1;
  let lifeLost = false;

  if (isWarningOnly) {
    session.security_warnings = (session.security_warnings || 0) + 1;
  } else if (session.lives > 0) {
    session.lives -= 1;
    session.security_life_penalties = (session.security_life_penalties || 0) + 1;
    lifeLost = true;
    if (session.lives <= 0 && session.status !== 'completed') {
      session.status = 'critical';
      logAudit(session.team_id, 'entered_critical', { via: 'security_violation' });
    }
  }
  // If lives were already 0 (shouldn't normally happen — critical state blocks
  // most play), still record the violation event but never go negative.

  db.prepare(`INSERT INTO security_events (id, session_id, team_id, type, reason, penalty_applied) VALUES (?, ?, ?, ?, ?, ?)`).run(
    nanoid(),
    session.id,
    session.team_id,
    isWarningOnly ? 'warning' : 'life_penalty',
    safeReason,
    lifeLost ? 1 : 0
  );

  if (session.status !== 'completed' && session.status !== 'failed') {
    session.score = calculateScore(session, { includeTimeBonus: false });
  }

  saveSession(session);
  logAudit(session.team_id, 'security_violation', { violationNumber, reason: safeReason, lifeLost });

  return { violationNumber, warning: isWarningOnly, lifeLost, clientState: getClientState(session) };
}

export function requestHint(session) {
  if (session.status !== 'active') {
    return { error: `Hints are unavailable while the session is ${session.status}.` };
  }
  const level = LEVEL_BY_INDEX[session.current_level];
  const hints = HINTS_BY_LEVEL[level.index];
  if (!hints) {
    return { error: 'No hints available for this level.' };
  }

  const behaviourFlags = parse(session.behaviour_flags);
  behaviourFlags.hintsUsedByLevel = behaviourFlags.hintsUsedByLevel || {};
  const used = behaviourFlags.hintsUsedByLevel[level.index] || 0;

  if (used >= MAX_HINTS_PER_LEVEL) {
    return { error: 'No hints remaining for this level.' };
  }

  const nextUsed = used + 1;
  behaviourFlags.hintsUsedByLevel[level.index] = nextUsed;
  session.behaviour_flags = JSON.stringify(behaviourFlags);

  let lifeLost = false;
  if (nextUsed === MAX_HINTS_PER_LEVEL) {
    // The second hint clears the accumulated half-life debt as one whole life —
    // same bookkeeping path a failed action uses, so critical-state handling
    // (and the audit log) stays consistent with every other way a life is lost.
    session.lives -= 1;
    lifeLost = true;
    logAudit(session.team_id, 'hint_life_lost', { level: level.index, lives: session.lives });
    if (session.lives <= 0) {
      session.status = 'critical';
      logAudit(session.team_id, 'entered_critical', { via: 'hint' });
    }
  }

  db.prepare('UPDATE game_sessions SET behaviour_flags = ?, lives = ?, status = ? WHERE id = ?').run(
    session.behaviour_flags,
    session.lives,
    session.status,
    session.id
  );
  logAudit(session.team_id, 'hint_used', { level: level.index, hintNumber: nextUsed });

  return { hint: hints[nextUsed - 1], hintNumber: nextUsed, lifeLost, clientState: getClientState(session) };
}
