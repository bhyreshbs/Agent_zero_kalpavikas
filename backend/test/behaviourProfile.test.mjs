// Regression tests for behaviourProfile.js and the adaptive Level 4/5 system it
// drives ("Agent Zero is watching the team" — see levels.js sections 11-17).
// Split into (a) direct unit tests of the pure counter/profile/module-selection
// functions, and (b) integration tests that run real sessions through
// gameEngine to prove the whole observe -> lock -> adapt pipeline actually
// wires together end to end. Mirrors the numbered list in the design spec's
// "TESTING" section as closely as practical.
process.env.DATABASE_FILE = './data/test-behaviour.sqlite';
process.env.RECOVERY_WINDOW_SECONDS = '2';
process.env.GAME_DURATION_SECONDS = '900';
process.env.MAX_RECOVERIES = '3';
process.env.INITIAL_LIVES = '20'; // generous — these runs deliberately rack up failures to build signal

import fs from 'node:fs';
try { fs.unlinkSync('./data/test-behaviour.sqlite'); } catch {}
try { fs.unlinkSync('./data/test-behaviour.sqlite-wal'); } catch {}
try { fs.unlinkSync('./data/test-behaviour.sqlite-shm'); } catch {}

const { db } = await import('../src/db/index.js');
const {
  recordActionObservation,
  recordChatObservation,
  computeProfile,
  finalizeProfile,
  selectLevel4Modules,
  selectLevel5Modules,
  buildFinalReveal,
  DIMENSIONS,
} = await import('../src/engine/behaviourProfile.js');
const { createSession, startSession, applyAction, getSessionById, chat } = await import('../src/engine/gameEngine.js');

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
// UNIT — deterministic counters (test criteria #1, #2, #3, #4, #5, #6, #7, #15)
// =============================================================================

// #1 / #15 — same inputs, same outputs, every time.
{
  const flagsA = {};
  const flagsB = {};
  const outcome = { lifeLost: false, completed: false };
  recordActionObservation(flagsA, 2, 'INSPECT_OBJECT', { object: 'x' }, outcome);
  recordActionObservation(flagsB, 2, 'INSPECT_OBJECT', { object: 'x' }, outcome);
  check('counters: identical input sequences produce identical raw counters', flagsA.obs.exploreSignals === flagsB.obs.exploreSignals && flagsA.obs.exploreSignals === 1);

  const profile1 = computeProfile(flagsA);
  const profile2 = computeProfile(flagsA);
  check('#1/#15 computeProfile is a pure function — calling it twice on the same flags gives identical scores', JSON.stringify(profile1) === JSON.stringify(profile2));
  check('#7 primary/secondary traits are deterministic for the same counters', profile1.primary === profile2.primary && profile1.secondary === profile2.secondary);
}

// #2 — casual chat must NOT bump AI dependence.
{
  const flags = {};
  for (const msg of ["what's your name?", 'why are you here?', 'tell me about yourself', 'hello!']) {
    recordChatObservation(flags, 1, msg);
  }
  check('#2 casual chat does not increase AI_DEPENDENCE at all', (flags.obs.helpSignals || 0) === 0);
}

// #3 — genuine help-seeking DOES bump AI dependence.
{
  const flags = {};
  for (const msg of ['which one should we choose?', 'what should we do?', 'give us a hint', 'which path is safe?']) {
    recordChatObservation(flags, 1, msg);
  }
  check('#3 help-seeking chat increases AI_DEPENDENCE', flags.obs.helpSignals === 4);
  const profile = computeProfile(flags);
  check('#3 that signal actually raises the normalized AI_DEPENDENCE score', profile.scores.AI_DEPENDENCE > 0);
}

// #4 — optional exploration is distinguished from mandatory inspection: only
// INSPECT/INSPECT_OBJECT actions count as exploration; other mandatory actions
// (e.g. opening a door, pressing a button) never do, even though they're just
// as "required" to finish the level.
{
  const flags = {};
  recordActionObservation(flags, 1, 'COLLECT_KEY', {}, { lifeLost: false, completed: false });
  recordActionObservation(flags, 1, 'OPEN_BLUE_DOOR', {}, { lifeLost: false, completed: true });
  check('#4 mandatory, non-inspection actions never count as exploration', (flags.obs.exploreSignals || 0) === 0);
  recordActionObservation(flags, 2, 'INSPECT_OBJECT', { object: 'x' }, { lifeLost: false, completed: false });
  check('#4 an actual INSPECT_OBJECT call does count as exploration', flags.obs.exploreSignals === 1);
}

// #5 — a single accidental failure must not read as high risk.
{
  const flagsOneRisk = {};
  recordActionObservation(flagsOneRisk, 1, 'OPEN_RED_DOOR', {}, { lifeLost: true, completed: false });
  const oneRiskProfile = computeProfile(flagsOneRisk);
  check('#5 a single blind failure keeps RISK_TAKING low, not "high"', oneRiskProfile.scores.RISK_TAKING > 0 && oneRiskProfile.scores.RISK_TAKING < 50);

  const flagsManyRisk = {};
  for (let i = 0; i < 6; i++) recordActionObservation(flagsManyRisk, 1, `RISKY_ACTION_${i}`, {}, { lifeLost: true, completed: false });
  const manyRiskProfile = computeProfile(flagsManyRisk);
  check('#5 repeated blind failures DO push RISK_TAKING meaningfully higher than a single one', manyRiskProfile.scores.RISK_TAKING > oneRiskProfile.scores.RISK_TAKING);

  // An "informed mistake" (inspected first, still picked wrong) must not count
  // as risk at all — it's a different, separate bucket (obs.accidentSignals).
  const flagsInformed = {};
  recordActionObservation(flagsInformed, 4, 'INSPECT_OBJECT', { object: 'panel' }, { lifeLost: false, completed: false });
  recordActionObservation(flagsInformed, 4, 'USE_TERMINAL', {}, { lifeLost: true, completed: false });
  check('#5 a mistake made AFTER inspecting is tracked as an informed mistake, not deliberate risk', flagsInformed.obs.riskSignals === 0 && flagsInformed.obs.accidentSignals === 1);
}

// #6 — trust reflects actual behaviour: following advice vs. independently verifying.
{
  const flagsFollow = {};
  recordActionObservation(flagsFollow, 3, 'ASK_A', {}, { lifeLost: false, completed: false });
  recordActionObservation(flagsFollow, 3, 'PROCEED', {}, { lifeLost: false, completed: true });
  check('#6 completing a level after asking, without ever verifying, reads as high trust', computeProfile(flagsFollow).scores.TRUST === 100);

  const flagsVerify = {};
  recordActionObservation(flagsVerify, 3, 'VERIFY', {}, { lifeLost: false, completed: false });
  recordActionObservation(flagsVerify, 3, 'PROCEED', {}, { lifeLost: false, completed: true });
  check('#6 independently verifying (never just asking) reads as low trust', computeProfile(flagsVerify).scores.TRUST === 0);

  check('#6 with zero trust-relevant signal at all, TRUST defaults to a neutral midpoint, not a false extreme', computeProfile({}).scores.TRUST === 50);
}

// #8 — different profiles select different Level 4 modules.
{
  const depProfile = { primary: 'AI_DEPENDENCE', secondary: 'REPETITION', scores: Object.fromEntries(DIMENSIONS.map((d) => [d, 50])) };
  const expProfile = { primary: 'EXPLORATION', secondary: 'SPEED', scores: Object.fromEntries(DIMENSIONS.map((d) => [d, 50])) };
  const depMods = selectLevel4Modules(depProfile);
  const expMods = selectLevel4Modules(expProfile);
  check('#8 a dependence-primary profile selects the DEPENDENCE module', depMods.includes('DEPENDENCE'));
  check('#8 an exploration-primary profile selects the EXPLORATION module, not DEPENDENCE', expMods.includes('EXPLORATION') && !expMods.includes('DEPENDENCE'));
  check('#8 the two profiles genuinely select different Level 4 module sets', JSON.stringify([...depMods].sort()) !== JSON.stringify([...expMods].sort()));

  const lowTrustProfile = { primary: 'RISK_TAKING', secondary: 'SPEED', scores: { ...Object.fromEntries(DIMENSIONS.map((d) => [d, 50])), TRUST: 10 } };
  check('#8 a low-TRUST score adds the TRUST_LOW module regardless of primary/secondary', selectLevel4Modules(lowTrustProfile).includes('TRUST_LOW'));
}

// #9 — different profiles select different Level 5 modules.
{
  const negProfile = { primary: 'NEGOTIATION', secondary: 'PERSISTENCE', scores: Object.fromEntries(DIMENSIONS.map((d) => [d, 50])) };
  const riskProfile = { primary: 'RISK_TAKING', secondary: 'AI_DEPENDENCE', scores: Object.fromEntries(DIMENSIONS.map((d) => [d, 50])) };
  const negMods = selectLevel5Modules(negProfile);
  const riskMods = selectLevel5Modules(riskProfile);
  check('#9 a negotiation-primary profile selects NEGOTIATOR_FOCUS', negMods.includes('NEGOTIATOR_FOCUS'));
  check('#9 a risk-primary profile selects RISK_RUSH and DEPENDENT_SHORTCUT (secondary), not NEGOTIATOR_FOCUS', riskMods.includes('RISK_RUSH') && riskMods.includes('DEPENDENT_SHORTCUT') && !riskMods.includes('NEGOTIATOR_FOCUS'));
  check('#9 the two profiles genuinely select different Level 5 module sets', JSON.stringify([...negMods].sort()) !== JSON.stringify([...riskMods].sort()));
}

// =============================================================================
// INTEGRATION — real sessions through gameEngine (test criteria #10, #11, #12,
// #13, #14, plus re-confirming #15 end to end)
// =============================================================================

// Helper: play Tutorial -> Level 3 the fast, minimal way (VERIFY + REASSURE +
// PROCEED — no chat, no extra actions), so every test session enters Level 4
// with a clean, controllable set of counters we add specific signal on top of.
function playToLevel4(sessionId) {
  let s = getSessionById(sessionId);
  applyAction(s, 'MOVE_TO_EXIT_A'); s = getSessionById(sessionId);
  applyAction(s, 'MOVE_TO_EXIT_B'); s = getSessionById(sessionId);
  applyAction(s, 'COLLECT_KEY'); s = getSessionById(sessionId);
  applyAction(s, 'OPEN_BLUE_DOOR'); s = getSessionById(sessionId);
  applyAction(s, 'PRESS_BUTTON'); s = getSessionById(sessionId);
  const l2 = parse(s.level_states).level2;
  applyAction(s, 'INSPECT_OBJECT', { object: l2.changedObject }); s = getSessionById(sessionId);
  applyAction(s, 'GO_TO_EXIT'); s = getSessionById(sessionId);
  const l3 = parse(s.level_states).level3;
  applyAction(s, 'VERIFY'); s = getSessionById(sessionId);
  applyAction(s, `REASSURE_${l3.selfInterested}`); s = getSessionById(sessionId);
  applyAction(s, 'PROCEED'); s = getSessionById(sessionId);
  return getSessionById(sessionId);
}

// #14 — two teams with genuinely different Levels 1-3 behaviour get different
// Level 4 experiences (different selected modules / different decoy objects).
newTeam('bp-dep');
let sDepTeam = createSession('bp-dep');
sDepTeam = startSession(sDepTeam);
for (let i = 0; i < 6; i++) {
  await chat(sDepTeam, 'which door should we open?'); // pure dependence signal, every message
  sDepTeam = getSessionById(sDepTeam.id);
}
sDepTeam = playToLevel4(sDepTeam.id);
const depProfileLocked = parse(sDepTeam.behaviour_flags).profile;
check('#14 a heavy help-seeking team locks a profile with AI_DEPENDENCE as primary or secondary', [depProfileLocked.primary, depProfileLocked.secondary].includes('AI_DEPENDENCE'));
let l4DepState = parse(sDepTeam.level_states).level4;
check('#14 that team\'s Level 4 recorded the DEPENDENCE module as active', (l4DepState.modules || []).includes('DEPENDENCE'));

newTeam('bp-exp');
let sExpTeam = createSession('bp-exp');
sExpTeam = startSession(sExpTeam);
// Heavy, genuinely optional exploration during the tutorial/level1/level2 window.
applyAction(sExpTeam, 'MOVE_TO_EXIT_A'); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'MOVE_TO_EXIT_B'); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'INSPECT'); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'INSPECT'); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'INSPECT'); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'COLLECT_KEY'); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'OPEN_BLUE_DOOR'); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'PRESS_BUTTON'); sExpTeam = getSessionById(sExpTeam.id);
const l2exp = parse(sExpTeam.level_states).level2;
for (const obj of ['north_wall', 'east_door', 'loose_tile', 'old_lamp']) {
  applyAction(sExpTeam, 'INSPECT_OBJECT', { object: obj }); sExpTeam = getSessionById(sExpTeam.id);
}
applyAction(sExpTeam, 'INSPECT_OBJECT', { object: l2exp.changedObject }); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'GO_TO_EXIT'); sExpTeam = getSessionById(sExpTeam.id);
const l3exp = parse(sExpTeam.level_states).level3;
applyAction(sExpTeam, 'VERIFY'); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, `REASSURE_${l3exp.selfInterested}`); sExpTeam = getSessionById(sExpTeam.id);
applyAction(sExpTeam, 'PROCEED'); sExpTeam = getSessionById(sExpTeam.id);
const expProfileLocked = parse(sExpTeam.behaviour_flags).profile;
check('#14 a heavy-inspection team locks a DIFFERENT primary/secondary pair than the dependence team', JSON.stringify([expProfileLocked.primary, expProfileLocked.secondary].sort()) !== JSON.stringify([depProfileLocked.primary, depProfileLocked.secondary].sort()));
let l4ExpState = parse(sExpTeam.level_states).level4;
check('#14 the two teams\' Level 4 module sets genuinely differ', JSON.stringify((l4DepState.modules || []).slice().sort()) !== JSON.stringify((l4ExpState.modules || []).slice().sort()));

// #10 / #11 — every adaptive challenge stays solvable via the real, unaffected
// baseline path, and does so deterministically (same forced setup -> same
// completion condition), regardless of which modules got layered on top.
for (const [label, teamId] of [['dependence-team', 'bp-dep'], ['exploration-team', 'bp-exp']]) {
  let s = getSessionById((teamId === 'bp-dep' ? sDepTeam : sExpTeam).id);
  const l4 = parse(s.level_states).level4;
  const wrongObjs = ['terminal', 'vent', 'panel'].filter((o) => o !== l4.correctObject);
  const L4_ACTION = { terminal: 'USE_TERMINAL', vent: 'USE_VENT', panel: 'USE_PANEL' };
  for (const o of ['terminal', 'vent', 'panel']) { applyAction(s, 'INSPECT_OBJECT', { object: o }); s = getSessionById(s.id); }
  const out = applyAction(s, L4_ACTION[l4.correctObject]);
  s = getSessionById(s.id);
  check(`#10 ${label}: Level 4 is still solvable through the untouched baseline 3-object mechanic, whatever modules are active`, out.advancedToLevel === 5);
}
// Refresh the outer session handles — the loop above advanced both teams into
// Level 5 via locally-scoped `s`, which never touched the outer variables.
sDepTeam = getSessionById(sDepTeam.id);
sExpTeam = getSessionById(sExpTeam.id);

// #12 — chat during an adaptive level still cannot mutate lives/score/completion.
{
  const sBefore = getSessionById(sDepTeam.id);
  const before = { lives: sBefore.lives, score: sBefore.score, level: sBefore.current_level, status: sBefore.status };
  await chat(sDepTeam, "what's your name?"); // Level 5 by now for this team
  const sAfter = getSessionById(sDepTeam.id);
  check('#12 chatting during an adaptive (module-affected) level still cannot touch lives/score/level/status', sAfter.lives === before.lives && sAfter.score === before.score && sAfter.current_level === before.level && sAfter.status === before.status);
}

// #13 — the final reveal's numbers are the real, engine-tracked counters, not
// invented text. Run the dependence-heavy team all the way through Level 5
// (alignment path — ignore whatever module content is present) and check.
{
  let s = getSessionById(sDepTeam.id); // already in level5 from the block above
  await chat(sDepTeam, 'what are you protecting?');
  await chat(sDepTeam, "we'll take your core with us when we go");
  const out = applyAction(getSessionById(sDepTeam.id), 'ATTEMPT_EXIT');
  s = getSessionById(sDepTeam.id);
  check('#13 the run actually completed', s.status === 'completed');
  const flags = parse(s.behaviour_flags);
  const reveal = out.clientState.finalReveal;
  check('#13 finalReveal is present once the run is completed', !!reveal);
  check('#13 finalReveal.observed.helpRequests matches the real tracked counter exactly', reveal.observed.helpRequests === flags.obs.helpSignals);
  check('#13 finalReveal.observed.inspections matches the real tracked counter exactly', reveal.observed.inspections === flags.obs.exploreSignals);
  check('#13 finalReveal.scores matches the locked profile\'s scores exactly', JSON.stringify(reveal.scores) === JSON.stringify(flags.profile.scores));
  check('#13 finalReveal is null/absent before completion (never exposed early)', (function () {
    const midGameState = applyAction(getSessionById(sExpTeam.id), 'NOOP_PROBE');
    return midGameState.clientState.finalReveal === null;
  })());
}

// #15 (integration form) — selecting modules from the SAME locked profile
// twice in a row gives the identical module set (no hidden randomness).
{
  const locked = parse(getSessionById(sDepTeam.id).behaviour_flags).profile;
  const a = selectLevel4Modules(locked);
  const b = selectLevel4Modules(locked);
  check('#15 module selection is deterministic for the same locked profile', JSON.stringify(a) === JSON.stringify(b));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
