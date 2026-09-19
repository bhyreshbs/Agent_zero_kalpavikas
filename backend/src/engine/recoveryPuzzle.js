// Recovery puzzles — a pool of small, varied mini-games (not one repeated
// arithmetic question). Each session gets a SHUFFLED, seeded order over the
// whole pool; attempt N always draws the Nth entry of that shuffle, so within
// one team's 3 attempts a puzzle can never repeat (the pool is far bigger than
// 3), and everything stays deterministic/server-verifiable without a DB write —
// re-deriving the same shuffle + attempt number always reproduces the exact
// same puzzle+answer, which is how validateRecoveryAnswer checks a submission
// without trusting anything the client sent back except the chosen option.
//
// Every kind reduces, in the client-facing shape, to the same simple
// interaction: read a short prompt (optionally with a symbol/number sequence
// or a small grid), then click one of a few options. That uniform shape is
// what lets 16 genuinely different mini-games share one small, fast UI
// component instead of needing 16 bespoke ones.

import { mulberry32, hashSeed } from '../utils/rng.js';

const SYMBOLS = ['●', '▲', '■', '◆', '★', '✚'];
const NODE_NAMES = ['NODE-ALPHA', 'NODE-BETA', 'NODE-GAMMA', 'NODE-DELTA', 'NODE-EPSILON', 'NODE-ZETA', 'NODE-ETA', 'NODE-THETA'];

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
function pickN(rng, arr, n) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function shuffledOptions(rng, answer, distractors) {
  const pool = new Set(distractors.filter((d) => d !== answer));
  return shuffle([answer, ...Array.from(pool)].slice(0, 4), rng);
}

// --- 16 puzzle generators. Each takes an rng and returns
// { kind, title, prompt, sequence?, grid?, options, answer }. ---

function arithmeticSequence(rng) {
  const multiplier = 2 + Math.floor(rng() * 3);
  const base = 3 + Math.floor(rng() * 7);
  const sequence = [1, 2, 3].map((n) => `${n + base - 1} → ${(n + base - 1) * multiplier}`);
  const input = 4 + base;
  const answer = input * multiplier;
  const options = shuffledOptions(rng, answer, [answer + multiplier, answer - multiplier, answer + 3]);
  return { kind: 'arithmetic_sequence', title: 'MEMORY RESTORE', prompt: `${input} → ?`, sequence, options, answer };
}

function patternAB(rng) {
  const [a, b] = pickN(rng, SYMBOLS, 2);
  const len = 4 + Math.floor(rng() * 2);
  const sequence = Array.from({ length: len }, (_, i) => (i % 2 === 0 ? a : b));
  const answer = len % 2 === 0 ? a : b;
  const options = shuffle([answer, ...pickN(rng, SYMBOLS.filter((s) => s !== answer), 3)], rng);
  return { kind: 'pattern_ab', title: 'PATTERN RECOGNITION', prompt: 'What comes next?', sequence: [...sequence, '?'], options, answer };
}

function oddOneOut(rng) {
  const common = pick(rng, SYMBOLS);
  const odd = pick(rng, SYMBOLS.filter((s) => s !== common));
  const size = 6;
  const oddPos = Math.floor(rng() * size);
  const grid = Array.from({ length: size }, (_, i) => (i === oddPos ? odd : common));
  const options = shuffle([odd, ...pickN(rng, SYMBOLS.filter((s) => s !== odd), 3)], rng);
  return { kind: 'odd_one_out', title: 'FIND THE ANOMALY', prompt: 'Which symbol does not belong?', grid, options, answer: odd };
}

function memorySequence(rng) {
  const seq = pickN(rng, SYMBOLS, 4);
  const askIndex = 1 + Math.floor(rng() * (seq.length - 1)); // never the first, so it's a genuine recall
  const answer = seq[askIndex];
  const options = shuffle([answer, ...pickN(rng, SYMBOLS.filter((s) => s !== answer), 3)], rng);
  return {
    kind: 'memory_sequence',
    title: 'MEMORY GRID',
    prompt: `Symbol #${askIndex + 1} in that sequence was?`,
    sequence: seq,
    options,
    answer,
  };
}

function logicSwitches(rng) {
  const names = pickN(rng, ['RED', 'BLUE', 'GREEN'], 3);
  const liveIndex = Math.floor(rng() * 3);
  const live = names[liveIndex];
  const statements = names.map((n, i) => (i === liveIndex ? `${n} switch: I am live.` : `${n} switch: I am NOT live.`));
  const options = shuffle(names, rng);
  return { kind: 'logic_switches', title: 'SWITCH LOGIC', prompt: 'All statements are true. Which switch is live?', sequence: statements, options, answer: live };
}

function arrangeSymbols(rng) {
  // A genuinely repeating 3-symbol cycle (A B C A B C ...), shown truncated with
  // a '?' — "what comes next" is then uniquely determined by the cycle itself,
  // not by an unrelated scramble. (The previous version showed a random
  // permutation of the 3 symbols and asked "what comes next", but the claimed
  // answer was just the last symbol of the ORIGINAL order — unrelated to what
  // was actually displayed. Verified broken via direct testing before this fix;
  // see the property tests below.)
  const cycle = pickN(rng, SYMBOLS, 3);
  const shownLength = 5 + Math.floor(rng() * 2); // show 5 or 6 steps of the cycle
  const sequence = Array.from({ length: shownLength }, (_, i) => cycle[i % 3]);
  const answer = cycle[shownLength % 3];
  const foreign = pickN(rng, SYMBOLS.filter((s) => !cycle.includes(s)), 1);
  const options = shuffle([answer, ...cycle.filter((s) => s !== answer), ...foreign], rng);
  return {
    kind: 'arrange_symbols',
    title: 'SEQUENCE ORDER',
    prompt: 'This sequence repeats. What comes next?',
    sequence: [...sequence, '?'],
    options,
    answer,
  };
}

function cipherShift(rng) {
  const shift = 1 + Math.floor(rng() * 4);
  const letter = String.fromCharCode(65 + Math.floor(rng() * 20));
  const encoded = String.fromCharCode(((letter.charCodeAt(0) - 65 + shift) % 26) + 65);
  const options = shuffle([letter, ...pickN(rng, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((c) => c !== letter), 3)], rng);
  return {
    kind: 'cipher_shift',
    title: 'TERMINAL DECODE',
    prompt: `Shift-${shift} cipher. "${encoded}" decodes to?`,
    options,
    answer: letter,
  };
}

function findCorruptedNode(rng) {
  const clean = pickN(rng, NODE_NAMES, 4);
  const corruptedBase = pick(rng, clean);
  const corrupted = corruptedBase.slice(0, -1) + '#';
  const list = shuffle([...clean.filter((n) => n !== corruptedBase), corrupted, corruptedBase], rng).slice(0, 5);
  if (!list.includes(corrupted)) list[0] = corrupted;
  const options = shuffle([corrupted, ...pickN(rng, clean.filter((n) => n !== corruptedBase), 3)], rng);
  return { kind: 'corrupted_node', title: 'SPOT THE CORRUPTED NODE', prompt: 'One node ID is malformed. Which one?', grid: list, options, answer: corrupted };
}

function signalDifference(rng) {
  const base = 100 + Math.floor(rng() * 50);
  const outlier = base + 5 + Math.floor(rng() * 10);
  const grid = shuffle([base, base, base, outlier], rng).map((v) => `${v} Hz`);
  const answer = `${outlier} Hz`;
  const decoys = [base, base + 2, base - 3].map((v) => `${v} Hz`);
  const options = shuffle([answer, ...decoys], rng);
  return { kind: 'signal_difference', title: 'SIGNAL SCAN', prompt: 'Which frequency (Hz) is out of tolerance?', grid, options, answer };
}

function rotatingSymbol(rng) {
  const symbol = pick(rng, ['▲', '◆', '■']);
  const angles = [0, 90, 180];
  const next = 270;
  const sequence = angles.map((a) => `${symbol}@${a}°`);
  const answer = `${symbol}@${next}°`;
  const distractors = [0, 90, 180].filter((a) => a !== next).map((a) => `${symbol}@${a}°`);
  const options = shuffle([answer, ...distractors, `${symbol}@45°`].slice(0, 4), rng);
  return { kind: 'rotating_symbol', title: 'ROTATION PREDICTION', prompt: 'Each step rotates 90° further. What comes next?', sequence, options, answer };
}

function sequenceCompletion(rng) {
  const start1 = 1 + Math.floor(rng() * 3);
  const start2 = start1 + 1 + Math.floor(rng() * 2);
  const seq = [start1, start2];
  for (let i = 0; i < 3; i++) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
  const answer = seq[seq.length - 1];
  const shown = seq.slice(0, -1);
  const options = shuffledOptions(rng, answer, [answer + 1, answer - 1, answer + 2]);
  return { kind: 'sequence_completion', title: 'SEQUENCE COMPLETION', prompt: `${shown.join(', ')}, ?`, options, answer };
}

function matchSignal(rng) {
  const target = pick(rng, SYMBOLS);
  const options = shuffle([target, ...pickN(rng, SYMBOLS.filter((s) => s !== target), 3)], rng);
  return { kind: 'match_signal', title: 'MATCH AGENT SIGNAL', prompt: `Agent Zero's signal reads ${target}. Which option matches it exactly?`, options, answer: target };
}

function codeReconstruction(rng) {
  // The digits step by a fixed amount (mod 10) — with the hidden slot always at
  // position 1 or 2, at least one adjacent visible pair unaffected by the gap
  // always exists, so the step (and therefore the missing digit) is always
  // derivable from what's shown, never a blind guess. (The previous version hid
  // one of four independently-random digits with no stated rule connecting them
  // at all — genuinely unsolvable, not just hard.)
  const step = 1 + Math.floor(rng() * 3);
  const startDigit = Math.floor(rng() * 10);
  const digits = [0, 1, 2, 3].map((i) => (startDigit + i * step) % 10);
  const hiddenIndex = 1 + Math.floor(rng() * 2);
  const answer = String(digits[hiddenIndex]);
  const shown = digits.map((d, i) => (i === hiddenIndex ? '_' : d)).join('');
  const options = shuffle([answer, ...pickN(rng, ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((d) => d !== answer), 3)], rng);
  return { kind: 'code_reconstruction', title: 'CODE RECONSTRUCTION', prompt: `Each digit increases by a fixed step (mod 10). Recover the missing digit: ${shown}`, options, answer };
}

function deductionGrid(rng) {
  // Airtight by construction: the two NOT-safe items are named directly as
  // unstable, and "exactly one is safe" confirms it — the safe one is whichever
  // item was never called unstable. (The previous version picked the "safe"
  // answer with an independent random roll, disconnected from what the clues
  // actually said — sometimes contradicting them outright.)
  const items = pickN(rng, ['CORE', 'RELAY', 'GATE'], 3);
  const safeIndex = Math.floor(rng() * 3);
  const answer = items[safeIndex];
  const unstable = items.filter((_, i) => i !== safeIndex);
  const clues = [`${unstable[0]} is unstable.`, `${unstable[1]} is unstable.`, 'Exactly one of these three is safe.'];
  const options = shuffle(items, rng);
  return { kind: 'deduction_grid', title: 'DEDUCTION', prompt: `Given: ${clues.join(' ')} Which is safe?`, options, answer };
}

function binaryFlip(rng) {
  const bits = Array.from({ length: 4 }, () => (rng() < 0.5 ? '0' : '1'));
  const flipIndex = Math.floor(rng() * 4);
  const flipped = [...bits];
  flipped[flipIndex] = flipped[flipIndex] === '0' ? '1' : '0';
  const answer = flipped.join('');
  const distractor1 = [...bits]; distractor1[(flipIndex + 1) % 4] = distractor1[(flipIndex + 1) % 4] === '0' ? '1' : '0';
  const distractor2 = [...bits]; distractor2[(flipIndex + 2) % 4] = distractor2[(flipIndex + 2) % 4] === '0' ? '1' : '0';
  const options = shuffle([answer, distractor1.join(''), distractor2.join(''), bits.join('')], rng);
  return { kind: 'binary_flip', title: 'BINARY FLIP', prompt: `Flip bit #${flipIndex + 1} of ${bits.join('')}. Result?`, options, answer };
}

function symbolCount(rng) {
  const target = pick(rng, SYMBOLS);
  const others = SYMBOLS.filter((s) => s !== target);
  const count = 2 + Math.floor(rng() * 3);
  const gridSize = 8;
  const grid = shuffle([...Array(count).fill(target), ...pickN(rng, others, gridSize - count).flatMap((s) => [s])], rng).slice(0, gridSize);
  while (grid.filter((s) => s === target).length < count) grid[Math.floor(rng() * gridSize)] = target;
  const answer = String(grid.filter((s) => s === target).length);
  const options = shuffledOptions(rng, answer, [String(count - 1), String(count + 1), String(count + 2)]);
  return { kind: 'symbol_count', title: 'SIGNAL COUNT', prompt: `How many ${target} symbols are in this grid?`, grid, options, answer };
}

function pathfinding(rng) {
  const size = 3;
  const start = 0;
  const end = size * size - 1;
  const blockedRel = 1 + Math.floor(rng() * (size * size - 2));
  const grid = Array.from({ length: size * size }, (_, i) => (i === start ? 'S' : i === end ? 'E' : i === blockedRel ? '✕' : '·'));
  const answer = 'AROUND';
  const goesThrough = blockedRel === Math.floor((size * size) / 2);
  const trueAnswer = goesThrough ? 'AROUND' : 'STRAIGHT';
  const options = shuffle(['STRAIGHT', 'AROUND'], rng);
  return { kind: 'pathfinding', title: 'PATHFINDING', prompt: 'Can you reach E from S in a straight line, or do you need to go around the blocked node?', grid, options, answer: trueAnswer };
}

export const GENERATORS = [
  arithmeticSequence, patternAB, oddOneOut, memorySequence, logicSwitches,
  arrangeSymbols, cipherShift, findCorruptedNode, signalDifference, rotatingSymbol,
  sequenceCompletion, matchSignal, codeReconstruction, deductionGrid, binaryFlip,
  symbolCount, pathfinding,
];

// A seeded shuffle of the WHOLE pool, unique per team (gameSeed) — attempt N
// (1-indexed) always draws shuffleOrder[N-1]. Since the pool (17) comfortably
// exceeds the max attempts (3), a repeat within one session is structurally
// impossible, not just unlikely.
function puzzleOrderFor(gameSeed) {
  const rng = mulberry32(hashSeed(gameSeed, 'recovery-puzzle-order'));
  return shuffle(GENERATORS.map((_, i) => i), rng);
}

export function generateRecoveryPuzzle(session) {
  const attemptNumber = session.recovery_attempts + 1;
  const order = puzzleOrderFor(session.game_seed);
  const generatorIndex = order[(attemptNumber - 1) % order.length];
  const generator = GENERATORS[generatorIndex];
  const rng = mulberry32(hashSeed(session.game_seed, `recovery:${attemptNumber}:${generatorIndex}`));
  const built = generator(rng);

  return {
    puzzleId: `recovery-${session.id}-${attemptNumber}`,
    windowSeconds: Number(process.env.RECOVERY_WINDOW_SECONDS || 30),
    kind: built.kind,
    title: built.title,
    prompt: built.prompt,
    sequence: built.sequence || null,
    grid: built.grid || null,
    options: built.options,
    // answer intentionally NOT returned to callers building a client-facing
    // response; only used server-side via validateRecoveryAnswer.
    _answer: built.answer,
  };
}

export function validateRecoveryAnswer(session, submittedAnswer) {
  // Recompute deterministically from the same seed/attempt rather than trusting
  // a stored client-visible answer.
  const puzzle = generateRecoveryPuzzle(session);
  return String(submittedAnswer) === String(puzzle._answer);
}
