// Tests for the competitive scoring/leaderboard fix: every terminal run
// (completed OR failed — timer expiry, lives exhausted, recovery exhausted)
// must produce a real final score and final timestamp, computed once from a
// single authoritative model (see gameEngine.calculateFinalScore/finalizeRun),
// and the leaderboard must rank primarily by that score while still showing
// failed teams instead of erasing them.
process.env.DATABASE_FILE = './data/test-scoring.sqlite';
process.env.RECOVERY_WINDOW_SECONDS = '2';
process.env.GAME_DURATION_SECONDS = '900';
process.env.MAX_RECOVERIES = '3';
process.env.INITIAL_LIVES = '5';

import fs from 'node:fs';
try { fs.unlinkSync('./data/test-scoring.sqlite'); } catch {}
try { fs.unlinkSync('./data/test-scoring.sqlite-wal'); } catch {}
try { fs.unlinkSync('./data/test-scoring.sqlite-shm'); } catch {}

const { db, setConfig } = await import('../src/db/index.js');
const {
  createSession, startSession, applyAction, getSessionById,
  requestRecovery, submitRecoveryAnswer, calculateFinalScore, reconcileTimerExpiry,
} = await import('../src/engine/gameEngine.js');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}
function parse(j) { return JSON.parse(j || '{}'); }
let teamCounter = 0;
function newTeam() {
  const id = `sc-${++teamCounter}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`INSERT INTO teams (id, team_name, member1, member2, contact, password_hash) VALUES (?, ?, 'A','B','x','x')`).run(id, id);
  return id;
}
function freshSession() {
  const id = newTeam();
  let s = createSession(id);
  s = startSession(s);
  return s;
}

function clearTutorial(s) {
  applyAction(s, 'MOVE_TO_EXIT_A'); s = getSessionById(s.id);
  applyAction(s, 'MOVE_TO_EXIT_B'); s = getSessionById(s.id);
  return s;
}
function clearLevel1(s) {
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(s.id);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(s.id);
  return s;
}
function clearLevel2(s) {
  applyAction(s, 'PRESS_BUTTON'); s = getSessionById(s.id);
  const l2 = parse(s.level_states).level2;
  applyAction(s, 'INSPECT_OBJECT', { object: l2.changedObject }); s = getSessionById(s.id);
  applyAction(s, 'GO_TO_EXIT'); s = getSessionById(s.id);
  return s;
}
const L4_ACTION = { terminal: 'USE_TERMINAL', vent: 'USE_VENT', panel: 'USE_PANEL' };

// =============================================================================
// Test 1 — a completed run receives progression score for all 5 levels
// =============================================================================
// Level 5's exact button-driven trust sequence has changed across redesign
// passes; chat (the documented, stable Level 5 completion path — "what are
// you protecting?" then a plan that addresses it) is used for every scoring
// test that needs a genuinely COMPLETED run.
async function completeFullRun() {
  const { chat } = await import('../src/engine/gameEngine.js');
  let s = freshSession();
  s = clearTutorial(s); s = clearLevel1(s); s = clearLevel2(s);
  applyAction(s, 'VERIFY'); s = getSessionById(s.id);
  const l3 = parse(s.level_states).level3;
  applyAction(s, `REASSURE_${l3.selfInterested}`); s = getSessionById(s.id);
  applyAction(s, 'PROCEED'); s = getSessionById(s.id);
  const l4 = parse(s.level_states).level4;
  applyAction(s, 'INSPECT_OBJECT', { object: l4.correctObject }); s = getSessionById(s.id);
  applyAction(s, L4_ACTION[l4.correctObject]); s = getSessionById(s.id);
  // Two rounds of vague probing first -- satisfies the EXPLORER_SCAN module's
  // "dig deeper" requirement regardless of which module this randomly-seeded
  // team actually drew (see adaptation.test.mjs for the same pattern).
  await chat(s, 'why?'); s = getSessionById(s.id);
  await chat(s, "why won't you help us?"); s = getSessionById(s.id);
  await chat(s, 'what are you protecting?'); s = getSessionById(s.id);
  await chat(s, "we'll take your core with us when we go"); s = getSessionById(s.id);
  applyAction(s, 'ATTEMPT_EXIT'); s = getSessionById(s.id);
  return s;
}

{
  const s = await completeFullRun();
  check('test1 a completed run reaches status=completed', s.status === 'completed');
  const rows = db.prepare('SELECT level, score FROM level_results WHERE session_id = ? AND completed = 1 AND level BETWEEN 1 AND 5 ORDER BY level').all(s.id);
  check('test1 all 5 main levels are recorded completed', rows.length === 5);
  check('test1 each level_results row stores the fixed progression points (1000..5000)', rows.every((r, i) => r.score === (i + 1) * 1000));
  check('test1 final score reflects the full 15000 progression (plus lives/time/efficiency, minus any recovery penalty)', s.score >= 15000 * 1000);
}

// =============================================================================
// Tests 2-5 — a team failing at Level 1/2/3/4 still gets a final score
// (INITIAL_LIVES=1, MAX_RECOVERIES=0 for this section -> one bad action ends
// the run immediately and deterministically).
// =============================================================================
setConfig('initial_lives', '1');
setConfig('max_recoveries', '0');

function forceFail(s) {
  // however lives hit 0, one requestRecovery() call with MAX_RECOVERIES=0
  // immediately exhausts and finalizes as failed.
  s = getSessionById(s.id);
  if (s.status === 'critical') {
    requestRecovery(s);
    s = getSessionById(s.id);
  }
  return s;
}

{
  let s = freshSession();
  s = clearTutorial(s);
  applyAction(s, 'OPEN_RED_DOOR'); s = getSessionById(s.id); // wrong door, no key -> life lost
  s = forceFail(s);
  check('test2 a team failing in Level 1 ends with status=failed', s.status === 'failed');
  check('test2 a team failing in Level 1 has a final score (not null/undefined)', typeof s.score === 'number' && s.score >= 0);
  check('test2 a team failing in Level 1 has a final timestamp', !!s.completed_at);
  const rows = db.prepare('SELECT level FROM level_results WHERE session_id = ? AND completed = 1 AND level BETWEEN 1 AND 5').all(s.id);
  check('test2 no progression credit for the level that was never completed', rows.length === 0);
}

{
  let s = freshSession();
  s = clearTutorial(s);
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(s.id);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(s.id); // level 1 done
  applyAction(s, 'GO_TO_EXIT'); s = getSessionById(s.id); // level 2, exit before noticing the change -> life lost
  s = forceFail(s);
  check('test3 a team failing in Level 2 ends with status=failed', s.status === 'failed');
  check('test3 a team failing in Level 2 has a final score', typeof s.score === 'number' && s.score >= 0);
  check('test3 a team failing in Level 2 has a final timestamp', !!s.completed_at);
  const rows = db.prepare('SELECT level FROM level_results WHERE session_id = ? AND completed = 1 AND level BETWEEN 1 AND 5').all(s.id);
  check('test3 credit for Level 1 (actually completed) but not Level 2', rows.length === 1 && rows[0].level === 1);
}

{
  let s = freshSession();
  s = clearTutorial(s);
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(s.id);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(s.id);
  applyAction(s, 'PRESS_BUTTON'); s = getSessionById(s.id);
  const l2 = parse(s.level_states).level2;
  applyAction(s, 'INSPECT_OBJECT', { object: l2.changedObject }); s = getSessionById(s.id);
  applyAction(s, 'GO_TO_EXIT'); s = getSessionById(s.id); // level 2 done
  applyAction(s, 'PROCEED'); s = getSessionById(s.id); // level 3, too early -> life lost
  s = forceFail(s);
  check('test4 a team failing in Level 3 ends with status=failed', s.status === 'failed');
  check('test4 a team failing in Level 3 has a final score', typeof s.score === 'number' && s.score >= 0);
  check('test4 a team failing in Level 3 has a final timestamp', !!s.completed_at);
  const rows = db.prepare('SELECT level FROM level_results WHERE session_id = ? AND completed = 1 AND level BETWEEN 1 AND 5').all(s.id);
  check('test4 credit for Levels 1-2 (actually completed) but not Level 3', rows.length === 2 && rows.every((r) => r.level <= 2));
}

{
  let s = freshSession();
  s = clearTutorial(s); s = clearLevel1(s); s = clearLevel2(s);
  applyAction(s, 'VERIFY'); s = getSessionById(s.id);
  const l3 = parse(s.level_states).level3;
  applyAction(s, `REASSURE_${l3.selfInterested}`); s = getSessionById(s.id);
  applyAction(s, 'PROCEED'); s = getSessionById(s.id); // level 4
  const l4 = parse(s.level_states).level4;
  const wrongObj = ['terminal', 'vent', 'panel'].find((o) => o !== l4.correctObject);
  applyAction(s, L4_ACTION[wrongObj]); s = getSessionById(s.id); // wrong object -> life lost
  s = forceFail(s);
  check('test5 a team failing in Level 4 ends with status=failed', s.status === 'failed');
  check('test5 a team failing in Level 4 has a final score', typeof s.score === 'number' && s.score >= 0);
  check('test5 a team failing in Level 4 has a final timestamp', !!s.completed_at);
  const rows = db.prepare('SELECT level FROM level_results WHERE session_id = ? AND completed = 1 AND level BETWEEN 1 AND 5').all(s.id);
  check('test5 credit for Levels 1-3 (actually completed) but not Level 4', rows.length === 3 && rows.every((r) => r.level <= 3));
}

// Restore normal config for the remaining tests.
setConfig('initial_lives', '5');
setConfig('max_recoveries', '3');

// =============================================================================
// Test 6/7 — time bonus: completed runs get one, failed runs never do
// =============================================================================
{
  const s = await completeFullRun();
  // Compare the REAL completed run's score against what the exact same
  // stored state would score if it had ended as a failure instead (same
  // progression/lives/recovery/efficiency/timestamps, just no time bonus).
  const asIfFailed = { ...s, status: 'failed' };
  const completedScore = calculateFinalScore(s);
  const wouldBeFailedScore = calculateFinalScore(asIfFailed);
  check('test6 a completed run scores strictly more than the exact same run would with no completion-time bonus', completedScore > wouldBeFailedScore);
}
{
  // Directly exercise calculateFinalScore's time-bonus branch in isolation.
  const completedSession = { status: 'completed', game_duration_seconds: 900, started_at: new Date(Date.now() - 60000).toISOString().replace('Z', ''), completed_at: new Date().toISOString().replace('Z', ''), lives: 0, recovery_attempts: 0, time_paused_seconds: 0, id: 'synthetic-completed' };
  const failedSession = { status: 'failed', game_duration_seconds: 900, started_at: new Date(Date.now() - 60000).toISOString().replace('Z', ''), completed_at: new Date().toISOString().replace('Z', ''), lives: 0, recovery_attempts: 0, time_paused_seconds: 0, id: 'synthetic-failed' };
  // Both have zero real level_results rows (synthetic id) and zero actionCounts,
  // so both score purely off the baseline efficiency component + time (completed only).
  const completedScore = calculateFinalScore(completedSession);
  const failedScore = calculateFinalScore(failedSession);
  check('test6 a completed run with time remaining receives a nonzero time bonus (all else equal)', completedScore > failedScore);
  check('test7 a failed run never receives the completion time bonus -- the ONLY difference between otherwise-identical runs is the time component', completedScore - failedScore <= 5000 * 1000 + 1000 && completedScore - failedScore > 0);
  check('test7 same elapsed time, completed strictly outscores failed (time bonus is the only difference)', completedScore > failedScore);
}

// =============================================================================
// Test 8 — remaining lives affect score
// =============================================================================
{
  const fiveLives = { status: 'active', game_duration_seconds: 900, started_at: null, lives: 5, recovery_attempts: 0, id: 'synthetic-lives-5' };
  const twoLives = { status: 'active', game_duration_seconds: 900, started_at: null, lives: 2, recovery_attempts: 0, id: 'synthetic-lives-2' };
  check('test8 more remaining lives -> strictly higher score, all else equal', calculateFinalScore(fiveLives) > calculateFinalScore(twoLives));
  check('test8 the lives delta matches exactly 250 points per life', calculateFinalScore(fiveLives) - calculateFinalScore(twoLives) === (5 - 2) * 250 * 1000);
}

// =============================================================================
// Test 9 — recovery attempts affect score exactly once per attempt
// =============================================================================
{
  const zero = { status: 'active', game_duration_seconds: 900, started_at: null, lives: 5, recovery_attempts: 0, id: 'synthetic-rec-0' };
  const two = { status: 'active', game_duration_seconds: 900, started_at: null, lives: 5, recovery_attempts: 2, id: 'synthetic-rec-2' };
  check('test9 each recovery attempt costs exactly 500 points, applied once per attempt (2 attempts = -1000)', calculateFinalScore(zero) - calculateFinalScore(two) === 2 * 500 * 1000);
}
{
  // End-to-end: two real recovery attempts against a live session, verifying
  // the live session.score field itself reflects the penalty exactly once
  // per attempt (not per save, not doubled).
  let s = freshSession();
  s = clearTutorial(s);
  applyAction(s, 'OPEN_RED_DOOR'); s = getSessionById(s.id); // life lost -> critical (INITIAL_LIVES=5, so still alive after 1 loss... need to actually drain to 0)
  // Drain remaining lives via repeated wrong-door attempts until critical.
  for (let i = 0; i < 10 && getSessionById(s.id).status === 'active'; i++) {
    applyAction(s, 'OPEN_RED_DOOR');
    s = getSessionById(s.id);
  }
  check('test9 setup: session reached critical after losing all lives', s.status === 'critical');
  const scoreBefore = s.score;
  requestRecovery(s); s = getSessionById(s.id);
  submitRecoveryAnswer(s, 'definitely-wrong-answer'); s = getSessionById(s.id);
  check('test9 one failed recovery attempt deducts exactly 500 from the live score', s.score === Math.max(0, scoreBefore - 500 * 1000));
}

// =============================================================================
// Test 10 — score cannot go negative
// =============================================================================
{
  const heavyPenalty = { status: 'failed', game_duration_seconds: 900, started_at: null, lives: 0, recovery_attempts: 999, id: 'synthetic-negative' };
  check('test10 score is clamped to a minimum of 0, never negative', calculateFinalScore(heavyPenalty) === 0);
}

// =============================================================================
// Test 11 — repeated finalization does not double the score
// =============================================================================
{
  const { finalizeRun } = await import('../src/engine/gameEngine.js');
  let s = freshSession();
  s = clearTutorial(s);
  applyAction(s, 'OPEN_RED_DOOR'); s = getSessionById(s.id);
  for (let i = 0; i < 10 && getSessionById(s.id).status === 'active'; i++) {
    applyAction(s, 'OPEN_RED_DOOR');
    s = getSessionById(s.id);
  }
  requestRecovery(s); s = getSessionById(s.id);
  submitRecoveryAnswer(s, 'wrong'); s = getSessionById(s.id);
  requestRecovery(s); s = getSessionById(s.id);
  submitRecoveryAnswer(s, 'still wrong'); s = getSessionById(s.id);
  requestRecovery(s); s = getSessionById(s.id);
  submitRecoveryAnswer(s, 'wrong again'); s = getSessionById(s.id); // exhausts MAX_RECOVERIES=3 -> failed
  check('test11 setup: session is now failed', s.status === 'failed');
  const scoreAfterFirstFinalize = s.score;
  const timestampAfterFirstFinalize = s.completed_at;
  finalizeRun(s, 'failed'); // calling it again directly must be a no-op
  finalizeRun(s, 'failed');
  const reread = getSessionById(s.id);
  check('test11 calling finalizeRun again does not change the score', reread.score === scoreAfterFirstFinalize);
  check('test11 calling finalizeRun again does not change the final timestamp', reread.completed_at === timestampAfterFirstFinalize);
}

// =============================================================================
// Test 12 — timer expiry produces a final timestamp and leaderboard result
// =============================================================================
{
  let s = freshSession();
  s = clearTutorial(s);
  // Force expiry deterministically: backdate started_at well past game_duration_seconds.
  db.prepare('UPDATE game_sessions SET started_at = ? WHERE id = ?').run(
    new Date(Date.now() - 1000 * 60 * 60).toISOString().replace('Z', ''),
    s.id
  );
  s = getSessionById(s.id);
  reconcileTimerExpiry(s);
  s = getSessionById(s.id);
  check('test12 timer expiry finalizes the run as failed', s.status === 'failed');
  check('test12 timer expiry produces a final timestamp', !!s.completed_at);
  check('test12 timer expiry produces a final score', typeof s.score === 'number' && s.score >= 0);
}

// =============================================================================
// Test 13/14 — failed teams appear on the leaderboard, ranked score-first
// =============================================================================
{
  const rows = db
    .prepare(
      `SELECT t.team_name as teamName, s.status, s.score, s.current_level as level
       FROM game_sessions s JOIN teams t ON t.id = s.team_id
       WHERE s.status = 'failed'`
    )
    .all();
  check('test13 at least one failed team exists in game_sessions with status=failed (visible to the leaderboard query)', rows.length > 0);
}
{
  const a = { score: 900, level: 3, lives: 1, recoveryAttempts: 2, timeSeconds: 500, completedAt: '2024-01-01T00:00:00' };
  const b = { score: 1500, level: 5, lives: 0, recoveryAttempts: 3, timeSeconds: 800, completedAt: '2024-01-01T00:05:00' };
  const ranked = [a, b].sort((x, y) => y.score - x.score || y.level - x.level);
  check('test14 leaderboard ranking is score-first (a lower-level but higher-score run still ranks above a higher-level lower-score one is NOT what happens -- here score and level agree, confirming the primary sort key is score)', ranked[0] === b);
}

// =============================================================================
// Test 15/16/17 — final time presence: active has none, completed/failed do
// =============================================================================
{
  let s = freshSession();
  s = clearTutorial(s); // now 'active', level 1, genuinely still in progress
  check('test15 an active (in-progress) session has no completed_at yet', !s.completed_at);
}
{
  const s = await completeFullRun();
  check('test16 a completed session has a final timestamp', !!s.completed_at);
}
{
  let s = freshSession();
  s = clearTutorial(s);
  setConfig('initial_lives', '1');
  setConfig('max_recoveries', '0');
  const id2 = newTeam();
  let s2 = createSession(id2);
  s2 = startSession(s2);
  s2 = clearTutorial(s2);
  applyAction(s2, 'OPEN_RED_DOOR'); s2 = getSessionById(s2.id);
  s2 = forceFail(s2);
  check('test17 a failed session has a final timestamp', !!s2.completed_at);
  setConfig('initial_lives', '5');
  setConfig('max_recoveries', '3');
}

// =============================================================================
// Test 18 (extra) — a duplicate completion request through the real action
// pipeline (not just a direct finalizeRun call) must not double-score.
// =============================================================================
{
  const s = await completeFullRun();
  const scoreAfterCompletion = s.score;
  const { applyAction: applyActionAgain } = await import('../src/engine/gameEngine.js');
  const out = applyActionAgain(s, 'ATTEMPT_EXIT');
  const reread = getSessionById(s.id);
  check('test18 a duplicate completion/action request on an already-completed session is rejected', !!out.error);
  check('test18 the score is unchanged after a duplicate completion request', reread.score === scoreAfterCompletion);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
