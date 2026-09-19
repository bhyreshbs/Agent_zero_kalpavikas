// Empirical collision check for the high-resolution scoring model (see
// gameEngine.js's calculateScore). The design goal isn't "impossible to tie"
// — two teams with truly identical progression, lives, recovery usage,
// efficiency, AND millisecond-exact finish time could still tie, by
// definition — it's "collisions are extremely rare in practice," achieved
// through millisecond-resolution timing plus a deterministic precision
// component, with NO randomness anywhere in the score itself.
//
// This file generates many varied, deterministically-derived simulated runs
// (a seeded linear-congruential generator picks which parameter combinations
// to test — that's test infrastructure, not part of the scoring formula
// itself, which remains a pure function of stored state) and measures the
// actual collision rate.
process.env.DATABASE_FILE = './data/test-collisions.sqlite';
process.env.GAME_DURATION_SECONDS = '900';
process.env.INITIAL_LIVES = '5';
process.env.MAX_RECOVERIES = '3';

import fs from 'node:fs';
try { fs.unlinkSync('./data/test-collisions.sqlite'); } catch {}
try { fs.unlinkSync('./data/test-collisions.sqlite-wal'); } catch {}
try { fs.unlinkSync('./data/test-collisions.sqlite-shm'); } catch {}

const { db } = await import('../src/db/index.js');
const { calculateFinalScore } = await import('../src/engine/gameEngine.js');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}

// Deterministic seeded PRNG (mulberry32) -- reproducible across runs, and
// explicitly test-only infrastructure for picking which parameter
// combinations to simulate. Never used inside the scoring formula itself.
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(1234567);
const N = 1200; // "at least 1,000" per the requirement

// Build N deterministic simulated sessions as REAL rows (so progression score
// can be read from real level_results, exactly as it is in production),
// varying every dimension the score formula uses.
const teamIds = [];
const insertTeam = db.prepare(
  `INSERT INTO teams (id, team_name, member1, member2, contact, password_hash) VALUES (?, ?, 'A','B','x','x')`
);
const insertSession = db.prepare(
  `INSERT INTO game_sessions
    (id, team_id, status, current_level, lives, score, recovery_attempts, recovery_successes,
     started_at, completed_at, time_paused_seconds, game_duration_seconds, game_seed, level_states, behaviour_flags, agent_memory)
   VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 0, 900, ?, '{}', ?, '{}')`
);
const insertLevelResult = db.prepare(
  `INSERT INTO level_results (id, session_id, level, completed, score) VALUES (?, ?, ?, 1, ?)`
);
const LEVEL_POINTS = { 1: 1000, 2: 2000, 3: 3000, 4: 4000, 5: 5000 };

const insertMany = db.transaction((rows) => {
  for (const row of rows) {
    insertTeam.run(row.teamId, row.teamId);
    insertSession.run(
      row.sessionId, row.teamId, row.status, row.levelsReached, row.lives,
      row.recoveryAttempts, row.recoverySuccesses, row.startedAt, row.completedAt,
      row.sessionId, row.behaviourFlags
    );
    for (let lvl = 1; lvl <= row.levelsReached; lvl++) {
      insertLevelResult.run(`${row.sessionId}-lr${lvl}`, row.sessionId, lvl, LEVEL_POINTS[lvl]);
    }
  }
});

const rows = [];
for (let i = 0; i < N; i++) {
  const teamId = `coll-${i}`;
  const levelsReached = Math.floor(rng() * 6); // 0-5
  const completed = levelsReached === 5 && rng() < 0.5;
  const lives = Math.floor(rng() * 9); // 0-8 (initial 5 + up to 3 recovered)
  const recoveryAttempts = Math.floor(rng() * 4); // 0-3
  const recoverySuccesses = Math.min(recoveryAttempts, Math.floor(rng() * 4));
  const unnecessaryActions = Math.floor(rng() * 15); // 0-14
  // Elapsed time varies down to the millisecond across the full 15-minute window.
  const elapsedMs = Math.floor(rng() * 900000);
  const startedAt = new Date(0).toISOString().replace('Z', '');
  const completedAt = new Date(elapsedMs).toISOString().replace('Z', '');
  const actionCounts = {};
  // Spread unnecessaryActions across a few synthetic action names as repeats
  // beyond first use, matching how unnecessaryActionCount actually reads it.
  let remaining = unnecessaryActions;
  let idx = 0;
  while (remaining > 0) {
    const take = Math.min(remaining, 1 + Math.floor(rng() * 5));
    actionCounts[`ACTION_${idx++}`] = 1 + take; // count = 1 (first use) + `take` repeats
    remaining -= take;
  }
  rows.push({
    teamId,
    sessionId: `sess-${i}`,
    status: completed ? 'completed' : levelsReached === 5 ? 'failed' : i % 7 === 0 ? 'active' : 'failed',
    levelsReached,
    lives,
    recoveryAttempts,
    recoverySuccesses,
    startedAt,
    completedAt,
    behaviourFlags: JSON.stringify({ actionCounts }),
  });
}
insertMany(rows);

const scores = rows.map((row) => {
  const session = {
    id: row.sessionId,
    status: row.status,
    lives: row.lives,
    recovery_attempts: row.recoveryAttempts,
    started_at: row.startedAt,
    completed_at: row.completedAt,
    time_paused_seconds: 0,
    game_duration_seconds: 900,
    behaviour_flags: row.behaviourFlags,
  };
  return calculateFinalScore(session);
});

// ---- Basic sanity ----
check('all simulated scores are non-negative integers', scores.every((s) => Number.isInteger(s) && s >= 0));

// ---- Determinism: recomputing from the same stored state gives the same score ----
{
  const sample = { id: rows[0].sessionId, status: rows[0].status, lives: rows[0].lives, recovery_attempts: rows[0].recoveryAttempts, started_at: rows[0].startedAt, completed_at: rows[0].completedAt, time_paused_seconds: 0, game_duration_seconds: 900, behaviour_flags: rows[0].behaviourFlags };
  const a = calculateFinalScore(sample);
  const b = calculateFinalScore(sample);
  const c = calculateFinalScore(sample);
  check('identical game state produces identical score across repeated calls', a === b && b === c);
}

// ---- Different elapsed times (all else equal) produce different scores ----
{
  const base = { id: 'diff-time-base', status: 'completed', lives: 5, recovery_attempts: 0, started_at: new Date(0).toISOString().replace('Z', ''), time_paused_seconds: 0, game_duration_seconds: 900, behaviour_flags: '{}' };
  const s1 = calculateFinalScore({ ...base, completed_at: new Date(100000).toISOString().replace('Z', '') });
  const s2 = calculateFinalScore({ ...base, completed_at: new Date(100777).toISOString().replace('Z', '') }); // 777ms later
  check('different elapsed times (even sub-second) produce different scores', s1 !== s2);
}

// ---- The actual collision measurement ----
const counts = new Map();
for (const s of scores) counts.set(s, (counts.get(s) || 0) + 1);
const distinctScores = counts.size;
const collidingScores = [...counts.values()].filter((c) => c > 1);
const runsInvolvedInCollisions = collidingScores.reduce((a, b) => a + b, 0);
const collisionRate = runsInvolvedInCollisions / scores.length;

console.log(`\n--- Collision measurement across ${scores.length} simulated runs ---`);
console.log(`Distinct scores: ${distinctScores} / ${scores.length}`);
console.log(`Runs sharing a score with at least one other run: ${runsInvolvedInCollisions} (${(collisionRate * 100).toFixed(2)}%)`);

// DEBUG: show a couple of actual colliding groups to understand the cause.
const byScore = new Map();
rows.forEach((row, i) => {
  const s = scores[i];
  if (!byScore.has(s)) byScore.set(s, []);
  byScore.get(s).push(row);
});
let shown = 0;
for (const [score, group] of byScore) {
  if (group.length > 1 && shown < 3) {
    console.log(`\nScore ${score} shared by ${group.length} runs:`);
    group.slice(0, 4).forEach((r) => console.log('  ', JSON.stringify({ status: r.status, levelsReached: r.levelsReached, lives: r.lives, recoveryAttempts: r.recoveryAttempts, completedAt: r.completedAt, behaviourFlags: r.behaviourFlags })));
    shown++;
  }
}

// "Extremely rare" — set a generous but meaningful bar: well under 5% of runs
// should ever land on a score shared with another run, across a broad,
// randomly-sampled spread of realistic (and some edge-case) game outcomes.
check('collisions are extremely rare across 1,200+ varied simulated runs (< 5% of runs share a score)', collisionRate < 0.05);
check(`distinct-score ratio is high (>95% of runs have a score no other run has)`, distinctScores / scores.length > 0.95);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
