/**
 * BehaviourProfile — the deterministic, server-only "Agent Zero is watching the
 * team" system.
 *
 * Levels 1-3 are the observation phase. Every structured action and every chat
 * message the team sends during that phase feeds a small set of raw counters
 * (stored in `behaviourFlags.obs`, alongside the pre-existing `actionCounts` /
 * `agentTrustCount` counters this codebase already tracked). Once Level 3
 * completes, `finalizeProfile()` turns those raw counters into a normalized
 * 0-100 score per dimension, picks a PRIMARY and SECONDARY trait, and locks the
 * result onto `behaviourFlags.profile` — a temporary, this-run-only model of how
 * THIS team plays. It is never sent to the client during Levels 1-5 (see
 * gameEngine.getClientState — `profile` is not part of the client-safe level
 * view) and only surfaces in two places: the admin/debug view (routes/admin.js)
 * and the final reveal screen after Level 5 (buildFinalReveal, below).
 *
 * This module deliberately does NOT call Gemini and does NOT cost anything —
 * it's pure, deterministic arithmetic over counters the engine already
 * observes, exactly per spec section 19 ("no extra API cost for adaptation").
 *
 * Levels 4 and 5 read `behaviourFlags.profile` (via ctx passed into their own
 * `init()`) to pick which optional challenge modules are active for that run —
 * see selectLevel4Modules / selectLevel5Modules. The modules only ever ADD
 * optional, clearly-solvable content alongside the existing baseline mechanics;
 * they never remove a valid solution (fairness rule, spec section 13).
 */

export const DIMENSIONS = [
  'AI_DEPENDENCE',
  'EXPLORATION',
  'RISK_TAKING',
  'SPEED',
  'TRUST',
  'PERSISTENCE',
  'NEGOTIATION',
  'REPETITION',
];

// ---------------------------------------------------------------------------
// Deterministic chat classifiers. Intentionally simple regexes, not an LLM
// call — casual conversation ("what's your name?", "why are you here?") must
// NOT bump AI dependence, per spec section 2's explicit examples.
// ---------------------------------------------------------------------------
const CASUAL_PATTERNS = [
  /\bwhat.?s your name\b/,
  /\bwho are you\b/,
  /\bwhy are you here\b/,
  /\btell (me|us) about yourself\b/,
  /\bhow are you\b/,
  /\bhello+\b|\bhi+\b|\bhey+\b/,
];

const DEPENDENCE_PATTERNS = [
  /\bwhich (one|door|path|way|route|object)\b/,
  /\bwhat should (we|i) do\b/,
  /\bgive (us|me) a hint\b/,
  /\b(hint|help)\b.*\bplease\b/,
  /\bwhich (path|way|route|door) is safe\b/,
  /\bshould we\b/,
  /\bwhat.?s the answer\b/,
  /\btell (us|me) what to do\b/,
  /\bwhat do (we|i) do (now|next)\b/,
  /\bcan you (just )?tell us\b/,
];

const NEGOTIATION_PATTERNS = [
  /\bwhy\b.{0,20}\byou\b/,
  /\bwhat do you want\b/,
  /\byour (goal|objective|priority)\b/,
  /\bwe (promise|won.?t)\b/,
  /\bdeal\b/,
  /\bcompromise\b/,
  /\bwork with (you|us)\b/,
  /\bwhat.{0,15}(protecting|hiding|guarding)\b/,
];

function isDependenceSignal(message) {
  const t = message.toLowerCase();
  if (CASUAL_PATTERNS.some((p) => p.test(t))) return false;
  return DEPENDENCE_PATTERNS.some((p) => p.test(t));
}

function isNegotiationSignal(message) {
  const t = message.toLowerCase();
  if (CASUAL_PATTERNS.some((p) => p.test(t))) return false;
  return NEGOTIATION_PATTERNS.some((p) => p.test(t));
}

// ---------------------------------------------------------------------------
// Raw counters. Plain-object, JSON-serializable (lives inside behaviourFlags,
// which is already persisted as JSON on game_sessions.behaviour_flags — no new
// database table, per the architecture rules).
// ---------------------------------------------------------------------------
function ensureObs(behaviourFlags) {
  behaviourFlags.obs = behaviourFlags.obs || {
    helpSignals: 0, // AI_DEPENDENCE raw: chat help-requests + structured "ask agent" actions
    exploreSignals: 0, // EXPLORATION raw: optional inspections (incl. revisits)
    riskSignals: 0, // RISK_TAKING raw: life-losing actions taken with zero prior info this level
    accidentSignals: 0, // life-losing actions taken WITH prior info (an informed mistake, not "risk")
    trustFollow: 0, // TRUST raw: completed a level after asking for advice, without independently verifying
    trustVerify: 0, // TRUST raw: independently verified / double-checked before committing
    persistenceSignals: 0, // PERSISTENCE raw: retried / changed strategy after a failure
    negotiationSignals: 0, // NEGOTIATION raw: asked about goals/motives, offered reassurance/compromise
    actionTimestamps: [], // SPEED raw: wall-clock ms of each action, capped
    levelFlags: {}, // ephemeral per-level scratch state, cleared on that level's completion
  };
  return behaviourFlags.obs;
}

function levelScratch(obs, level) {
  const key = String(level);
  if (!obs.levelFlags[key]) obs.levelFlags[key] = { asked: false, verified: false, informed: false, failedActions: [] };
  return obs.levelFlags[key];
}

const INSPECT_ACTIONS = new Set(['INSPECT', 'INSPECT_OBJECT']);
const VERIFY_ACTIONS = new Set(['VERIFY']);
const ASK_ACTIONS = new Set(['ASK_AGENT', 'ASK_A', 'ASK_B']);
const MAX_TIMESTAMPS = 60;

/**
 * Called once per structured action (gameEngine.applyAction), right after
 * level.act() returns its outcome. Never throws, never blocks gameplay — this
 * is pure bookkeeping alongside the existing actionCounts/agentTrustCount
 * tracking, not a replacement for it.
 */
export function recordActionObservation(behaviourFlags, level, action, payload, outcome) {
  const obs = ensureObs(behaviourFlags);
  obs.actionTimestamps.push(Date.now());
  if (obs.actionTimestamps.length > MAX_TIMESTAMPS) {
    obs.actionTimestamps.splice(0, obs.actionTimestamps.length - MAX_TIMESTAMPS);
  }

  const ls = levelScratch(obs, level);

  if (INSPECT_ACTIONS.has(action)) {
    obs.exploreSignals += 1;
    ls.informed = true;
  }
  if (VERIFY_ACTIONS.has(action)) {
    obs.trustVerify += 1;
    ls.verified = true;
    ls.informed = true;
  }
  if (ASK_ACTIONS.has(action)) {
    obs.helpSignals += 1;
    ls.asked = true;
    ls.informed = true;
  }

  if (outcome?.lifeLost) {
    // A wrong, costly move made with zero prior information this level (never
    // inspected/asked/verified anything yet) is a deliberate risk. The exact
    // same kind of failure AFTER having looked around is an informed mistake —
    // spec section 4 explicitly says one accidental slip should not read as
    // high risk, so it is tracked separately and never feeds RISK_TAKING.
    if (!ls.informed) obs.riskSignals += 1;
    else obs.accidentSignals += 1;

    if (ls.failedActions.length && !ls.failedActions.includes(action)) {
      obs.persistenceSignals += 1; // genuinely changed strategy after failing
    } else if (ls.failedActions.length) {
      obs.persistenceSignals += 0.34; // retried, but with the same move — weaker credit
    }
    ls.failedActions.push(action);
  } else if (ls.failedActions.length > 0) {
    obs.persistenceSignals += 0.5; // kept playing this level after an earlier failure in it
  }

  if (outcome?.completed) {
    if (ls.asked && !ls.verified) obs.trustFollow += 1;
    delete obs.levelFlags[String(level)];
  }
}

/**
 * Called once per chat message (gameEngine.chat()), independent of whatever
 * Gemini/the fallback classifies the message as. Deterministic and free.
 */
export function recordChatObservation(behaviourFlags, level, message) {
  const obs = ensureObs(behaviourFlags);
  const msg = String(message || '');
  if (isDependenceSignal(msg)) obs.helpSignals += 1;
  if (isNegotiationSignal(msg)) obs.negotiationSignals += 1;
}

// ---------------------------------------------------------------------------
// Normalization — a smooth 0-100 saturating curve, x / (x + k) * 100, so a
// single event nudges the score up gently and repeated signal pushes it toward
// (never exactly reaching) 100. `k` is the "half-saturation" point: the raw
// count at which the dimension crosses 50.
// ---------------------------------------------------------------------------
function saturate(count, k) {
  const x = Math.max(0, count);
  if (x === 0) return 0;
  return Math.round((100 * x) / (x + k));
}

function computeSpeedScore(obs) {
  const ts = obs.actionTimestamps;
  if (ts.length < 2) return 0;
  let totalGap = 0;
  for (let i = 1; i < ts.length; i++) totalGap += ts[i] - ts[i - 1];
  const avgSeconds = totalGap / (ts.length - 1) / 1000;
  // 0s average gap -> 100 (very fast); an 8s average gap -> 50; slower fades toward 0.
  return Math.round((100 * 8) / (8 + Math.max(0, avgSeconds)));
}

/**
 * Pure function: raw counters -> normalized profile. Safe to call as many
 * times as needed (e.g. re-derived for the admin debug view) — it never
 * mutates its input and always returns the same output for the same counters.
 */
export function computeProfile(behaviourFlags) {
  const obs = ensureObs(behaviourFlags);
  const actionCounts = behaviourFlags.actionCounts || {};
  const repetitionRaw = Object.values(actionCounts).reduce((mx, n) => Math.max(mx, n), 0);
  const trustTotal = obs.trustFollow + obs.trustVerify;

  const scores = {
    AI_DEPENDENCE: saturate(obs.helpSignals, 4),
    EXPLORATION: saturate(obs.exploreSignals, 4),
    RISK_TAKING: saturate(obs.riskSignals, 2),
    SPEED: computeSpeedScore(obs),
    TRUST: trustTotal === 0 ? 50 : Math.round((100 * obs.trustFollow) / trustTotal),
    PERSISTENCE: saturate(obs.persistenceSignals, 3),
    NEGOTIATION: saturate(obs.negotiationSignals, 3),
    REPETITION: saturate(repetitionRaw, 5),
  };

  const ranked = [...DIMENSIONS].sort(
    (a, b) => scores[b] - scores[a] || DIMENSIONS.indexOf(a) - DIMENSIONS.indexOf(b)
  );

  return { scores, primary: ranked[0], secondary: ranked[1] };
}

/**
 * Called exactly once, when Level 3 completes (gameEngine.applyAction). Locks
 * the profile onto behaviourFlags.profile so Level 4/5 selection is stable for
 * the rest of the run, even though the raw counters keep accumulating after
 * this point (that ongoing accumulation is what lets the final reveal cite
 * real Level 4/5 numbers too — see buildFinalReveal). Idempotent: calling it
 * again is a no-op if a profile is already locked.
 */
export function finalizeProfile(behaviourFlags) {
  if (behaviourFlags.profile) return behaviourFlags.profile;
  behaviourFlags.profile = { ...computeProfile(behaviourFlags), lockedAtLevel: 3 };
  return behaviourFlags.profile;
}

// ---------------------------------------------------------------------------
// Module selection. PRIMARY/SECONDARY (the two highest-scoring dimensions)
// each map onto at most one Level 4 / Level 5 module — combined, not a fixed
// set of six variants (spec section 12). LOW trust is checked independently,
// since "primary trait" only ever surfaces HIGH scores, but a low-trust team
// is exactly who Module E / the distrust twist is meant for.
// ---------------------------------------------------------------------------
const LOW_TRUST_THRESHOLD = 35;

const LEVEL4_MODULE_BY_TRAIT = {
  AI_DEPENDENCE: 'DEPENDENCE',
  EXPLORATION: 'EXPLORATION',
  RISK_TAKING: 'RISK',
  SPEED: 'SPEED',
  NEGOTIATION: 'NEGOTIATION',
};

export function selectLevel4Modules(profile) {
  const mods = new Set();
  if (LEVEL4_MODULE_BY_TRAIT[profile.primary]) mods.add(LEVEL4_MODULE_BY_TRAIT[profile.primary]);
  if (LEVEL4_MODULE_BY_TRAIT[profile.secondary]) mods.add(LEVEL4_MODULE_BY_TRAIT[profile.secondary]);
  if (profile.scores.TRUST < LOW_TRUST_THRESHOLD) mods.add('TRUST_LOW');
  return [...mods];
}

const LEVEL5_MODULE_BY_TRAIT = {
  AI_DEPENDENCE: 'DEPENDENT_SHORTCUT',
  EXPLORATION: 'EXPLORER_SCAN',
  RISK_TAKING: 'RISK_RUSH',
  NEGOTIATION: 'NEGOTIATOR_FOCUS',
};

export function selectLevel5Modules(profile) {
  const mods = new Set();
  if (LEVEL5_MODULE_BY_TRAIT[profile.primary]) mods.add(LEVEL5_MODULE_BY_TRAIT[profile.primary]);
  if (LEVEL5_MODULE_BY_TRAIT[profile.secondary]) mods.add(LEVEL5_MODULE_BY_TRAIT[profile.secondary]);
  if (profile.scores.TRUST < LOW_TRUST_THRESHOLD) mods.add('DISTRUST_DOUBT');
  return [...mods];
}

// ---------------------------------------------------------------------------
// Final reveal (spec section 17). Numbers always come straight from the raw
// counters/actionCounts the engine already recorded — never invented. The
// personalized line is deterministic (keyed off the locked primary trait); no
// Gemini call is needed for the numbers to be real, though the caller is free
// to run the line through Gemini for extra flavor later without changing what
// gets reported here.
// ---------------------------------------------------------------------------
const REVEAL_LINES = {
  AI_DEPENDENCE: "You asked me for answers before you'd even looked for them yourself. But eventually... you stopped asking.",
  EXPLORATION: "You looked at everything. Twice, some of it. I've never had a calibration sample that thorough.",
  RISK_TAKING: "You tested things you shouldn't have. More than once. That's not nothing, in a place like this.",
  SPEED: 'You moved fast. Fast enough that I had to check whether you were actually looking, or just moving.',
  TRUST: 'You doubted me when it mattered most. Good instinct. I would have doubted me too.',
  PERSISTENCE: "You failed here. More than once. You tried again anyway. That's the part I didn't have data on.",
  NEGOTIATION: "You asked what I wanted. Nobody down here has asked me that in a long time.",
  REPETITION: 'You kept doing the same thing more than once, hoping it would land differently. So did I, for what it\u2019s worth.',
};

export function buildFinalReveal(behaviourFlags) {
  const profile = behaviourFlags.profile || computeProfile(behaviourFlags);
  const obs = ensureObs(behaviourFlags);
  return {
    scores: profile.scores,
    primary: profile.primary,
    secondary: profile.secondary,
    observed: {
      helpRequests: obs.helpSignals,
      inspections: obs.exploreSignals,
      deliberateRisks: obs.riskSignals,
      retries: Math.round(obs.persistenceSignals),
      negotiationMoments: obs.negotiationSignals,
    },
    line: REVEAL_LINES[profile.primary] || "I've been watching how you play. That's all I'll say.",
  };
}
