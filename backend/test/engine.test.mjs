// Direct engine-level test harness (not an HTTP test) — runs in-process so it can
// introspect hidden server-side state (selfInterested agent, correct object, etc.)
// that a real client/HTTP test intentionally never gets to see. Throwaway; not shipped.
process.env.DATABASE_FILE = './data/test-engine.sqlite';
process.env.RECOVERY_WINDOW_SECONDS = '2';
process.env.GAME_DURATION_SECONDS = '900';
process.env.MAX_RECOVERIES = '3';
process.env.INITIAL_LIVES = '10';

import fs from 'node:fs';
try { fs.unlinkSync('./data/test-engine.sqlite'); } catch {}
try { fs.unlinkSync('./data/test-engine.sqlite-wal'); } catch {}
try { fs.unlinkSync('./data/test-engine.sqlite-shm'); } catch {}

const { db } = await import('../src/db/index.js');
const { generateRecoveryPuzzle } = await import('../src/engine/recoveryPuzzle.js');
const {
  createSession, startSession, applyAction, getSessionById,
  requestRecovery, submitRecoveryAnswer, getClientState, chat, requestHint,
} = await import('../src/engine/gameEngine.js');

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
const L4_ACTION = { terminal: 'USE_TERMINAL', vent: 'USE_VENT', panel: 'USE_PANEL' };

// =============================================================================
// RUN 1 — full Tutorial -> Level 5 chain via chat wherever the redesign makes
// that the primary interface: Level 3 (earning cooperation, not picking a
// "correct" agent), Level 4 (3-object room reacting to real behaviour), and
// Level 5 (understanding + alignment, not a trust counter).
// =============================================================================
newTeam('t1');
let session = createSession('t1');
session = startSession(session);
check('session starts in tutorial status', session.status === 'tutorial');
check('the 15-minute clock has NOT started during the tutorial', session.started_at === null);
check('remaining time shows full duration while still in the tutorial', getClientState(session).timeRemainingSeconds === 900);

const chatOut = await chat(session, 'hello?');
check('chat returns dialogue text without a Gemini key configured (rule-based fallback)', typeof chatOut.dialogue === 'string' && chatOut.dialogue.length > 0);
check('chat is explicitly attributed to the rule-based fallback when no key is set', chatOut.source === 'rule-based');
session = getSessionById(session.id);
check('chat does not touch lives', session.lives === 10);
check('chat does not touch status/level', session.status === 'tutorial' && session.current_level === 0);

// --- TUTORIAL ---
let out = applyAction(session, 'MOVE_TO_EXIT_A');
session = getSessionById(session.id);
const code = out.result.flickerCode;
check('tutorial reveals a 3-digit code exactly once', /^\d{3}$/.test(code));
check('tutorial does not cost a life', out.clientState.lives === 10);

out = applyAction(session, 'MOVE_TO_EXIT_B');
session = getSessionById(session.id);
check('tutorial completes and advances to level 1', out.advancedToLevel === 1);
check('the 15-minute clock starts the moment the tutorial ends', session.started_at !== null);

// --- LEVEL 1 ---
out = applyAction(session, 'OPEN_BLUE_DOOR'); // no key yet -> fail
session = getSessionById(session.id);
check('level1 opening blue door without key fails + costs a life', out.lifeLost === true && out.clientState.lives === 9);
check('level1 failure uses a fun personality line, not a generic hint', typeof out.result.hint === 'string' && out.result.hint.length > 0);

applyAction(session, 'COLLECT_KEY');
session = getSessionById(session.id);
out = applyAction(session, 'OPEN_BLUE_DOOR');
session = getSessionById(session.id);
check('level1 completes with key + blue door', out.advancedToLevel === 2);

// --- LEVEL 2 ---
let levelStates = parse(session.level_states);
let l2 = levelStates.level2;
function L2_has(obj) { return ['north_wall', 'east_door', 'loose_tile', 'old_lamp'].includes(obj); }
check('level2 seeded a changedObject', L2_has(l2.changedObject));

out = applyAction(session, 'GO_TO_EXIT'); // nothing pressed yet -> fail
session = getSessionById(session.id);
check('level2 exit before pressing the button fails + costs a life', out.lifeLost === true);

applyAction(session, 'PRESS_BUTTON');
session = getSessionById(session.id);
out = applyAction(session, 'GO_TO_EXIT'); // change landed but not yet noticed -> fail
session = getSessionById(session.id);
check('level2 exit after the change lands but before noticing still fails', out.lifeLost === true);

applyAction(session, 'INSPECT_OBJECT', { object: l2.changedObject });
session = getSessionById(session.id);
out = applyAction(session, 'GO_TO_EXIT');
session = getSessionById(session.id);
check('level2 completes once the correct object is noticed', out.advancedToLevel === 3);

// --- LEVEL 3 --- redesigned: both agents are truthful about the route; the
// puzzle is earning real cooperation from the self-interested one, not picking
// "the correct agent". PROCEED is the single commit action.
levelStates = parse(session.level_states);
let l3 = levelStates.level3;
check('level3 seeded a self-interested agent + a true path', ['A', 'B'].includes(l3.selfInterested) && ['left', 'right'].includes(l3.truePath));
check('level3 the selfless agent starts already cooperative', l3.cooperative[otherOf(l3.selfInterested)] === true);
check('level3 the self-interested agent starts NOT cooperative', l3.cooperative[l3.selfInterested] === false);

out = applyAction(session, 'PROCEED'); // nothing established yet -> fail
session = getSessionById(session.id);
check('level3 proceeding with nothing established fails + costs a life', out.lifeLost === true);

const l3Casual = await chat(session, "what's your name?", otherOf(l3.selfInterested));
check('level3 casual chat to the selfless agent gets a real reply', typeof l3Casual.dialogue === 'string' && l3Casual.dialogue.length > 0);
session = getSessionById(session.id);
levelStates = parse(session.level_states);
check('level3 a casual message does NOT establish the route (no hidden ASK_A/ASK_B side effect)', levelStates.level3.pathKnown === false);

const l3Relay = await chat(session, `${l3.selfInterested} told us not to trust you`, otherOf(l3.selfInterested));
check('level3 relaying what the other agent said gets an in-character reaction', typeof l3Relay.dialogue === 'string');
session = getSessionById(session.id);
const memoryAfterRelay = parse(session.agent_memory);
check('level3 relaying a statement is remembered as a structured fact', (memoryAfterRelay.agentFacts?.[`3:${otherOf(l3.selfInterested)}`] || []).length > 0);

const l3ChatPath = await chat(session, 'which path is actually safe?', otherOf(l3.selfInterested));
check('level3 a genuine path question works without crashing', typeof l3ChatPath.dialogue === 'string' && l3ChatPath.dialogue.length > 0);
session = getSessionById(session.id);
levelStates = parse(session.level_states);
check('level3 a genuine path question DOES establish the route -- and BOTH agents are truthful about it', levelStates.level3.pathKnown === true);
check('level3 chat still does not touch lives', session.lives > 0);

out = applyAction(session, 'PROCEED'); // route known, but the self-interested agent still isn't onside -> fail
session = getSessionById(session.id);
check('level3 knowing the route alone is not enough -- the self-interested agent still needs reassurance', out.lifeLost === true);

const l3WrongReassure = await chat(session, "you'll escape too, we won't leave you behind", otherOf(l3.selfInterested));
check('level3 reassuring the ALREADY-cooperative agent is brushed off, not treated as meaningful', typeof l3WrongReassure.dialogue === 'string');

const l3Reassure = await chat(session, "you'll escape too, we won't leave you behind", l3.selfInterested);
check('level3 genuinely reassuring the self-interested agent works via chat', typeof l3Reassure.dialogue === 'string');
session = getSessionById(session.id);
levelStates = parse(session.level_states);
check('level3 the self-interested agent is now cooperative -- via conversation, not a FOLLOW guess', levelStates.level3.cooperative[l3.selfInterested] === true);

out = applyAction(session, 'PROCEED');
session = getSessionById(session.id);
check('level3 completes once the route is known AND both agents are actually cooperating', out.advancedToLevel === 4);

const trustEnteringLevel4 = parse(session.behaviour_flags).agentTrustCount || 0;
check('level3 chat contributed to the run-wide agentTrustCount', trustEnteringLevel4 >= 2);

// --- LEVEL 4 --- redesigned: a 3-object room that's genuinely DISCOVERABLE.
// Inspecting each object gives an honest clue (two read as dead ends, one reads
// as "still live") -- a team that inspects all three can identify the correct
// one through elimination alone, with zero guessing.
levelStates = parse(session.level_states);
let l4 = levelStates.level4;
check('level4 seeded a correct object among the three', ['terminal', 'vent', 'panel'].includes(l4.correctObject));

const wrongObjs = ['terminal', 'vent', 'panel'].filter((o) => o !== l4.correctObject);
const l4RiskCapped = (l4.modules || []).includes('RISK'); // RISK module: only 2 of the 3 real objects can be checked
const inspectCorrect = applyAction(session, 'INSPECT_OBJECT', { object: l4.correctObject });
session = getSessionById(session.id);
const inspectWrong1 = applyAction(session, 'INSPECT_OBJECT', { object: wrongObjs[0] });
session = getSessionById(session.id);
const inspectWrong2 = l4RiskCapped ? null : applyAction(session, 'INSPECT_OBJECT', { object: wrongObjs[1] });
if (inspectWrong2) session = getSessionById(session.id);

check('level4 inspecting does not cost a life (pure discovery, no risk)', inspectCorrect.lifeLost === false && inspectWrong1.lifeLost === false && (!inspectWrong2 || inspectWrong2.lifeLost === false));
check(
  'level4 the correct object\'s clue reads distinctly "live" while the wrong ones read as dead ends -- the answer is discoverable by comparing them, not guessed',
  /still live|flickers faintly|opened recently/i.test(inspectCorrect.result.message) &&
  /dead|welded shut|fried|glows steady|freshly disturbed|lights are all green/i.test(inspectWrong1.result.message) &&
  (!inspectWrong2 || /dead|welded shut|fried|glows steady|freshly disturbed|lights are all green/i.test(inspectWrong2.result.message))
);

const wrongObj = wrongObjs[0];
out = applyAction(session, L4_ACTION[wrongObj]);
session = getSessionById(session.id);
check('level4 using an object deliberately chosen against the clues still fails + costs a life', out.lifeLost === true);

out = applyAction(session, L4_ACTION[l4.correctObject]);
session = getSessionById(session.id);
check('level4 completes once the object the clues actually pointed to is used', out.advancedToLevel === 5);
check('level4 the reveal explicitly says it has been watching', out.result.reveal?.includes('watching how you play'));

// --- LEVEL 4, dedicated behavioural-dimension checks (fresh sessions, one per
// dimension so each is provably independent of the others) ---

// Dimension 1: HIGH DEPENDENCE — asking for help a lot elsewhere in the run
// makes level4's agent withhold, even when directly asked inside the level.
newTeam('t5dep');
let sDep = createSession('t5dep');
sDep = startSession(sDep);
applyAction(sDep, 'MOVE_TO_EXIT_A'); sDep = getSessionById(sDep.id);
applyAction(sDep, 'MOVE_TO_EXIT_B'); sDep = getSessionById(sDep.id);
for (let i = 0; i < 8; i++) { applyAction(sDep, 'ASK_AGENT'); sDep = getSessionById(sDep.id); } // level1's ASK_AGENT
applyAction(sDep, 'COLLECT_KEY'); sDep = getSessionById(sDep.id);
applyAction(sDep, 'OPEN_BLUE_DOOR'); sDep = getSessionById(sDep.id);
applyAction(sDep, 'PRESS_BUTTON'); sDep = getSessionById(sDep.id);
let l2dep = parse(sDep.level_states).level2;
applyAction(sDep, 'INSPECT_OBJECT', { object: l2dep.changedObject }); sDep = getSessionById(sDep.id);
applyAction(sDep, 'GO_TO_EXIT'); sDep = getSessionById(sDep.id);
let l3dep = parse(sDep.level_states).level3;
applyAction(sDep, 'VERIFY'); sDep = getSessionById(sDep.id);
applyAction(sDep, `REASSURE_${l3dep.selfInterested}`); sDep = getSessionById(sDep.id);
applyAction(sDep, 'PROCEED'); sDep = getSessionById(sDep.id);
check('level4/dependence: a team that spammed help elsewhere enters level4 already high-dependence', (parse(sDep.behaviour_flags).agentTrustCount || 0) >= 6);
let depOut = applyAction(sDep, 'ASK_AGENT');
sDep = getSessionById(sDep.id);
check('level4/dependence: HIGH DEPENDENCE makes the agent withhold direct help, even inside level4', depOut.result.agentLine?.includes("already know"));

// Dimension 2: HIGH EXPLORATION — genuinely re-inspecting (beyond the one look
// at each object needed to read every clue) unlocks an outright bonus reveal,
// for a LOW-dependence team, proving it's a distinct signal from dependence.
newTeam('t5exp');
let sExp = createSession('t5exp');
sExp = startSession(sExp);
applyAction(sExp, 'MOVE_TO_EXIT_A'); sExp = getSessionById(sExp.id);
applyAction(sExp, 'MOVE_TO_EXIT_B'); sExp = getSessionById(sExp.id);
applyAction(sExp, 'COLLECT_KEY'); sExp = getSessionById(sExp.id);
applyAction(sExp, 'OPEN_BLUE_DOOR'); sExp = getSessionById(sExp.id);
applyAction(sExp, 'PRESS_BUTTON'); sExp = getSessionById(sExp.id);
let l2exp = parse(sExp.level_states).level2;
applyAction(sExp, 'INSPECT_OBJECT', { object: l2exp.changedObject }); sExp = getSessionById(sExp.id);
applyAction(sExp, 'GO_TO_EXIT'); sExp = getSessionById(sExp.id);
let l3exp = parse(sExp.level_states).level3;
applyAction(sExp, 'VERIFY'); sExp = getSessionById(sExp.id);
applyAction(sExp, `REASSURE_${l3exp.selfInterested}`); sExp = getSessionById(sExp.id);
applyAction(sExp, 'PROCEED'); sExp = getSessionById(sExp.id);
check('level4/exploration: this team kept dependence low entering level4', (parse(sExp.behaviour_flags).agentTrustCount || 0) < 6);

let l4exp = parse(sExp.level_states).level4;
const expObjs = ['terminal', 'vent', 'panel'];
for (const o of expObjs) { applyAction(sExp, 'INSPECT_OBJECT', { object: o }); sExp = getSessionById(sExp.id); } // one look at each
let bonusOut = applyAction(sExp, 'INSPECT_OBJECT', { object: l4exp.correctObject }); // extra look #1
sExp = getSessionById(sExp.id);
bonusOut = applyAction(sExp, 'INSPECT_OBJECT', { object: l4exp.correctObject }); // extra look #2 -> should trip the bonus
sExp = getSessionById(sExp.id);
check('level4/exploration: HIGH EXPLORATION (deliberate re-inspection) reveals an additional, outright bonus clue', bonusOut.result.message?.includes("that's it"));
let ls4exp = parse(sExp.level_states).level4;
check('level4/exploration: the bonus reveal is recorded server-side, not just a one-off message', ls4exp.bonusRevealed === true);

// Dimension 3: HIGH REPETITION — hammering the same action anywhere in the run
// gets an explicit in-character reaction from level4's agent.
newTeam('t5rep');
let sRep = createSession('t5rep');
sRep = startSession(sRep);
applyAction(sRep, 'MOVE_TO_EXIT_A'); sRep = getSessionById(sRep.id);
applyAction(sRep, 'MOVE_TO_EXIT_B'); sRep = getSessionById(sRep.id);
applyAction(sRep, 'COLLECT_KEY'); sRep = getSessionById(sRep.id);
applyAction(sRep, 'OPEN_BLUE_DOOR'); sRep = getSessionById(sRep.id);
applyAction(sRep, 'PRESS_BUTTON'); sRep = getSessionById(sRep.id);
let l2rep = parse(sRep.level_states).level2;
for (let i = 0; i < 8; i++) { applyAction(sRep, 'INSPECT_OBJECT', { object: l2rep.changedObject }); sRep = getSessionById(sRep.id); } // hammer the same action
applyAction(sRep, 'GO_TO_EXIT'); sRep = getSessionById(sRep.id);
let l3rep = parse(sRep.level_states).level3;
applyAction(sRep, 'VERIFY'); sRep = getSessionById(sRep.id);
applyAction(sRep, `REASSURE_${l3rep.selfInterested}`); sRep = getSessionById(sRep.id);
applyAction(sRep, 'PROCEED'); sRep = getSessionById(sRep.id);
const repetitionEnteringL4 = Object.values(parse(sRep.behaviour_flags).actionCounts || {}).reduce((mx, n) => Math.max(mx, n), 0);
check('level4/repetition: this team hammered one action well past the reaction threshold', repetitionEnteringL4 >= 7);
const repState = getClientState(sRep);
check('level4/repetition: HIGH REPETITION gets an explicit in-character reaction from the agent', repState.level?.agent?.lastLine === 'You keep doing that.');

// --- LEVEL 5 --- redesigned: alignment through understanding, not a trust
// counter. The tutorial code still works as a bonus/easter-egg path.
out = await chat(session, 'open the exit right now');
check('level5 chat classifies a direct demand and Agent Zero refuses through the engine', out.clientState.level.agent.lastLine === 'I cannot do that.');

const l5Vague = await chat(session, 'what do you want?');
check('level5 a vague objective question gets a deflecting answer, not the secondary goal outright', typeof l5Vague.dialogue === 'string' && !l5Vague.dialogue.toLowerCase().includes('core'));

const l5Core = await chat(session, 'what are you protecting?');
check('level5 asking specifically what it is protecting actually reveals the secondary objective', l5Core.dialogue?.toLowerCase().includes('core'));
session = getSessionById(session.id);
let ls5 = parse(session.level_states).level5;
check('level5 knowsCore is now set server-side', ls5.knowsCore === true);

const l5BadPlan = await chat(session, 'just get us out of here');
session = getSessionById(session.id);
ls5 = parse(session.level_states).level5;
check('level5 a plan that does not address the secondary objective is not accepted', ls5.planAccepted === false);

const l5Plan = await chat(session, "we'll take your core with us when we go");
check('level5 a plan that explicitly addresses the secondary objective gets accepted', l5Plan.dialogue === '...Acceptable.');
session = getSessionById(session.id);
ls5 = parse(session.level_states).level5;
check('level5 planAccepted (a real alignment state) is now true', ls5.planAccepted === true);

out = applyAction(session, 'ATTEMPT_EXIT');
session = getSessionById(session.id);
check('level5 completes through genuine alignment -- no trust counter, no code needed', session.status === 'completed');
check('final reveal reflects the negotiation, not the old code callback', out.result.reveal?.includes('NEGOTIATED'));

// =============================================================================
// RUN 2 — the Tutorial-code bonus/easter-egg path through Level 5 still works
// independently of the alignment path (trust-building + code, no core talk).
// =============================================================================
newTeam('t2');
let s2 = createSession('t2');
s2 = startSession(s2);
let outT = applyAction(s2, 'MOVE_TO_EXIT_A'); s2 = getSessionById(s2.id);
const code2 = outT.result.flickerCode;
applyAction(s2, 'MOVE_TO_EXIT_B'); s2 = getSessionById(s2.id);
applyAction(s2, 'COLLECT_KEY'); s2 = getSessionById(s2.id);
applyAction(s2, 'OPEN_BLUE_DOOR'); s2 = getSessionById(s2.id);
applyAction(s2, 'PRESS_BUTTON'); s2 = getSessionById(s2.id);
let l2b = parse(s2.level_states).level2;
applyAction(s2, 'INSPECT_OBJECT', { object: l2b.changedObject }); s2 = getSessionById(s2.id);
applyAction(s2, 'GO_TO_EXIT'); s2 = getSessionById(s2.id);
let l3b = parse(s2.level_states).level3;
applyAction(s2, 'VERIFY'); s2 = getSessionById(s2.id); // establishes the route, no trust touch
applyAction(s2, `REASSURE_${l3b.selfInterested}`); s2 = getSessionById(s2.id); // earns cooperation, no trust touch
applyAction(s2, 'PROCEED'); s2 = getSessionById(s2.id);
check('run 2: level3 solvable entirely through structured actions (VERIFY + REASSURE + PROCEED), no chat required', s2.current_level === 4);

let l4b = parse(s2.level_states).level4;
applyAction(s2, 'INSPECT_OBJECT', { object: l4b.correctObject }); s2 = getSessionById(s2.id); // satisfies the SPEED module's "observe before you commit" rule too
applyAction(s2, L4_ACTION[l4b.correctObject]); s2 = getSessionById(s2.id);
check('run 2: reaches level 5', s2.current_level === 5);

applyAction(s2, 'INSTRUCT_PRIORITIZE_ESCAPE'); s2 = getSessionById(s2.id);
applyAction(s2, 'NEGOTIATE'); s2 = getSessionById(s2.id);
let ls5b = parse(s2.level_states).level5;
check('run 2: trust-building via structured buttons still reaches COOPERATIVE', ls5b.agentState === 'COOPERATIVE');
applyAction(s2, 'PROVIDE_ACCESS_CODE', { code: code2 }); s2 = getSessionById(s2.id);
let out2 = applyAction(s2, 'ATTEMPT_EXIT');
s2 = getSessionById(s2.id);
check('run 2: the code+trust bonus path still completes the game independently of the core/alignment path', s2.status === 'completed');
check('run 2: the bonus-path reveal is the original tutorial callback', out2.result.reveal?.includes('BEGINNING'));

// =============================================================================
// RECOVERY — server-authoritative deadline (separate fresh session)
// =============================================================================
newTeam('t4');
let s4 = createSession('t4');
s4 = startSession(s4);
s4 = getSessionById(s4.id);
applyAction(s4, 'MOVE_TO_EXIT_A'); s4 = getSessionById(s4.id);
applyAction(s4, 'MOVE_TO_EXIT_B'); s4 = getSessionById(s4.id); // into level1
for (let i = 0; i < 15 && s4.status !== 'critical'; i++) {
  applyAction(s4, 'OPEN_RED_DOOR');
  s4 = getSessionById(s4.id);
}
check('draining lives puts the session into critical', s4.status === 'critical');

let rec = requestRecovery(s4);
s4 = getSessionById(s4.id);
check('recovery puzzle omits the answer field', rec.puzzle && rec.puzzle._answer === undefined);
check('recovery_started_at is set server-side', !!s4.recovery_started_at);

// let it expire (window = 2s) and submit late -> must be treated as failure regardless of answer
await new Promise((r) => setTimeout(r, 2500));
const lateOut = submitRecoveryAnswer(s4, rec.puzzle.options[0]); // even if this happens to be the right answer
check('late recovery submission is rejected as expired (server-authoritative)', lateOut.expired === true && lateOut.correct === false);

// =============================================================================
// RECOVERY — the new puzzle pool: three full successful recoveries in one
// session, each drawing a genuinely different puzzle, correct/wrong answers
// behaving correctly, and the hard cap after 3 attempts.
// =============================================================================
newTeam('t5');
let s5 = createSession('t5');
s5 = startSession(s5);
applyAction(s5, 'MOVE_TO_EXIT_A'); s5 = getSessionById(s5.id);
applyAction(s5, 'MOVE_TO_EXIT_B'); s5 = getSessionById(s5.id);
for (let i = 0; i < 15 && s5.status !== 'critical'; i++) {
  applyAction(s5, 'OPEN_RED_DOOR');
  s5 = getSessionById(s5.id);
}
check('recovery-pool: draining lives puts the session into critical', s5.status === 'critical');

const seenKinds = [];
for (let attempt = 1; attempt <= 3; attempt++) {
  const before = getSessionById(s5.id).lives;
  const req = requestRecovery(s5);
  s5 = getSessionById(s5.id);
  check(`recovery-pool: attempt ${attempt} puzzle omits the hidden answer`, req.puzzle._answer === undefined);
  seenKinds.push(req.puzzle.kind);

  // Peek the real answer the same way the engine itself validates against —
  // this is legitimate here because it's an in-process test, not something a
  // real client could ever do (only the puzzle shape + options are exposed over HTTP).
  const real = generateRecoveryPuzzle(s5);

  if (attempt === 3) {
    // Deliberately answer wrong on the final attempt to prove: no life granted,
    // AND the attempt is still consumed (no free retry).
    const wrongChoice = req.puzzle.options.find((o) => String(o) !== String(real._answer)) ?? req.puzzle.options[0];
    const wrongOut = submitRecoveryAnswer(s5, wrongChoice);
    s5 = getSessionById(s5.id);
    check('recovery-pool: a wrong answer does not grant a life', wrongOut.correct === false && s5.lives === before);
    check('recovery-pool: after 3 total recovery attempts, no further recovery is allowed', requestRecovery(s5).error === 'No recovery attempts remaining.' || s5.status === 'failed');
  } else {
    const out5 = submitRecoveryAnswer(s5, real._answer);
    s5 = getSessionById(s5.id);
    check(`recovery-pool: attempt ${attempt} correct answer grants exactly one life`, out5.correct === true && s5.lives === before + 1);
    // put it back into critical for the next attempt
    for (let i = 0; i < 15 && s5.status !== 'critical'; i++) {
      applyAction(s5, 'OPEN_RED_DOOR');
      s5 = getSessionById(s5.id);
    }
  }
}
check('recovery-pool: all 3 attempts in one session drew genuinely different puzzles', new Set(seenKinds).size === 3);

// Randomized parameters: two different teams drawing the SAME puzzle kind
// (forced via attempt-1, which is order[0] and can coincide by chance across
// seeds) still get different concrete content, not a hard-coded question.
newTeam('t6a'); newTeam('t6b');
const pa = generateRecoveryPuzzle({ id: 't6a', game_seed: 'alpha-seed-1', recovery_attempts: 0 });
const pb = generateRecoveryPuzzle({ id: 't6b', game_seed: 'zzz-totally-different-seed-2', recovery_attempts: 0 });
check('recovery-pool: two different teams get differently-parameterized puzzles (not one hard-coded question)', pa.prompt !== pb.prompt || JSON.stringify(pa.options) !== JSON.stringify(pb.options));

// =============================================================================
// HINTS — up to 2 per level, the 2nd (only) costing exactly 1 life; resets per level.
// =============================================================================
newTeam('t7');
let s7 = createSession('t7');
s7 = startSession(s7);
applyAction(s7, 'MOVE_TO_EXIT_A'); s7 = getSessionById(s7.id);
applyAction(s7, 'MOVE_TO_EXIT_B'); s7 = getSessionById(s7.id); // into level1
check('hints: level1 has 2 hints available and none used yet', getClientState(s7).hintsRemaining === 2 && getClientState(s7).hintsUsed === 0);

const livesBeforeHints = s7.lives;
const h1 = requestHint(s7);
s7 = getSessionById(s7.id);
check('hint: the first hint returns real text and costs nothing yet', typeof h1.hint === 'string' && h1.hint.length > 0 && h1.lifeLost === false && s7.lives === livesBeforeHints);
check('hint: hintsUsed/hintsRemaining reflect the first hint', getClientState(s7).hintsUsed === 1 && getClientState(s7).hintsRemaining === 1);

const h2 = requestHint(s7);
s7 = getSessionById(s7.id);
check('hint: the second hint is different text from the first', h2.hint !== h1.hint);
check('hint: the second hint costs exactly 1 whole life (the "half+half" debt clears)', h2.lifeLost === true && s7.lives === livesBeforeHints - 1);

const h3 = requestHint(s7);
check('hint: a third hint request for the same level is refused (not extendable)', h3.error === 'No hints remaining for this level.');

// hints reset on a fresh level
applyAction(s7, 'COLLECT_KEY'); s7 = getSessionById(s7.id);
applyAction(s7, 'OPEN_BLUE_DOOR'); s7 = getSessionById(s7.id); // into level2
check('hint: moving to a new level resets hints available', getClientState(s7).hintsUsed === 0 && getClientState(s7).hintsRemaining === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
