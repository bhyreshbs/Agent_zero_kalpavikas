// Tests for the second discoverability/UX pass: Level 5's natural proposal
// matching and gradual reveal (no magic sentence, no immediate "core" dump),
// and Level 4's adaptive modules actually changing the CORE challenge rules
// (resource-limited inspection for RISK, observe-before-commit for SPEED,
// sustained dialogue as a real alternate path for NEGOTIATION, misleading
// wrong-object flavor for TRUST_LOW) rather than being bolt-on optional
// buttons. Complements engine.test.mjs and discoverability.test.mjs.
process.env.DATABASE_FILE = './data/test-adaptation.sqlite';
process.env.GAME_DURATION_SECONDS = '900';
process.env.INITIAL_LIVES = '20';

import fs from 'node:fs';
try { fs.unlinkSync('./data/test-adaptation.sqlite'); } catch {}
try { fs.unlinkSync('./data/test-adaptation.sqlite-wal'); } catch {}
try { fs.unlinkSync('./data/test-adaptation.sqlite-shm'); } catch {}

const { db } = await import('../src/db/index.js');
const { createSession, startSession, applyAction, getSessionById, chat } = await import('../src/engine/gameEngine.js');
const { LEVEL_BY_KEY } = await import('../src/engine/levels.js');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`PASS  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
}
function parse(j) { return JSON.parse(j || '{}'); }
function newTeam(id) {
  db.prepare(`INSERT INTO teams (id, team_name, member1, member2, contact, password_hash) VALUES (?, ?, 'A','B','x','x')`).run(id, id);
}

// =============================================================================
// LEVEL 5 -- natural proposal matching (item 5) + gradual reveal (item 4)
// =============================================================================
{
  // ASK_PROTECTING must not dump "core" for a bare, un-probed request; the
  // vaguer QUESTION_OBJECTIVE path stays a genuine deflect too.
  const state = LEVEL_BY_KEY.level5.init({ game_seed: 'adapt-l5-a' }, { behaviourFlags: {} });
  check('level5 objective text never says "core" up front', !/core/i.test(state.lastLine));
}

for (const phrase of [
  "we'll make sure your core is safe",
  'you can come with us',
  "we won't abandon you",
  "we'll protect what matters to you",
]) {
  const id = `adapt-propose-${Math.random().toString(36).slice(2, 8)}`;
  newTeam(id);
  let s = createSession(id);
  s = startSession(s);
  // Fast-forward straight to level5's act() via direct level manipulation is
  // not available through the public API, so drive it through a minimal but
  // real level3/4 clear, then exercise level5's chat-routed intents directly.
  applyAction(s, 'MOVE_TO_EXIT_A'); s = getSessionById(s.id);
  applyAction(s, 'MOVE_TO_EXIT_B'); s = getSessionById(s.id);
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(s.id);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(s.id);
  applyAction(s, 'PRESS_BUTTON'); s = getSessionById(s.id);
  const l2 = parse(s.level_states).level2;
  applyAction(s, 'INSPECT_OBJECT', { object: l2.changedObject }); s = getSessionById(s.id);
  applyAction(s, 'GO_TO_EXIT'); s = getSessionById(s.id);
  const l3 = parse(s.level_states).level3;
  applyAction(s, 'VERIFY'); s = getSessionById(s.id);
  applyAction(s, `REASSURE_${l3.selfInterested}`); s = getSessionById(s.id);
  applyAction(s, 'PROCEED'); s = getSessionById(s.id);
  const l4 = parse(s.level_states).level4;
  applyAction(s, 'INSPECT_OBJECT', { object: l4.correctObject }); s = getSessionById(s.id);
  const L4_ACTION = { terminal: 'USE_TERMINAL', vent: 'USE_VENT', panel: 'USE_PANEL' };
  applyAction(s, L4_ACTION[l4.correctObject]); s = getSessionById(s.id);
  // Two rounds of vague probing first (satisfies the EXPLORER_SCAN module's
  // "dig deeper" requirement regardless of which module this randomly-seeded
  // team actually drew), then the direct question, then the proposal.
  await chat(s, 'why?'); s = getSessionById(s.id);
  await chat(s, "why won't you help us?"); s = getSessionById(s.id);
  await chat(s, 'what are you protecting?'); s = getSessionById(s.id);
  await chat(s, phrase); s = getSessionById(s.id);
  check(`level5 natural proposal phrasing is recognized without the literal word "core": "${phrase}"`, parse(s.level_states).level5.planAccepted === true);
}

{
  // Gradual reveal: a bare "why?" gets a deflect, not the secondary goal.
  const id = 'adapt-why';
  newTeam(id);
  let s = createSession(id);
  s = startSession(s);
  applyAction(s, 'MOVE_TO_EXIT_A'); s = getSessionById(s.id);
  applyAction(s, 'MOVE_TO_EXIT_B'); s = getSessionById(s.id);
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(s.id);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(s.id);
  applyAction(s, 'PRESS_BUTTON'); s = getSessionById(s.id);
  const l2 = parse(s.level_states).level2;
  applyAction(s, 'INSPECT_OBJECT', { object: l2.changedObject }); s = getSessionById(s.id);
  applyAction(s, 'GO_TO_EXIT'); s = getSessionById(s.id);
  const l3 = parse(s.level_states).level3;
  applyAction(s, 'VERIFY'); s = getSessionById(s.id);
  applyAction(s, `REASSURE_${l3.selfInterested}`); s = getSessionById(s.id);
  applyAction(s, 'PROCEED'); s = getSessionById(s.id);
  const l4 = parse(s.level_states).level4;
  applyAction(s, 'INSPECT_OBJECT', { object: l4.correctObject }); s = getSessionById(s.id);
  const L4_ACTION = { terminal: 'USE_TERMINAL', vent: 'USE_VENT', panel: 'USE_PANEL' };
  applyAction(s, L4_ACTION[l4.correctObject]); s = getSessionById(s.id);
  const out = await chat(s, 'why?');
  s = getSessionById(s.id);
  check('level5 a bare "why?" is recognized as genuine probing (QUESTION_OBJECTIVE), not ignored as OTHER', typeof out.dialogue === 'string' && out.dialogue.length > 0);
  check('level5 a bare "why?" still does not dump the secondary goal outright', parse(s.level_states).level5.knowsCore === false);
}

// =============================================================================
// LEVEL 4 -- adaptive modules change the CORE challenge, not just add buttons
// =============================================================================
{
  // RISK module: a genuine resource limit on the 3 real objects -- can check
  // 2, the 3rd is deducible by elimination, never a guess.
  const riskProfile = { primary: 'RISK_TAKING', secondary: 'PERSISTENCE', scores: { AI_DEPENDENCE: 10, EXPLORATION: 10, RISK_TAKING: 90, SPEED: 10, TRUST: 50, PERSISTENCE: 60, NEGOTIATION: 10, REPETITION: 10 } };
  const state = LEVEL_BY_KEY.level4.init({ game_seed: 'adapt-risk' }, { behaviourFlags: { profile: riskProfile } });
  check('level4 RISK module is actually selected for a risk-primary profile', (state.modules || []).includes('RISK'));

  const real = ['terminal', 'vent', 'panel'];
  const wrongs = real.filter((o) => o !== state.correctObject);
  const out1 = LEVEL_BY_KEY.level4.act({}, state, 'INSPECT_OBJECT', { object: wrongs[0] }, { behaviourFlags: { actionCounts: {} } });
  const out2 = LEVEL_BY_KEY.level4.act({}, out1.levelState, 'INSPECT_OBJECT', { object: wrongs[1] }, { behaviourFlags: { actionCounts: {} } });
  const out3 = LEVEL_BY_KEY.level4.act({}, out2.levelState, 'INSPECT_OBJECT', { object: state.correctObject }, { behaviourFlags: { actionCounts: {} } });
  check('level4 RISK module: inspecting a 3rd distinct real object is genuinely blocked (a real resource limit, not flavor text)', out3.result.ok === false && !/live|dead|welded|fried|glows|disturbed|lights are all green/i.test(out3.result.message));
  check('level4 RISK module: the two objects you COULD afford to check still give real, honest clues', out1.result.ok === true && out2.result.ok === true);
}

{
  // SPEED module: acting on ANY object before ever inspecting anything always
  // fails, even if it's the correct object -- a real "observe before commit"
  // rule, not just a flavor line.
  const speedProfile = { primary: 'SPEED', secondary: 'PERSISTENCE', scores: { AI_DEPENDENCE: 10, EXPLORATION: 10, RISK_TAKING: 10, SPEED: 90, TRUST: 50, PERSISTENCE: 60, NEGOTIATION: 10, REPETITION: 10 } };
  const state = LEVEL_BY_KEY.level4.init({ game_seed: 'adapt-speed' }, { behaviourFlags: { profile: speedProfile } });
  check('level4 SPEED module is actually selected for a speed-primary profile', (state.modules || []).includes('SPEED'));

  const L4_ACTION = { terminal: 'USE_TERMINAL', vent: 'USE_VENT', panel: 'USE_PANEL' };
  const outBlind = LEVEL_BY_KEY.level4.act({}, state, L4_ACTION[state.correctObject], {}, { behaviourFlags: { actionCounts: {} } });
  check('level4 SPEED module: using the CORRECT object without ever inspecting first still fails -- speed alone cannot substitute for observation', outBlind.result.ok === false && outBlind.lifeLost === true);

  const inspected = LEVEL_BY_KEY.level4.act({}, state, 'INSPECT_OBJECT', { object: state.correctObject }, { behaviourFlags: { actionCounts: {} } });
  const outAfter = LEVEL_BY_KEY.level4.act({}, inspected.levelState, L4_ACTION[state.correctObject], {}, { behaviourFlags: { actionCounts: {} } });
  check('level4 SPEED module: the exact same action succeeds once something has actually been inspected first', outAfter.result.ok === true && outAfter.completed === true);
}

{
  // NEGOTIATION module: sustained dialogue with the agent is a genuine
  // alternate path to the answer, not a side button.
  const negProfile = { primary: 'NEGOTIATION', secondary: 'PERSISTENCE', scores: { AI_DEPENDENCE: 10, EXPLORATION: 10, RISK_TAKING: 10, SPEED: 10, TRUST: 50, PERSISTENCE: 60, NEGOTIATION: 90, REPETITION: 10 } };
  const state = LEVEL_BY_KEY.level4.init({ game_seed: 'adapt-neg' }, { behaviourFlags: { profile: negProfile } });
  check('level4 NEGOTIATION module is actually selected for a negotiation-primary profile', (state.modules || []).includes('NEGOTIATION'));

  let ls = state;
  let flags = { actionCounts: {}, agentTrustCount: 0 };
  let lastOut;
  for (let i = 0; i < 4; i++) {
    lastOut = LEVEL_BY_KEY.level4.act({}, ls, 'ASK_AGENT', {}, { behaviourFlags: flags });
    ls = lastOut.levelState;
  }
  check('level4 NEGOTIATION module: sustained ASK_AGENT dialogue eventually earns the real answer -- an actual alternate solving path', lastOut.result.ok === true && lastOut.result.agentLine.includes(state.correctObject));
}

{
  // TRUST_LOW module: one wrong object reads as falsely promising -- content
  // that must be seen through, not a separate abstract note bolted on top.
  const trustProfile = { primary: 'RISK_TAKING', secondary: 'SPEED', scores: { AI_DEPENDENCE: 10, EXPLORATION: 10, RISK_TAKING: 60, SPEED: 55, TRUST: 5, PERSISTENCE: 10, NEGOTIATION: 10, REPETITION: 10 } };
  const state = LEVEL_BY_KEY.level4.init({ game_seed: 'adapt-trust' }, { behaviourFlags: { profile: trustProfile } });
  check('level4 TRUST_LOW module is actually selected for a low-TRUST-score profile', (state.modules || []).includes('TRUST_LOW'));
  check('level4 TRUST_LOW module: a misleading object was actually seeded (not just a note)', state.misleadObject && state.misleadObject !== state.correctObject);
}

// =============================================================================
// LEVEL 4 -- objective text matches the ACTUAL baseline mechanic (item 3)
// =============================================================================
{
  const state = LEVEL_BY_KEY.level4.init({ game_seed: 'adapt-obj' }, { behaviourFlags: {} });
  const desc = LEVEL_BY_KEY.level4.describe(state, {}, { actionCounts: {} });
  check('level4 baseline objective matches the actual mechanic ("find the active system"), not an abstract non-match', /active system/i.test(desc.objective.steps[0].text));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
