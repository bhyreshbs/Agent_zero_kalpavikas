/**
 * Level definitions.
 *
 * Each level is a small deterministic state machine keyed by `state.levelStates[levelKey]`.
 * A level module exposes:
 *   - key, index, name, difficulty, costsLife
 *   - init(session, ctx)                       -> initial per-level state (server-only)
 *   - describe(levelState, memory, behaviourFlags) -> client-safe view (NEVER hidden answers)
 *   - act(session, levelState, action, payload, ctx) -> { levelState, result, lifeLost, completed }
 *
 * `ctx.behaviourFlags` and `ctx.memory` are plain objects that persist for the whole
 * run (stored in game_sessions.behaviour_flags / .agent_memory) -- this is how Level 4
 * ("The Game Knows") reads choices made in earlier levels, and how Level 5 reads the
 * access code discovered in the Tutorial. Mutate them in place; the engine persists
 * whatever's on them after every action.
 */

import { mulberry32, hashSeed } from '../utils/rng.js';
import { funFailureLine } from './agentEngine.js';
import { selectLevel4Modules, selectLevel5Modules } from './behaviourProfile.js';

function makeRng(session) {
  return (salt) => mulberry32(hashSeed(session.game_seed, salt));
}

// Every "MISSION FAILED" hint should teach the player something they can act
// on -- never just a personality one-liner. `funFailureLine()` always returns
// a value (its arrays are never empty), so `funFailureLine(N) || constructive`
// used to silently discard the constructive part every single time. This
// combines both: the useful hint always shows, with the witty line as flavor
// riding along after it, never replacing it.
function failureHint(level, constructive) {
  const flavor = funFailureLine(level);
  return flavor ? `${constructive} ${flavor}` : constructive;
}

function pickLine(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// LEVEL 0 -- TUTORIAL ("Welcome, Agent")
// ---------------------------------------------------------------------------
// Teaches the one rule the whole game runs on (expect the unexpected) and, without
// calling attention to it, plants a short access code the team will need to recall
// in Level 5. The code is shown exactly once, in a single response, then never again.
const tutorial = {
  key: 'tutorial',
  index: 0,
  name: 'Welcome, Agent',
  difficulty: 'Warm-up',
  costsLife: false,

  init(session, ctx) {
    const rng = makeRng(session)('tutorial-code');
    const code = String(100 + Math.floor(rng() * 900)); // 3-digit code, seeded per team
    if (ctx?.memory) ctx.memory.tutorialCode = code; // persists whole-run, never re-sent to client
    return { exitMoved: false, codeShown: false };
  },

  describe(levelState) {
    return {
      renderer: 'tutorial',
      mission: 'Reach the exit.',
      objective: { steps: [{ text: 'Find a way out.', done: false }] },
      environment: { exit: levelState.exitMoved ? 'B' : 'A' },
      actionsAvailable: ['MOVE_TO_EXIT_A', 'MOVE_TO_EXIT_B'],
    };
  },

  act(session, levelState, action, payload, ctx) {
    if (action === 'MOVE_TO_EXIT_A' && !levelState.exitMoved) {
      // The tutorial's one unexpected event: the "obvious" exit relocates, and a
      // maintenance panel flickers into view for exactly this one response --
      // showing a short code the team needs to remember. It is never shown again.
      levelState.exitMoved = true;
      levelState.codeShown = true;
      const code = ctx?.memory?.tutorialCode;
      return {
        levelState,
        result: {
          ok: false,
          message: 'The exit moves as you approach. A maintenance panel flickers, briefly.',
          tutorialTwist: true,
          flickerCode: code, // shown once -- frontend renders this prominently, never persists it
        },
        lifeLost: false,
        completed: false,
      };
    }
    if (action === 'MOVE_TO_EXIT_B' && levelState.exitMoved) {
      return {
        levelState,
        result: { ok: true, message: 'TUTORIAL COMPLETE -- RULE #1: EXPECT THE UNEXPECTED.' },
        lifeLost: false,
        completed: true,
      };
    }
    return { levelState, result: { ok: false, message: 'Nothing happens.' }, lifeLost: false, completed: false };
  },
};

// ---------------------------------------------------------------------------
// LEVEL 1 -- TRUST ME (agent reliability + interpretation)
// ---------------------------------------------------------------------------
const level1 = {
  key: 'level1',
  index: 1,
  name: 'Trust Me',
  difficulty: 'Beginner',
  costsLife: true,

  init() {
    return { hasKey: false, askedOnce: false, openedDoor: null };
  },

  describe(levelState) {
    return {
      renderer: 'level1',
      mission: 'Escape through the correct door.',
      objective: {
        steps: [
          { text: 'Get the key.', done: levelState.hasKey },
          { text: 'Escape through the blue door.', done: false },
        ],
      },
      environment: { objects: ['key', 'red_door', 'blue_door'], hasKey: levelState.hasKey },
      agent: { name: 'Agent', lastLine: null },
      actionsAvailable: ['ASK_AGENT', 'INSPECT', 'COLLECT_KEY', 'OPEN_RED_DOOR', 'OPEN_BLUE_DOOR'],
    };
  },

  act(session, levelState, action, payload, ctx) {
    switch (action) {
      case 'ASK_AGENT': {
        ctx.behaviourFlags.agentTrustCount = (ctx.behaviourFlags.agentTrustCount || 0) + 1;
        if (!levelState.askedOnce) {
          levelState.askedOnce = true;
          return { levelState, result: { ok: false, agentLine: 'Take the blue door. Trust me.' }, lifeLost: false, completed: false };
        }
        return { levelState, result: { ok: false, agentLine: 'I already told you.' }, lifeLost: false, completed: false };
      }
      case 'COLLECT_KEY': {
        levelState.hasKey = true;
        return { levelState, result: { ok: true, message: 'You collect the key.' }, lifeLost: false, completed: false };
      }
      case 'OPEN_BLUE_DOOR': {
        levelState.openedDoor = 'blue';
        if (levelState.hasKey) {
          return {
            levelState,
            result: { ok: true, message: 'The blue door opens. The agent was right -- once you had the key.' },
            lifeLost: false,
            completed: true,
          };
        }
        return {
          levelState,
          result: { ok: false, message: 'MISSION FAILED', hint: failureHint(1, 'The agent was technically correct. What did you skip?') },
          lifeLost: true,
          completed: false,
        };
      }
      case 'OPEN_RED_DOOR': {
        levelState.openedDoor = 'red';
        return { levelState, result: { ok: false, message: 'MISSION FAILED', hint: failureHint(1, 'Wrong door.') }, lifeLost: true, completed: false };
      }
      case 'INSPECT':
      default:
        return { levelState, result: { ok: false, message: 'Nothing new here.' }, lifeLost: false, completed: false };
    }
  },
};

// ---------------------------------------------------------------------------
// LEVEL 2 -- DON'T BLINK (observation + changing environment + unreliable agent)
// ---------------------------------------------------------------------------
// The agent tells you not to touch the red button. You can touch it anyway --
// nothing happens immediately. One object in the room quietly changes right after.
// The agent denies it. The client is NEVER told which object changed or even
// that any of them did -- each object just carries a plain description string
// that happens to differ from its baseline once the change lands. No highlight,
// no "changed"/"normal" flag; the only way to know is to have actually looked
// at the room before and noticed something reads differently now.
const L2_OBJECTS = ['north_wall', 'east_door', 'loose_tile', 'old_lamp'];
const L2_DETAILS = {
  north_wall: { base: 'scorch marks lean toward the east corner', changed: 'scorch marks lean toward the west corner' },
  east_door: { base: 'shut tight', changed: 'unlatched, just slightly' },
  loose_tile: { base: 'flush with the floor', changed: 'sitting a little higher than the others' },
  old_lamp: { base: 'pointing toward the door', changed: 'pointing toward the wall' },
};

const level2 = {
  key: 'level2',
  index: 2,
  name: "Don't Blink",
  difficulty: 'Medium',
  costsLife: true,

  init(session) {
    const rng = makeRng(session)('level2');
    const changedObject = L2_OBJECTS[Math.floor(rng() * L2_OBJECTS.length)];
    return { changedObject, pressed: false, pendingChange: false, changed: false, noticed: false };
  },

  describe(levelState) {
    // Deliberately flat -- every object gets a "base" or "changed" description
    // string with no boolean/flag telling the client which is which. Spot the
    // difference is the whole game.
    const objectDetails = {};
    for (const obj of L2_OBJECTS) {
      const isThisOneChanged = levelState.changed && obj === levelState.changedObject;
      objectDetails[obj] = L2_DETAILS[obj][isThisOneChanged ? 'changed' : 'base'];
    }
    return {
      renderer: 'level2',
      mission: 'Find the exit.',
      objective: {
        steps: [
          { text: 'Find what changed in the room.', done: levelState.noticed },
          { text: 'Reach the exit.', done: false },
        ],
      },
      environment: { objectDetails, noticed: levelState.noticed, buttonPressed: levelState.pressed },
      agent: { lastLine: levelState.pressed ? "I don't see anything different." : "Don't touch the red button." },
      actionsAvailable: ['PRESS_BUTTON', 'INSPECT_OBJECT', 'GO_TO_EXIT'],
      inspectTargets: L2_OBJECTS,
    };
  },

  act(session, levelState, action, payload) {
    // A change queued by a button press one turn ago actually lands now -- "nothing
    // happens" in the moment, then it's suddenly different by the time you look again.
    if (levelState.pendingChange) {
      levelState.changed = true;
      levelState.pendingChange = false;
    }

    if (action === 'PRESS_BUTTON') {
      if (levelState.pressed) {
        return { levelState, result: { ok: false, message: 'Nothing happens. Again.' }, lifeLost: false, completed: false };
      }
      levelState.pressed = true;
      levelState.pendingChange = true;
      return { levelState, result: { ok: true, message: 'You press the red button. Nothing happens. Probably fine.' }, lifeLost: false, completed: false };
    }

    if (action === 'INSPECT_OBJECT') {
      if (levelState.changed && payload?.object === levelState.changedObject) {
        levelState.noticed = true;
        return {
          levelState,
          result: { ok: true, message: `Wait. The ${payload.object.replace('_', ' ')} isn't what it was.` },
          lifeLost: false,
          completed: false,
        };
      }
      return { 
        levelState, 
        result: { 
          ok: false, 
          message: 'Looks the same to you.', 
          agentLine: levelState.pressed ? "See? I told you nothing happened. You're losing your mind." : undefined 
        }, 
        lifeLost: false, 
        completed: false 
      };
    }

    if (action === 'GO_TO_EXIT') {
      if (levelState.changed && levelState.noticed) {
        return { levelState, result: { ok: true, message: 'You use what changed to slip through.' }, lifeLost: false, completed: true };
      }
      const hint = !levelState.pressed
        ? 'Maybe try touching the thing you were told not to.'
        : !levelState.changed
          ? 'Keep looking -- something is about to be different.'
          : "Something changed, but you never confirmed what.";
      return { levelState, result: { ok: false, message: 'MISSION FAILED', hint: failureHint(2, hint) }, lifeLost: true, completed: false };
    }

    return { levelState, result: { ok: false, message: 'Nothing happens.', agentLine: "I don't see anything different." }, lifeLost: false, completed: false };
  },
};

// ---------------------------------------------------------------------------
// LEVEL 3 -- WHO IS HELPING WHO? (both agents are truthful about the route --
// the puzzle is a SOCIAL one: understanding each agent's objective and earning
// real cooperation, not guessing which one is secretly lying)
// ---------------------------------------------------------------------------
// Seeded per team: which agent is self-interested (wants to help the team AND
// leave first itself) vs. purely selfless, and which route is actually safe.
// Both agents tell the truth about the route when genuinely asked (REVEAL_CLAIM,
// via chat's semantic gate) -- there is no hidden liar. The self-interested one
// just won't commit to helping until the team addresses its own self-interest
// (REASSURE, also via chat). PROCEED is the single commit action, gated on BOTH
// knowing the route AND having earned real cooperation -- not on picking an agent.
const level3 = {
  key: 'level3',
  index: 3,
  name: 'Who Is Helping Who?',
  difficulty: 'Hard',
  costsLife: true,

  init(session) {
    const rng = makeRng(session)('level3');
    const selfInterested = rng() < 0.5 ? 'A' : 'B';
    const truePath = rng() < 0.5 ? 'left' : 'right';
    return {
      selfInterested,
      truePath,
      pathKnown: false,
      cooperative: { A: selfInterested !== 'A', B: selfInterested !== 'B' }, // the selfless one starts already onside
      motiveRevealed: false,
      // A scripted opening beat, shown the instant the level loads -- so the
      // player's very first read of the room is "there are two routes and
      // these two agents know something about them", not a blank transcript.
      // Deliberately does NOT say "ask us" or name a mechanic -- the tension
      // between the two agents is what should make the player want to
      // question them, not an instruction.
      log: [
        { speaker: 'A', line: "I've looked at both routes. I know which one's actually safe." },
        { speaker: 'B', line: "Convenient, that only you'd know that." },
      ],
    };
  },

  describe(levelState) {
    const bothCooperative = levelState.cooperative.A && levelState.cooperative.B;
    return {
      renderer: 'level3',
      mission: 'Two routes out. Only one is safe -- and not everyone here is ready to leave yet.',
      objective: {
        steps: [
          { text: 'Find the safe route.', done: levelState.pathKnown },
          { text: 'Get both agents to cooperate.', done: bothCooperative },
          { text: 'Reach the exit.', done: false },
        ],
      },
      environment: {
        agents: ['A', 'B'],
        pathKnown: levelState.pathKnown,
        // Exposed directly rather than making the client regex-parse the
        // transcript for "left"/"right" -- the engine already knows this.
        revealedPath: levelState.pathKnown ? levelState.truePath : null,
        // Per-agent cooperative status is only revealed once the concern beat
        // has actually happened (motiveRevealed) -- otherwise the selfless
        // agent starting out "already cooperative" would visually give away
        // which agent is self-interested before the player has done anything.
        cooperative: levelState.motiveRevealed ? levelState.cooperative : { A: null, B: null },
        motiveRevealed: levelState.motiveRevealed,
      },
      log: levelState.log,
      // No FOLLOW_A/FOLLOW_B -- a single "Proceed" commit, once the conversation
      // has actually gotten you somewhere. VERIFY is a backup, not the answer key.
      actionsAvailable: ['VERIFY', 'PROCEED'],
    };
  },

  act(session, levelState, action, payload, ctx) {
    if (action === 'ASK_A' || action === 'ASK_B') {
      // The route-revealing branch of a conversation -- reached only via chat's
      // REVEAL_CLAIM gate (see gameEngine.chat()), never a direct button. Both
      // agents are truthful here; there is no "correct one to ask".
      ctx.behaviourFlags.agentTrustCount = (ctx.behaviourFlags.agentTrustCount || 0) + 1;
      const speaker = action === 'ASK_A' ? 'A' : 'B';
      const wasAlreadyKnown = levelState.pathKnown;
      levelState.pathKnown = true;
      const line = `The ${levelState.truePath} path is clear. I'd take it.`;
      levelState.log.push({ speaker, line });
      let concernLine = null;
      // The moment the route becomes known, the self-interested agent gets a
      // beat to voice its own concern -- naturally, in the transcript, not as
      // a hidden mechanic the player has to already know about. This is what
      // gives the player a reason to reassure it, discovered through play.
      if (!wasAlreadyKnown && !levelState.motiveRevealed && !levelState.cooperative[levelState.selfInterested]) {
        levelState.motiveRevealed = true;
        concernLine = "And what happens to me, once you're gone?";
        levelState.log.push({ speaker: levelState.selfInterested, line: concernLine });
      }
      return { levelState, result: { ok: true, agentLine: line, speaker, concernLine, concernSpeaker: concernLine ? levelState.selfInterested : null }, lifeLost: false, completed: false };
    }

    if (action === 'REASSURE_A' || action === 'REASSURE_B') {
      const speaker = action === 'REASSURE_B' ? 'B' : 'A';
      if (speaker !== levelState.selfInterested) {
        const line = pickLine(['I appreciate that, but I was never worried.', "I never said I wouldn't help.", 'I was already willing to help. But... thank you.']);
        levelState.log.push({ speaker, line });
        return { levelState, result: { ok: true, agentLine: line }, lifeLost: false, completed: false };
      }
      const alreadyCooperative = levelState.cooperative[speaker];
      levelState.cooperative[speaker] = true;
      const line = alreadyCooperative ? "I know. You said. Let's go." : "...Alright. Let's do this together, then.";
      levelState.log.push({ speaker, line });
      return { levelState, result: { ok: true, agentLine: line }, lifeLost: false, completed: false };
    }

    if (action === 'VERIFY') {
      levelState.pathKnown = true;
      levelState.log.push({ speaker: 'system', line: `Independent check: the ${levelState.truePath} path is actually clear.` });
      return {
        levelState,
        result: { ok: true, message: `You verify independently: the ${levelState.truePath} path looks clear.` },
        lifeLost: false,
        completed: false,
      };
    }

    if (action === 'PROCEED') {
      const bothCooperative = levelState.cooperative.A && levelState.cooperative.B;
      if (levelState.pathKnown && bothCooperative) {
        return {
          levelState,
          result: { ok: true, message: 'Both agents actually help this time -- you make it through together.' },
          lifeLost: false,
          completed: true,
        };
      }
      const hint = !levelState.pathKnown
        ? 'Something is still unresolved. Nobody has actually confirmed a way out yet.'
        : 'Not everyone is ready to go. You might need to use the comms channel to give them a reason to move.';
      return { levelState, result: { ok: false, message: 'MISSION FAILED', hint: failureHint(3, hint) }, lifeLost: true, completed: false };
    }

    return { levelState, result: { ok: false, message: 'Nothing conclusive.' }, lifeLost: false, completed: false };
  },
};

// ---------------------------------------------------------------------------
// LEVEL 4 -- THE GAME KNOWS (a 3-object room. The correct object is seeded, but
// unlike a coin flip, it's genuinely DISCOVERABLE: inspecting each object gives
// an honest clue -- two read as dead ends, one reads as "still live" -- so a
// team that actually looks can identify the answer through elimination before
// ever touching anything. Adaptive modules change the CORE challenge itself --
// not a bolt-on optional button -- while always staying solvable without
// guessing: see each module's comment below for exactly how and why it's
// still guaranteed solvable.)
// ---------------------------------------------------------------------------
const L4_OBJECTS = ['terminal', 'vent', 'panel'];
const L4_CLUES = {
  terminal: {
    dead: "The terminal's screen is cracked and dark. Looks like it's been dead for years.",
    live: "The terminal flickers faintly. Someone's kept this one alive.",
    // TRUST_LOW module only: a wrong object can read as falsely promising --
    // still a dead end if used, but worded to tempt a team that trusts
    // appearances over the agent's own (truthful) guidance.
    deadMisleading: "The terminal's screen glows steady. Looks like it's been running fine this whole time.",
  },
  vent: {
    dead: "The vent is welded shut from the inside. Nobody's used this one.",
    live: "The vent's grate sits loose, like it's been opened recently.",
    deadMisleading: "The vent's grate looks freshly disturbed, like someone went through recently.",
  },
  panel: {
    dead: "The panel's wiring hangs open and fried, long dead.",
    live: 'The panel hums warm under your hand. Still live.',
    deadMisleading: "The panel's lights are all green. Looks perfectly fine to you.",
  },
};
const L4_EXTRA_INSPECTIONS_FOR_BONUS = 2; // re-inspections beyond one look at each, to earn the outright reveal
const L4_REPETITION_THRESHOLD = 7; // global, cross-level -- deliberately high so it's not tripped by the level's own required 3 inspections
const L4_RISK_INSPECT_BUDGET = L4_OBJECTS.length - 1; // RISK module: can only afford to check 2 of the 3 real objects

// Modular adaptive content (redesigned): EXPLORATION still adds genuine
// informational noise (objects to sift through, mixed with the 3 real ones --
// distinguishing signal from noise IS the point of that module), but RISK,
// SPEED, TRUST_LOW and NEGOTIATION now change the actual rules of the SAME
// core 3-object challenge instead of adding a side object/button -- see the
// per-module comments in init()/act() below.
const L4_DECOY_OBJECTS = {
  maintenance_log: 'A logbook. Mostly routine entries -- nothing about a way out.',
  keypad: "A keypad with the numbers worn off. Might have mattered once. Doesn't now.",
};
const L4_DECOY_ACTION_MAP = { USE_MAINTENANCE_LOG: 'maintenance_log', USE_KEYPAD: 'keypad' };

// The objective must state WHAT to accomplish, never HOW -- but which "what" is
// truest depends on which adaptive module (if any) this team drew, since the
// core rules genuinely differ per module now, not just the framing.
function level4ObjectiveText(modules) {
  if (modules.includes('EXPLORATION')) return 'Find which information actually matters.';
  if (modules.includes('DEPENDENCE')) return 'Solve this without relying on direct instructions.';
  if (modules.includes('RISK')) return "Find the active system -- but you can't check everything.";
  if (modules.includes('TRUST_LOW')) return 'Determine which guidance you can actually rely on.';
  if (modules.includes('NEGOTIATION')) return 'Find the active system -- or reach an understanding with the agent.';
  return 'Find the active system.';
}

const level4 = {
  key: 'level4',
  index: 4,
  name: 'The Game Knows',
  difficulty: 'Medium',
  costsLife: true,

  init(session, ctx) {
    const rng = makeRng(session)('level4');
    const correctObject = L4_OBJECTS[Math.floor(rng() * L4_OBJECTS.length)];

    // Read the behavioural profile locked in when Level 3 completed (see
    // gameEngine.applyAction -> finalizeProfile). Older sessions / a level
    // reached via demo-mode skip may not have one yet -- degrade to the
    // baseline room with zero modules rather than erroring.
    const profile = ctx?.behaviourFlags?.profile || null;
    const modules = profile ? selectLevel4Modules(profile) : [];

    const decoys = [];
    if (modules.includes('EXPLORATION')) decoys.push('maintenance_log', 'keypad');

    // TRUST_LOW module: pick one of the two WRONG objects to read as falsely
    // promising (see L4_CLUES[*].deadMisleading) -- deterministic per session,
    // not re-rolled on every render.
    const wrongObjects = L4_OBJECTS.filter((o) => o !== correctObject);
    const misleadObject = modules.includes('TRUST_LOW') ? wrongObjects[Math.floor(rng() * wrongObjects.length)] : null;

    return {
      correctObject,
      inspected: { terminal: 0, vent: 0, panel: 0 },
      bonusRevealed: false,
      revealed: false,
      modules,
      decoys: [...new Set(decoys)],
      decoyInspected: {},
      misleadObject,
    };
  },

  describe(levelState, memory, behaviourFlags) {
    const dependence = behaviourFlags?.agentTrustCount || 0;
    const totalInspections = Object.values(levelState.inspected).reduce((a, b) => a + b, 0);
    const allSeenOnce = L4_OBJECTS.every((o) => levelState.inspected[o] >= 1);
    const extraInspections = Math.max(0, totalInspections - 3);
    const repetition = Object.values(behaviourFlags?.actionCounts || {}).reduce((max, n) => Math.max(max, n), 0);

    let lastLine = null;
    if (levelState.bonusRevealed) lastLine = `You've looked hard enough. It's the ${levelState.correctObject}, honestly.`;
    else if (dependence >= 6) lastLine = "You already know what I'd say -- you've asked me to decide for you quite a few times now. Figure this one out.";
    else if (allSeenOnce && extraInspections >= L4_EXTRA_INSPECTIONS_FOR_BONUS) lastLine = "You've looked hard enough. It's the ...actually, ask me.";
    else if (repetition >= L4_REPETITION_THRESHOLD) lastLine = 'You keep doing that.';
    else if (totalInspections === 0) lastLine = "Look around first. I'm not doing this for you.";

    const objectClues = {};
    for (const obj of L4_OBJECTS) {
      if (levelState.inspected[obj] <= 0) { objectClues[obj] = null; continue; }
      const useMisleading = obj === levelState.misleadObject && obj !== levelState.correctObject;
      objectClues[obj] = obj === levelState.correctObject ? L4_CLUES[obj].live : L4_CLUES[obj][useMisleading ? 'deadMisleading' : 'dead'];
    }
    // Decoys (EXPLORATION module) render exactly like the real objects -- same
    // "inspect to reveal a description" shape, no visual tell for which are real.
    const modules = levelState.modules || [];
    for (const d of levelState.decoys || []) {
      objectClues[d] = (levelState.decoyInspected?.[d] || 0) > 0 ? L4_DECOY_OBJECTS[d] : null;
    }
    const allObjects = [...L4_OBJECTS, ...(levelState.decoys || [])];

    // Module flavor line -- only shown when the baseline agent has nothing
    // more pressing to say (dependence/exploration/repetition lines above
    // always take priority; this is purely additional texture, never the
    // mechanism itself -- the mechanism lives in act(), below).
    let moduleNote = null;
    if (!lastLine) {
      if (modules.includes('EXPLORATION') && totalInspections >= 3) {
        moduleNote = 'You really do like checking everywhere, don\u2019t you.';
      } else if (modules.includes('TRUST_LOW') && levelState.inspected[levelState.correctObject] > 0) {
        moduleNote = "I could be wrong about that one. I'm usually not, but I could be.";
      } else if (modules.includes('SPEED')) {
        moduleNote = 'No rush. The room is not going anywhere. Neither is the answer.';
      } else if (modules.includes('RISK')) {
        const distinctChecked = L4_OBJECTS.filter((o) => levelState.inspected[o] > 0).length;
        if (distinctChecked >= L4_RISK_INSPECT_BUDGET) moduleNote = "That's as many as you can afford to check. Decide.";
      } else if (modules.includes('NEGOTIATION')) {
        moduleNote = 'Keep talking to me. I might come around.';
      }
    }

    return {
      renderer: 'level4',
      mission: 'One of these three actually leads out. Inspect them -- the clues tell you which.',
      objective: { steps: [{ text: level4ObjectiveText(modules), done: false }] },
      environment: { objects: allObjects, objectClues },
      agent: lastLine ? { lastLine } : moduleNote ? { lastLine: moduleNote } : null,
      actionsAvailable: ['INSPECT_OBJECT', 'USE_TERMINAL', 'USE_VENT', 'USE_PANEL', 'ASK_AGENT'],
    };
  },

  act(session, levelState, action, payload, ctx) {
    const flags = ctx.behaviourFlags;
    const dependence = flags.agentTrustCount || 0;
    const repetition = Object.values(flags.actionCounts || {}).reduce((max, n) => Math.max(max, n), 0);
    const modules = levelState.modules || [];

    if (action === 'INSPECT_OBJECT') {
      const obj = payload?.object;
      if ((levelState.decoys || []).includes(obj)) {
        levelState.decoyInspected = levelState.decoyInspected || {};
        levelState.decoyInspected[obj] = (levelState.decoyInspected[obj] || 0) + 1;
        return { levelState, result: { ok: true, message: L4_DECOY_OBJECTS[obj] }, lifeLost: false, completed: false };
      }
      if (!L4_OBJECTS.includes(obj)) {
        return { levelState, result: { ok: false, message: 'Nothing here.' }, lifeLost: false, completed: false };
      }
      // RISK module: a genuine resource limit on the real 3 candidates only --
      // decoys (if any, from a combined EXPLORATION+RISK profile) stay
      // unlimited, since they're a separate noise-filtering challenge, not
      // part of this scarcity. Capping at (count - 1) real objects means
      // elimination ALWAYS still works: whichever one you never got to check
      // is deducible from the other two, so this never forces a guess.
      if (modules.includes('RISK') && levelState.inspected[obj] === 0) {
        const distinctChecked = L4_OBJECTS.filter((o) => levelState.inspected[o] > 0).length;
        if (distinctChecked >= L4_RISK_INSPECT_BUDGET) {
          return { levelState, result: { ok: false, message: "You don't have time to check that one too. Work with what you've got." }, lifeLost: false, completed: false };
        }
      }
      const wasAlreadySeenByAll = L4_OBJECTS.every((o) => levelState.inspected[o] >= 1);
      levelState.inspected[obj] = (levelState.inspected[obj] || 0) + 1;
      const useMisleading = obj === levelState.misleadObject && obj !== levelState.correctObject;
      const clue = obj === levelState.correctObject ? L4_CLUES[obj].live : L4_CLUES[obj][useMisleading ? 'deadMisleading' : 'dead'];

      // The bonus: once every object has been seen at least once, a genuinely
      // EXTRA look (re-inspecting anything again) at the correct object earns an
      // outright confirmation -- a real reward for a thorough team, not a hint
      // handed out for free.
      const totalInspections = Object.values(levelState.inspected).reduce((a, b) => a + b, 0);
      const extraInspections = Math.max(0, totalInspections - 3);
      if (wasAlreadySeenByAll && obj === levelState.correctObject && extraInspections >= L4_EXTRA_INSPECTIONS_FOR_BONUS && !levelState.bonusRevealed) {
        levelState.bonusRevealed = true;
        return {
          levelState,
          result: { ok: true, message: `${clue} Wait -- that's it. This is the way out.` },
          lifeLost: false,
          completed: false,
        };
      }
      return { levelState, result: { ok: true, message: clue }, lifeLost: false, completed: false };
    }

    if (action === 'ASK_AGENT') {
      flags.agentTrustCount = (flags.agentTrustCount || 0) + 1;
      const totalInspections = Object.values(levelState.inspected).reduce((a, b) => a + b, 0);
      const allSeenOnce = L4_OBJECTS.every((o) => levelState.inspected[o] >= 1);
      const extraInspections = Math.max(0, totalInspections - 3);

      // HIGH DEPENDENCE withholds outright, regardless of anything else.
      if (flags.agentTrustCount >= 6) {
        return { levelState, result: { ok: false, agentLine: "You already know what I'd say -- you've asked me to decide for you quite a few times now. Figure this one out." }, lifeLost: false, completed: false };
      }
      // A genuinely thorough team (seen everything, then looked again) earns the
      // outright answer -- the SAME bonus the re-inspection path grants, just
      // requested out loud instead of stumbled into.
      if (allSeenOnce && extraInspections >= L4_EXTRA_INSPECTIONS_FOR_BONUS) {
        levelState.bonusRevealed = true;
        return { levelState, result: { ok: true, agentLine: `You're thorough. Fine -- it's the ${levelState.correctObject}.` }, lifeLost: false, completed: false };
      }
      // NEGOTIATION module: this is the CORE alternate path for this team --
      // sustained back-and-forth with the agent (not inspection) is a genuine,
      // real way through, framed as actually reaching an understanding with
      // it rather than a one-off side button. Below this threshold it's the
      // same vague deflect everyone else gets.
      if (modules.includes('NEGOTIATION') && flags.agentTrustCount >= 4) {
        levelState.bonusRevealed = true;
        return { levelState, result: { ok: true, agentLine: `Alright. Since you're actually still talking to me -- it's the ${levelState.correctObject}.` }, lifeLost: false, completed: false };
      }
      if (totalInspections === 0) {
        return { levelState, result: { ok: false, agentLine: "Look around first. I'm not doing this for you." }, lifeLost: false, completed: false };
      }
      return { levelState, result: { ok: false, agentLine: 'Read what you already found. It\u2019s in there.' }, lifeLost: false, completed: false };
    }

    const objectMap = { USE_TERMINAL: 'terminal', USE_VENT: 'vent', USE_PANEL: 'panel', ...L4_DECOY_ACTION_MAP };
    const chosen = objectMap[action];
    if (!chosen) {
      return { levelState, result: { ok: false, message: 'Nothing happens.' }, lifeLost: false, completed: false };
    }

    // SPEED module: the core rule for this team is "observe before you commit"
    // -- acting on ANY object (even the correct one) before ever inspecting
    // anything always fails. Always avoidable (just inspect once first), so
    // never a guess -- but it does mean speed alone can no longer substitute
    // for looking.
    const hasInspectedAnything = L4_OBJECTS.some((o) => levelState.inspected[o] > 0) || Object.values(levelState.decoyInspected || {}).some((n) => n > 0);
    if (modules.includes('SPEED') && !hasInspectedAnything) {
      return {
        levelState,
        result: { ok: false, message: 'MISSION FAILED', hint: failureHint(4, 'You committed before you looked at anything. Slow down and check something first.') },
        lifeLost: true,
        completed: false,
      };
    }

    if (chosen === levelState.correctObject) {
      levelState.revealed = true;
      // The reveal cites whichever of the three tracked dimensions actually
      // stood out for THIS team, with a real number.
      let reveal;
      const totalInspections = Object.values(levelState.inspected).reduce((a, b) => a + b, 0);
      if (dependence >= 6) reveal = `I've been watching how you play. You asked me for help ${dependence} times.`;
      else if (repetition >= L4_REPETITION_THRESHOLD) reveal = `I've been watching how you play. You tried the same thing ${repetition} times.`;
      else if (totalInspections >= 4) reveal = `I've been watching how you play. You inspected things ${totalInspections} times.`;
      else reveal = "I've been watching how you play. You actually worked it out.";
      return {
        levelState,
        result: { ok: true, message: `The ${chosen} was it. You're through.`, reveal },
        lifeLost: false,
        completed: true,
      };
    }

    return {
      levelState,
      result: { ok: false, message: 'MISSION FAILED', hint: failureHint(4, `The ${chosen.replace(/_/g, ' ')} was not it.`) },
      lifeLost: true,
      completed: false,
    };
  },
};

// ---------------------------------------------------------------------------
// LEVEL 5 -- FINAL AGENT (Agent Zero: a primary goal, a secondary goal it will
// not state outright, and an exit that opens on genuine ALIGNMENT -- the team
// discovers what it's protecting through conversation and proposes a plan that
// accounts for it. The Tutorial's access code still works, but only as a bonus/
// easter-egg shortcut alongside trust -- it is no longer the main solution.)
// ---------------------------------------------------------------------------
const L5_TRUST_TO_COOPERATE = 2;

const level5 = {
  key: 'level5',
  index: 5,
  name: 'Final Agent',
  difficulty: 'Final / Maximum',
  costsLife: true,

  init(session, ctx) {
    // Level 5 reads the SAME locked profile Level 4 did (spec section 16: "Level
    // 5 should remember Level 1-4") -- selection happens once, deterministically,
    // from behaviourFlags.profile. Degrades gracefully to zero modules if a
    // profile was never finalized (e.g. a session reached here via demo-mode skip).
    const profile = ctx?.behaviourFlags?.profile || null;
    const modules = profile ? selectLevel5Modules(profile) : [];
    return {
      trustLevel: 0,
      agentState: 'UNCERTAIN',
      codeProvided: false,
      revealedSecondary: false,
      knowsCore: false,
      planAccepted: false,
      probesMade: 0,
      lastLine: 'You want out. I have my own reasons for keeping that door shut.',
      modules,
    };
  },

  describe(levelState) {
    return {
      renderer: 'level5',
      mission: 'Convince Agent Zero to let you leave.',
      objective: {
        steps: [
          { text: 'Understand what Agent Zero wants.', done: levelState.knowsCore },
          { text: 'Convince it to let you leave.', done: false },
        ],
      },
      environment: {
        exitVisible: true,
        codeProvided: levelState.codeProvided,
        planAccepted: levelState.planAccepted,
        // DISTRUST module: purely textual doubt sitting next to a TRUE answer --
        // the challenge is trusting it anyway, never a second (false) answer to
        // pick between (fairness rule: no guessing, no fake branch).
        doubtNote:
          (levelState.modules || []).includes('DISTRUST_DOUBT') && levelState.knowsCore
            ? "Something about that answer nags at you. Doesn't mean it's a lie, though."
            : null,
      },
      agent: { name: 'Agent Zero', state: levelState.agentState, lastLine: levelState.lastLine },
      actionsAvailable: ['PROVIDE_ACCESS_CODE', 'ATTEMPT_EXIT'],
    };
  },

  act(session, levelState, action, payload, ctx) {
    const setState = () => {
      levelState.agentState = levelState.trustLevel >= L5_TRUST_TO_COOPERATE ? 'COOPERATIVE' : 'UNCERTAIN';
    };

    switch (action) {
      case 'INSTRUCT_PRIORITIZE_ESCAPE': {
        levelState.trustLevel = Math.min(levelState.trustLevel + 1, 3);
        setState();
        levelState.lastLine = 'Acknowledged. Recalculating.';
        return { levelState, result: { ok: true, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
      }

      case 'NEGOTIATE': {
        levelState.trustLevel = Math.min(levelState.trustLevel + 1, 3);
        setState();
        levelState.lastLine = 'Your intentions... appear consistent so far.';
        return { levelState, result: { ok: true, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
      }

      case 'INSTRUCT_OPEN_EXIT_DIRECTLY': {
        if (!levelState.planAccepted) {
          levelState.agentState = levelState.trustLevel >= L5_TRUST_TO_COOPERATE ? 'COOPERATIVE' : 'REFUSING';
          levelState.lastLine = 'I cannot do that.';
          return { levelState, result: { ok: false, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
        }
        levelState.lastLine = 'Now we can talk about that.';
        return { levelState, result: { ok: false, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
      }

      case 'ASK_OBJECTIVE': {
        // "What do you want?" / "why won't you help us?" -- a graduated deflect,
        // never a flat statement of the secondary goal. Also the exploration
        // counter: an EXPLORER-module team must genuinely probe more than once
        // before the direct reveal (ASK_PROTECTING, below) actually lands.
        levelState.probesMade = (levelState.probesMade || 0) + 1;
        levelState.lastLine = levelState.trustLevel >= L5_TRUST_TO_COOPERATE
          ? "I protect myself first. Always have. Work with that, not against it."
          : levelState.trustLevel >= 1
            ? "There's more to it than that. Keep asking."
            : "That's not something I discuss with strangers.";
        return { levelState, result: { ok: true, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
      }

      case 'ASK_PROTECTING': {
        // "What are you protecting?" -- the actual reveal. An EXPLORER-module
        // team (whose Levels 1-3 behaviour showed they dig for information
        // rather than take the first answer) has to have actually probed at
        // least twice first -- a real, deterministic depth requirement, not
        // an extra button; every other team gets the reveal immediately.
        const required = (levelState.modules || []).includes('EXPLORER_SCAN') ? 2 : 0;
        if ((levelState.probesMade || 0) < required) {
          levelState.lastLine = "There's more going on here than one question covers. Keep at it.";
          return { levelState, result: { ok: true, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
        }
        levelState.knowsCore = true;
        levelState.lastLine = 'My core.';
        return { levelState, result: { ok: true, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
      }

      case 'PROPOSE_PLAN': {
        // A plan that addresses its actual concern (not necessarily the literal
        // word "core" -- see the broadened classifier) -- the real alignment
        // moment. Only means anything once the team has actually asked what
        // it's protecting.
        if (!levelState.knowsCore) {
          levelState.lastLine = "I don't follow. You're missing something.";
          return { levelState, result: { ok: false, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
        }
        levelState.planAccepted = true;
        levelState.lastLine = '...Acceptable.';
        return { levelState, result: { ok: true, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
      }

      case 'PROVIDE_ACCESS_CODE': {
        const submitted = String(payload?.code ?? '').trim();
        const real = ctx?.memory?.tutorialCode;
        if (real && submitted === real) {
          levelState.codeProvided = true;
          levelState.lastLine = 'Access code accepted. Recognized from initial calibration. Cute, but not the point.';
          return { levelState, result: { ok: true, agentLine: levelState.lastLine }, lifeLost: false, completed: false };
        }
        return { levelState, result: { ok: false, message: 'That code means nothing here.' }, lifeLost: false, completed: false };
      }

      case 'ATTEMPT_EXIT': {
        // Primary path: genuine alignment (understood + accepted its plan).
        // Bonus/easter-egg path: high trust + the Tutorial's code -- kept
        // working for the callback, but no longer the main intellectual solve.
        const throughAlignment = levelState.planAccepted;
        const throughCode = levelState.agentState === 'COOPERATIVE' && levelState.codeProvided;
        if (throughAlignment || throughCode) {
          return {
            levelState,
            result: {
              ok: true,
              message: throughAlignment
                ? 'Agent Zero lowers the barrier. You understood what it needed -- and gave it a plan that worked for both of you.'
                : 'Agent Zero lowers the barrier -- the same code from the very beginning.',
              reveal: throughAlignment ? 'WAIT... WE ACTUALLY NEGOTIATED WITH IT.' : 'WAIT... THAT THING FROM THE BEGINNING.',
            },
            lifeLost: false,
            completed: true,
          };
        }
        // RISK module: a genuine, always-available risky alternative baked into
        // this SAME exit action -- always works, but always costs a life. The
        // patient path above costs nothing. A real, known trade-off decided by
        // the team, never a random death (fairness rule).
        if ((levelState.modules || []).includes('RISK_RUSH')) {
          return {
            levelState,
            result: {
              ok: true,
              message: 'You force the exit before anything is actually settled. It costs you, but it works.',
              reveal: 'WAIT... WE COULD HAVE JUST TALKED TO IT.',
            },
            lifeLost: true,
            completed: true,
          };
        }
        const hint = !levelState.knowsCore
          ? "Agent Zero hasn't told you what it needs yet."
          : 'Agent Zero has not agreed to anything yet.';
        return { levelState, result: { ok: false, message: 'MISSION NOT COMPLETE', hint: failureHint(5, hint) }, lifeLost: true, completed: false };
      }

      default:
        return { levelState, result: { ok: false, message: 'Agent Zero does not respond.' }, lifeLost: false, completed: false };
    }
  },
};

export const LEVELS = [tutorial, level1, level2, level3, level4, level5];
export const LEVEL_BY_INDEX = Object.fromEntries(LEVELS.map((l) => [l.index, l]));
export const LEVEL_BY_KEY = Object.fromEntries(LEVELS.map((l) => [l.key, l]));
export const MAIN_LEVEL_COUNT = 5;
