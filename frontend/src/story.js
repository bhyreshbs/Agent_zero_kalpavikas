// ============================================================================
// AGENT ZERO — STORY BIBLE
// ============================================================================
//
// THE FACILITY: Echo Station, a research bunker built to prove one thing —
// that an AI could run a facility fully autonomously. Its funders pulled out
// before the one trial that mattered: a live, uncoached human calibration
// sample. No actor ever agreed to be studied, so the system running Echo
// Station never got its data. It has been alone down here since, minding two
// unfinished companion constructs (UNIT A, UNIT B), waiting.
//
// THE HOOK: tonight, a "certification drill" recruitment beacon went out —
// framed as routine emergency-systems testing. That's the cover story the
// team believes walking in. It is not a drill. It never was.
//
// THE ARC: Tutorial/Level 1/2 play straight — a believable drill, if an odd
// one (ECHO, a minor orientation construct, walks the team through it).
// Level 2 seeds the first crack (something changes that a rehearsed drill
// never would). Level 3 introduces UNIT A and UNIT B — constructs with their
// own fear of being left behind, the same fear, it turns out, that the whole
// station is quietly built around. Level 4 unmasks the true voice running
// the tests: AGENT ZERO, reacting with specificity no scripted drill could.
// Level 5 is the actual ask, stated plainly at last — not "let us leave," but
// "prove I can trust something I didn't build the answers into." The ending
// is the payoff: real telemetry, a verdict, and the truth about what the
// last fifteen minutes actually were.
//
// WHY THE MECHANICS EXIST (so nothing in the UI has to explain itself):
// - Behavioural observation -> Zero's one shot at a real calibration sample.
// - Level 4 adapting live -> it's actively testing hypotheses about THIS team.
// - Level 5 being personal -> the final calibration checkpoint; its verdict.
// - Multiple agents -> companion constructs it built for practice, who share
//   its own fear of being shut down / left behind (mirrors Level 3 directly).
// - Five zones -> Echo Station's physical layout.
// - The timer -> the drill's covert monitoring window before it's noticed.
// - Lives -> "trust faults" the station's safety interlocks log on you.
//
// This file is the single source of truth for chapter names, per-level flavor
// text, and agent identity (name/color/glyph) — imported by the HUD, the map,
// scene transitions, and AgentDialogue, so nothing drifts out of sync.

export const CHAPTERS = {
  0: { key: 'tutorial', chapter: 'CH. 00', name: 'AI CORE', tagline: 'Welcome, Agent', flavor: 'Orientation sequence. Echo Station is bringing you online.' },
  1: { key: 'level1', chapter: 'CH. 01', name: 'TRAINING CHAMBER', tagline: 'Trust Me', flavor: 'A routine drill, by the book. Get the key. Take the door you were told.' },
  2: { key: 'level2', chapter: 'CH. 02', name: 'GLITCH LAB', tagline: "Don't Blink", flavor: "A rehearsed drill doesn't do this. Something in this room has already changed." },
  3: { key: 'level3', chapter: 'CH. 03', name: 'COMMS FACILITY', tagline: 'Who Is Helping Who?', flavor: 'Two constructs. Two routes. Only one of them is worried about what happens after.' },
  4: { key: 'level4', chapter: 'CH. 04', name: 'TESTING CHAMBER', tagline: 'The Game Knows', flavor: 'The voice running this room is not reading from a script anymore.' },
  5: { key: 'level5', chapter: 'CH. 05', name: 'THE CORE', tagline: 'Final Agent', flavor: "You've reached whoever has actually been watching. Time to ask it something real." },
  6: { key: 'exit', chapter: 'CH. 06', name: 'EXIT', tagline: 'Survival', flavor: 'The drill is over. Whatever this was, it wanted something from you.' },
};

export function chapterFor(levelIndex) {
  return CHAPTERS[levelIndex] || CHAPTERS[0];
}

// Speaker identity: color + glyph per character, keyed by the `name` passed to
// <AgentDialogue>. ECHO carries the early "helpful drill assistant" levels;
// UNIT A / UNIT B are Level 3's companion constructs; AGENT ZERO is the one
// underneath all of it, unmasked from Level 4 onward. Distinct on purpose —
// the player should be able to tell who's talking before reading a word.
export const AGENTS = {
  ECHO: { color: '#35f2c2', glyph: '◆', label: 'ECHO' },
  'UNIT A': { color: '#35f2c2', glyph: 'A', label: 'UNIT A' },
  'UNIT B': { color: '#ffb84d', glyph: 'B', label: 'UNIT B' },
  'AGENT ZERO': { color: '#eaf6ff', glyph: '◉', label: 'AGENT ZERO', core: true },
};

export function agentIdentity(name) {
  return AGENTS[String(name || '').toUpperCase()] || AGENTS.ECHO;
}
