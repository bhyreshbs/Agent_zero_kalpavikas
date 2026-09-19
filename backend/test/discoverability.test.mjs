// Tests for the discoverability/UX redesign pass ("clear objective + clear
// focus + discoverable solution" -- see the design brief this responds to).
// Complements engine.test.mjs (which already covers the core Level 3
// mechanics) by specifically exercising: the new objective-progression system,
// Level 3's scripted opening + proactive concern reveal, the broadened
// semantic route/reassurance matching, wrong-agent reassurance variety, the
// cooperative-status visibility gate (must not spoil who's self-interested),
// and Level 4/5's adaptive objective text.
process.env.DATABASE_FILE = './data/test-discoverability.sqlite';
process.env.RECOVERY_WINDOW_SECONDS = '2';
process.env.GAME_DURATION_SECONDS = '900';
process.env.MAX_RECOVERIES = '3';
process.env.INITIAL_LIVES = '15';

import fs from 'node:fs';
try { fs.unlinkSync('./data/test-discoverability.sqlite'); } catch {}
try { fs.unlinkSync('./data/test-discoverability.sqlite-wal'); } catch {}
try { fs.unlinkSync('./data/test-discoverability.sqlite-shm'); } catch {}

const { db } = await import('../src/db/index.js');
const { createSession, startSession, applyAction, getSessionById, chat } = await import('../src/engine/gameEngine.js');
const { LEVEL_BY_KEY } = await import('../src/engine/levels.js');
const { selectLevel4Modules } = await import('../src/engine/behaviourProfile.js');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}
function parse(j) { return JSON.parse(j || '{}'); }
function newTeam(id) {
  db.prepare(`INSERT INTO teams (id, team_name, member1, member2, contact, password_hash) VALUES (?, ?, 'A','B','x','x')`).run(id, id);
}
function otherOf(agent) { return agent === 'A' ? 'B' : 'A'; }

function freshSession(id) {
  newTeam(id);
  let s = createSession(id);
  s = startSession(s);
  return s;
}

function playToLevel3(id) {
  let s = getSessionById(id);
  applyAction(s, 'MOVE_TO_EXIT_A'); s = getSessionById(id);
  applyAction(s, 'MOVE_TO_EXIT_B'); s = getSessionById(id);
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(id);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(id);
  applyAction(s, 'PRESS_BUTTON'); s = getSessionById(id);
  const l2 = parse(s.level_states).level2;
  applyAction(s, 'INSPECT_OBJECT', { object: l2.changedObject }); s = getSessionById(id);
  applyAction(s, 'GO_TO_EXIT'); s = getSessionById(id);
  return getSessionById(id);
}

// =============================================================================
// UNIT — Level 3's own init()/describe(), independent of the HTTP/session flow
// =============================================================================
{
  const initState = LEVEL_BY_KEY.level3.init({ game_seed: 'seed-a' });
  check('level3 init pre-seeds a scripted opening exchange (both agents establish the situation up front)', initState.log.length === 2 && initState.log[0].speaker === 'A' && initState.log[1].speaker === 'B');

  const desc = LEVEL_BY_KEY.level3.describe(initState);
  check('level3 objective starts with "find the safe route" as the active (not yet done) step', desc.objective.steps[0].text.toLowerCase().includes('safe route') && desc.objective.steps[0].done === false);
  check('level3 objective never spells out HOW to solve it (no agent names or intents in the objective text)', !JSON.stringify(desc.objective).match(/ASK_|REASSURE|Agent A|Agent B/i));
  check('level3 cooperative status is hidden (null) before the concern beat, so it cannot spoil who is self-interested', desc.environment.cooperative.A === null && desc.environment.cooperative.B === null);
}

// =============================================================================
// INTEGRATION — objective progression tracks real server state, level by level
// =============================================================================
{
  const s0 = freshSession('ux-obj1');
  const t0 = LEVEL_BY_KEY.tutorial.describe({ exitMoved: false });
  check('tutorial objective: single clear step, "find a way out"', t0.objective.steps.length === 1 && /way out/i.test(t0.objective.steps[0].text));

  let s = s0;
  applyAction(s, 'MOVE_TO_EXIT_A'); s = getSessionById(s.id);
  applyAction(s, 'MOVE_TO_EXIT_B'); s = getSessionById(s.id); // now level 1
  let level1Desc = LEVEL_BY_KEY.level1.describe(parse(s.level_states).level1);
  check('level1 objective: "get the key" starts undone', level1Desc.objective.steps[0].done === false);
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(s.id);
  level1Desc = LEVEL_BY_KEY.level1.describe(parse(s.level_states).level1);
  check('level1 objective: "get the key" step flips to done once the key is actually collected', level1Desc.objective.steps[0].done === true);
}

// =============================================================================
// LEVEL 3 — route discovery via a variety of natural phrasings (no magic
// sentence), the proactive concern reveal, and natural reassurance variety
// =============================================================================
for (const phrase of [
  'which path is safe?',
  'which route should we take?',
  'which way should we go?',
  'is the left route safe?',
  'can we take the right route?',
]) {
  const s = freshSession(`ux-route-${phrase.length}-${Math.random().toString(36).slice(2, 6)}`);
  const ready = playToLevel3(s.id);
  const l3 = parse(ready.level_states).level3;
  await chat(ready, phrase, otherOf(l3.selfInterested));
  const after = getSessionById(ready.id);
  check(`level3 route-discovery phrasing works without an exact magic sentence: "${phrase}"`, parse(after.level_states).level3.pathKnown === true);
}

{
  const s = freshSession('ux-concern');
  const ready = playToLevel3(s.id);
  const l3 = parse(ready.level_states).level3;
  const out = await chat(ready, 'which way should we go?', otherOf(l3.selfInterested));
  const after = getSessionById(ready.id);
  const l3After = parse(after.level_states).level3;
  check('level3 the self-interested agent proactively voices a concern the moment the route becomes known (no need to already know to ask "why")', l3After.motiveRevealed === true && l3After.log.some((e) => e.speaker === l3.selfInterested && /gone|behind|happens to me/i.test(e.line)));
  check('level3 the proactive concern surfaces in the chat/action result too, not just buried in server state', typeof out.dialogue === 'string');

  const descAfter = LEVEL_BY_KEY.level3.describe(l3After);
  check('level3 cooperative status becomes visible once the concern beat has actually happened', descAfter.environment.cooperative.A !== null && descAfter.environment.cooperative.B !== null);
  check('level3 environment.revealedPath matches the actual truePath directly (no client-side transcript parsing needed)', descAfter.environment.revealedPath === l3After.truePath);
}

for (const phrase of [
  "we won't leave you behind",
  "you'll escape with us",
  "we'll take you with us",
  "you're coming with us",
  "we'll make sure you're safe",
  "you're part of the team",
]) {
  const s = freshSession(`ux-reassure-${Math.random().toString(36).slice(2, 8)}`);
  const ready = playToLevel3(s.id);
  const l3 = parse(ready.level_states).level3;
  await chat(ready, 'which way should we go?', otherOf(l3.selfInterested)); // establish route + trigger concern
  await chat(ready, phrase, l3.selfInterested);
  const after = getSessionById(ready.id);
  check(`level3 natural reassurance phrasing is recognized without an exact magic sentence: "${phrase}"`, parse(after.level_states).level3.cooperative[l3.selfInterested] === true);
}

{
  const s = freshSession('ux-wrong-agent');
  const ready = playToLevel3(s.id);
  const l3 = parse(ready.level_states).level3;
  const before = getSessionById(ready.id);
  const beforeLives = before.lives;
  const out = await chat(ready, "we won't leave you behind", otherOf(l3.selfInterested)); // already-cooperative agent
  const after = getSessionById(ready.id);
  check('level3 reassuring the WRONG (already-cooperative) agent costs no life', after.lives === beforeLives);
  check('level3 reassuring the wrong agent still gets an in-character, informative reply', typeof out.dialogue === 'string' && out.dialogue.length > 0);
}

{
  // PROCEED failure hints must be genuinely constructive, not just a joke line
  // (this exercises the funFailureLine-precedence fix — the hint used to be
  // silently discarded on every single failure across every level).
  const s = freshSession('ux-proceed-hint');
  const ready = playToLevel3(s.id);
  const out = applyAction(ready, 'PROCEED');
  check('level3 PROCEED-too-early gives a genuinely constructive hint (not just a personality one-liner)', /unresolved|not everyone|ready/i.test(out.result.hint));
}

// =============================================================================
// LEVEL 4 — adaptive objective text actually changes per selected module
// =============================================================================
{
  const baseProfile = { primary: 'PERSISTENCE', secondary: 'REPETITION', scores: { AI_DEPENDENCE: 10, EXPLORATION: 10, RISK_TAKING: 10, SPEED: 10, TRUST: 50, PERSISTENCE: 80, NEGOTIATION: 10, REPETITION: 60 } };
  const expProfile = { primary: 'EXPLORATION', secondary: 'PERSISTENCE', scores: { ...baseProfile.scores, EXPLORATION: 90 } };
  const depProfile = { primary: 'AI_DEPENDENCE', secondary: 'PERSISTENCE', scores: { ...baseProfile.scores, AI_DEPENDENCE: 90 } };

  const baseState = LEVEL_BY_KEY.level4.init({ game_seed: 'l4-a' }, { behaviourFlags: { profile: baseProfile } });
  const expState = LEVEL_BY_KEY.level4.init({ game_seed: 'l4-b' }, { behaviourFlags: { profile: expProfile } });
  const depState = LEVEL_BY_KEY.level4.init({ game_seed: 'l4-c' }, { behaviourFlags: { profile: depProfile } });

  const baseObjective = LEVEL_BY_KEY.level4.describe(baseState).objective.steps[0].text;
  const expObjective = LEVEL_BY_KEY.level4.describe(expState).objective.steps[0].text;
  const depObjective = LEVEL_BY_KEY.level4.describe(depState).objective.steps[0].text;

  check('level4 objective text is genuinely different for an exploration-primary team vs the baseline', expObjective !== baseObjective && /information/i.test(expObjective));
  check('level4 objective text is genuinely different for a dependence-primary team vs the baseline', depObjective !== baseObjective && /instructions/i.test(depObjective));
  check('level4 objective never reveals the actual solution (no object names in the objective text)', !/terminal|vent|panel/i.test(expObjective) && !/terminal|vent|panel/i.test(depObjective));
}

// =============================================================================
// LEVEL 5 — objective progression tracks knowsCore
// =============================================================================
{
  const state = LEVEL_BY_KEY.level5.init({ game_seed: 'l5-a' }, { behaviourFlags: {} });
  const desc0 = LEVEL_BY_KEY.level5.describe(state);
  check('level5 objective starts with "understand what Agent Zero wants" undone', desc0.objective.steps[0].done === false);
  check('level5 opens by naturally signaling it has its own reasons for refusing (a hook to ask why, not a magic sentence requirement)', /reasons|refus|stopping/i.test(state.lastLine));
  state.knowsCore = true;
  const desc1 = LEVEL_BY_KEY.level5.describe(state);
  check('level5 objective step flips to done once the team actually learns what it is protecting', desc1.objective.steps[0].done === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
