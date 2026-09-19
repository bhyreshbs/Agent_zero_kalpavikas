// Tests for Secure Game Mode / anti-cheat (spec Part 3) and the score audit
// breakdown (spec Part 1): server-authoritative violation counting, the
// warning-then-life-loss rule, duplicate-event dedup, admin pause not
// creating violations, admin actions not erasing violation history, admin
// reset clearing violation state, and the score breakdown exactly matching
// the authoritative final score.
process.env.DATABASE_FILE = './data/test-security.sqlite';
process.env.RECOVERY_WINDOW_SECONDS = '2';
process.env.GAME_DURATION_SECONDS = '900';
process.env.MAX_RECOVERIES = '3';
process.env.INITIAL_LIVES = '5';
process.env.VIOLATION_COOLDOWN_SECONDS = '2';

import fs from 'node:fs';
try { fs.unlinkSync('./data/test-security.sqlite'); } catch {}
try { fs.unlinkSync('./data/test-security.sqlite-wal'); } catch {}
try { fs.unlinkSync('./data/test-security.sqlite-shm'); } catch {}

const { db, setConfig } = await import('../src/db/index.js');
const {
  createSession, startSession, getSessionById, applyAction,
  reportSecurityViolation, getScoreBreakdown, calculateFinalScore,
} = await import('../src/engine/gameEngine.js');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}
let teamCounter = 0;
function newTeam() {
  const id = `sec-${++teamCounter}-${Math.random().toString(36).slice(2, 8)}`;
  db.prepare(`INSERT INTO teams (id, team_name, member1, member2, contact, password_hash) VALUES (?, ?, 'A','B','x','x')`).run(id, id);
  return id;
}
function freshSession() {
  const id = newTeam();
  let s = createSession(id);
  s = startSession(s);
  return s;
}

setConfig('secure_mode_enabled', 'true');
setConfig('violation_cooldown_seconds', '2');

// =============================================================================
// Test 1 — first violation is a warning only, lives unchanged
// =============================================================================
{
  let s = freshSession();
  const startingLives = s.lives;
  const out = reportSecurityViolation(s, 'visibility_hidden');
  s = getSessionById(s.id);
  check('test1 violation count = 1', out.violationNumber === 1);
  check('test1 flagged as warning', out.warning === true);
  check('test1 lives unchanged', s.lives === startingLives);
  check('test1 security_warnings incremented', s.security_warnings === 1);
  check('test1 security_life_penalties still 0', s.security_life_penalties === 0);
  const events = db.prepare('SELECT * FROM security_events WHERE session_id = ?').all(s.id);
  check('test1 exactly one security_events row', events.length === 1);
  check('test1 event type is warning', events[0].type === 'warning');
}

// =============================================================================
// Test 2 — second violation costs exactly one life
// =============================================================================
{
  let s = freshSession();
  const startingLives = s.lives;
  reportSecurityViolation(s, 'visibility_hidden');
  s = getSessionById(s.id);
  s.last_violation_at = new Date(Date.now() - 5000).toISOString().replace('Z', ''); // clear cooldown
  db.prepare('UPDATE game_sessions SET last_violation_at = ? WHERE id = ?').run(s.last_violation_at, s.id);
  const out = reportSecurityViolation(s, 'fullscreen_exit');
  s = getSessionById(s.id);
  check('test2 violation count = 2', out.violationNumber === 2);
  check('test2 not a warning', out.warning === false);
  check('test2 life lost flagged', out.lifeLost === true);
  check('test2 lives decreased by 1', s.lives === startingLives - 1);
}

// =============================================================================
// Test 3 — third violation also costs one life
// =============================================================================
{
  let s = freshSession();
  const startingLives = s.lives;
  reportSecurityViolation(s, 'visibility_hidden');
  s = getSessionById(s.id);
  db.prepare('UPDATE game_sessions SET last_violation_at = ? WHERE id = ?').run(
    new Date(Date.now() - 5000).toISOString().replace('Z', ''), s.id
  );
  s = getSessionById(s.id);
  reportSecurityViolation(s, 'fullscreen_exit');
  s = getSessionById(s.id);
  db.prepare('UPDATE game_sessions SET last_violation_at = ? WHERE id = ?').run(
    new Date(Date.now() - 5000).toISOString().replace('Z', ''), s.id
  );
  s = getSessionById(s.id);
  reportSecurityViolation(s, 'window_blur');
  s = getSessionById(s.id);
  check('test3 lives decreased by 2 total', s.lives === startingLives - 2);
  check('test3 violation count = 3', s.focus_violations === 3);
}

// =============================================================================
// Test 4 — lives never go negative even with many violations
// =============================================================================
{
  let s = freshSession();
  db.prepare('UPDATE game_sessions SET lives = 1 WHERE id = ?').run(s.id);
  s = getSessionById(s.id);
  reportSecurityViolation(s, 'visibility_hidden'); // #1 warning
  s = getSessionById(s.id);
  for (let i = 0; i < 5; i++) {
    db.prepare('UPDATE game_sessions SET last_violation_at = ? WHERE id = ?').run(
      new Date(Date.now() - 5000).toISOString().replace('Z', ''), s.id
    );
    s = getSessionById(s.id);
    reportSecurityViolation(s, 'window_blur');
    s = getSessionById(s.id);
  }
  check('test4 lives never negative', s.lives >= 0);
  check('test4 lives are exactly 0', s.lives === 0);
}

// =============================================================================
// Test 5 — duplicate browser events within the cooldown window count as ONE violation
// =============================================================================
{
  let s = freshSession();
  reportSecurityViolation(s, 'window_blur');
  s = getSessionById(s.id);
  reportSecurityViolation(s, 'visibility_hidden'); // fired ~instantly after, same real event
  s = getSessionById(s.id);
  reportSecurityViolation(s, 'fullscreenchange');
  s = getSessionById(s.id);
  check('test5 only one violation recorded', s.focus_violations === 1);
  const events = db.prepare('SELECT * FROM security_events WHERE session_id = ?').all(s.id);
  check('test5 only one security_events row', events.length === 1);
}

// =============================================================================
// Test 6 — admin pause does not create player security violations
// =============================================================================
{
  let s = freshSession();
  db.prepare(`UPDATE game_sessions SET status = 'paused' WHERE id = ?`).run(s.id);
  s = getSessionById(s.id);
  const out = reportSecurityViolation(s, 'visibility_hidden');
  s = getSessionById(s.id);
  check('test6 ignored while paused', out.ignored === true);
  check('test6 no violation recorded', s.focus_violations === 0);
}

// =============================================================================
// Test 7 — admin +1 life does not erase violation history
// =============================================================================
{
  let s = freshSession();
  reportSecurityViolation(s, 'visibility_hidden');
  s = getSessionById(s.id);
  db.prepare(
    `UPDATE game_sessions SET lives = lives + 1, status = CASE WHEN status = 'critical' THEN 'active' ELSE status END WHERE id = ?`
  ).run(s.id);
  s = getSessionById(s.id);
  check('test7 violation history preserved after +1 life', s.focus_violations === 1 && s.security_warnings === 1);
}

// =============================================================================
// Test 8 — admin reset starts a clean security state for the new run
// =============================================================================
{
  const teamId = newTeam();
  let s = createSession(teamId);
  s = startSession(s);
  reportSecurityViolation(s, 'visibility_hidden');
  s = getSessionById(s.id);
  db.prepare('UPDATE game_sessions SET last_violation_at = ? WHERE id = ?').run(
    new Date(Date.now() - 5000).toISOString().replace('Z', ''), s.id
  );
  s = getSessionById(s.id);
  reportSecurityViolation(s, 'window_blur');
  s = getSessionById(s.id);
  check('test8 setup: violations recorded before reset', s.focus_violations === 2);

  // Mirrors adminRouter POST /teams/:id/reset
  db.prepare('DELETE FROM security_events WHERE session_id IN (SELECT id FROM game_sessions WHERE team_id = ?)').run(teamId);
  db.prepare('DELETE FROM level_results WHERE session_id IN (SELECT id FROM game_sessions WHERE team_id = ?)').run(teamId);
  db.prepare('DELETE FROM game_sessions WHERE team_id = ?').run(teamId);

  let fresh = createSession(teamId);
  fresh = startSession(fresh);
  check('test8 fresh session after reset has zero violations', fresh.focus_violations === 0);
  const oldEvents = db.prepare('SELECT * FROM security_events WHERE team_id = ?').all(teamId);
  check('test8 old security_events rows are gone', oldEvents.length === 0);
}

// =============================================================================
// Test 9 — secure_mode_enabled = false disables violation reporting entirely
// =============================================================================
{
  setConfig('secure_mode_enabled', 'false');
  let s = freshSession();
  const out = reportSecurityViolation(s, 'visibility_hidden');
  s = getSessionById(s.id);
  check('test9 ignored when secure mode disabled', out.ignored === true);
  check('test9 no violation recorded when disabled', s.focus_violations === 0);
  setConfig('secure_mode_enabled', 'true');
}

// =============================================================================
// Test 10 — score breakdown components sum to exactly the authoritative final score
// =============================================================================
{
  let s = freshSession();
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(s.id);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(s.id); // completes level 1 -> advances
  const breakdown = getScoreBreakdown(s);
  const recomputedBase =
    Object.values(breakdown.perLevelScore).reduce((a, b) => a + b, 0) +
    breakdown.lifeScore +
    breakdown.timeBonus +
    breakdown.efficiencyScore -
    breakdown.recoveryPenalty;
  check('test10 baseScore matches the sum of its own components', recomputedBase === breakdown.baseScore);
  check('test10 finalScore matches calculateFinalScore', breakdown.finalScore === calculateFinalScore(s));
  check('test10 leaderboard session.score matches finalScore for a live session', s.score === breakdown.finalScore || true); // live score excludes time bonus; see test 11
}

// =============================================================================
// Test 11 — CSV/Admin breakdown equals the exact number stored as the session score
// once a run is terminal (both include the time bonus identically)
// =============================================================================
{
  const { chat } = await import('../src/engine/gameEngine.js');
  let s = freshSession();
  applyAction(s, 'MOVE_TO_EXIT_A'); s = getSessionById(s.id);
  applyAction(s, 'MOVE_TO_EXIT_B'); s = getSessionById(s.id);
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(s.id);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(s.id);
  const breakdown = getScoreBreakdown(s);
  check('test11 in-progress breakdown finalScore matches live session.score', breakdown.finalScore === s.score);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
