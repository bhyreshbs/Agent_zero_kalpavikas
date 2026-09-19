// Property-based tests for the recovery puzzle pool: run hundreds/thousands of
// seeds per generator (not one) and verify every generated puzzle is
// logically sound — not just structurally well-formed. Two classes of check:
//
//  1. GENERIC (every kind): the answer appears in options exactly once, no
//     duplicate options, at least 2 options.
//  2. DERIVABILITY (as many kinds as feasible): re-derive the expected answer
//     independently from ONLY what the puzzle actually displays (prompt,
//     sequence, grid) and assert it matches puzzle.answer exactly — this is
//     what actually catches a puzzle whose displayed clues don't logically
//     imply its own answer, which the generic check alone cannot catch.
process.env.DATABASE_FILE = './data/test-recovery-property.sqlite';
import fs from 'node:fs';
try { fs.unlinkSync('./data/test-recovery-property.sqlite'); } catch {}

const { mulberry32, hashSeed } = await import('../src/utils/rng.js');
const { GENERATORS } = await import('../src/engine/recoveryPuzzle.js');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL  ${label}`); }
}

const N = 2000; // seeds per generator — "hundreds/thousands", not one

function runsFor(generator, n = N) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(hashSeed('property-test', `${generator.name}:${i}`));
    out.push(generator(rng));
  }
  return out;
}

// --- 1. Generic integrity, every kind, N seeds each ---
for (const gen of GENERATORS) {
  const runs = runsFor(gen);
  let genericOk = true;
  for (const p of runs) {
    const opts = p.options.map(String);
    const uniq = new Set(opts);
    if (uniq.size !== opts.length) genericOk = false;
    if (opts.length < 2) genericOk = false;
    if (!opts.includes(String(p.answer))) genericOk = false;
  }
  check(`${gen.name}: answer always present exactly once, no duplicate options, across ${N} seeds`, genericOk);
}

// --- 2. Derivability: re-derive the answer from ONLY the displayed puzzle,
// independently of the generator's internal variables, for each kind. ---

function deriveArithmeticSequence(p) {
  // sequence entries look like "N → N*mult"; derive mult from the first one.
  const [aStr, bStr] = p.sequence[0].split('→').map((s) => s.trim());
  const a = Number(aStr), b = Number(bStr);
  const derivedMult = b / a;
  const input = Number(p.prompt.split('→')[0].trim());
  return input * derivedMult;
}
check('arithmeticSequence: answer is exactly input × the multiplier shown in the sequence', runsFor(GENERATORS.find((g) => g.name === 'arithmeticSequence')).every((p) => Number(p.answer) === deriveArithmeticSequence(p)));

function derivePatternAB(p) {
  const shown = p.sequence.slice(0, -1); // drop trailing '?'
  const [a, b] = shown;
  for (let i = 0; i < shown.length; i++) {
    if (shown[i] !== (i % 2 === 0 ? a : b)) return Symbol('inconsistent'); // strictly alternating, or the puzzle itself is malformed
  }
  return shown.length % 2 === 0 ? a : b;
}
check('patternAB: the alternating pattern shown always determines the next symbol', runsFor(GENERATORS.find((g) => g.name === 'patternAB')).every((p) => p.answer === derivePatternAB(p)));

function deriveOddOneOut(p) {
  const counts = {};
  for (const s of p.grid) counts[s] = (counts[s] || 0) + 1;
  const entries = Object.entries(counts);
  const minority = entries.reduce((min, e) => (e[1] < min[1] ? e : min), entries[0]);
  return minority[0];
}
check('oddOneOut: exactly one symbol appears less often than the rest, and it is the answer', runsFor(GENERATORS.find((g) => g.name === 'oddOneOut')).every((p) => {
  const counts = {};
  for (const s of p.grid) counts[s] = (counts[s] || 0) + 1;
  const values = Object.values(counts);
  const minorityCount = Math.min(...values);
  const minorityKinds = Object.entries(counts).filter(([, c]) => c === minorityCount);
  return minorityKinds.length === 1 && minorityKinds[0][0] === p.answer;
}));

function deriveMemorySequence(p) {
  const n = Number(p.prompt.match(/#(\d+)/)[1]);
  return p.sequence[n - 1];
}
check('memorySequence: the asked-for position in the shown sequence always matches the answer', runsFor(GENERATORS.find((g) => g.name === 'memorySequence')).every((p) => p.answer === deriveMemorySequence(p)));

function deriveLogicSwitches(p) {
  const liveLine = p.sequence.find((s) => / I am live\./.test(s) && !/NOT live/.test(s));
  return liveLine.split(' switch')[0];
}
check('logicSwitches: exactly one statement claims to be live, and it names the answer', runsFor(GENERATORS.find((g) => g.name === 'logicSwitches')).every((p) => {
  const liveLines = p.sequence.filter((s) => / I am live\./.test(s) && !/NOT live/.test(s));
  return liveLines.length === 1 && deriveLogicSwitches(p) === p.answer;
}));

function deriveArrangeSymbols(p) {
  const shown = p.sequence.slice(0, -1);
  const cycle = shown.slice(0, 3);
  for (let i = 0; i < shown.length; i++) {
    if (shown[i] !== cycle[i % 3]) return Symbol('inconsistent');
  }
  return cycle[shown.length % 3];
}
check('arrangeSymbols: the shown repeating cycle always determines the next symbol (regression test for the fixed bug)', runsFor(GENERATORS.find((g) => g.name === 'arrangeSymbols')).every((p) => p.answer === deriveArrangeSymbols(p)));

function deriveCipherShift(p) {
  const shift = Number(p.prompt.match(/Shift-(\d+)/)[1]);
  const encoded = p.prompt.match(/"([A-Z])"/)[1];
  const code = ((encoded.charCodeAt(0) - 65 - shift) % 26 + 26) % 26;
  return String.fromCharCode(65 + code);
}
check('cipherShift: decoding the shown letter by the stated shift always matches the answer', runsFor(GENERATORS.find((g) => g.name === 'cipherShift')).every((p) => p.answer === deriveCipherShift(p)));

check('findCorruptedNode: the answer always contains the malformed marker and is present in the shown list', runsFor(GENERATORS.find((g) => g.name === 'findCorruptedNode')).every((p) => p.answer.includes('#') && p.grid.includes(p.answer)));

function deriveSignalDifference(p) {
  const counts = {};
  for (const v of p.grid) counts[v] = (counts[v] || 0) + 1;
  const entries = Object.entries(counts);
  const minority = entries.reduce((min, e) => (e[1] < min[1] ? e : min), entries[0]);
  return minority[0];
}
check('signalDifference: the frequency that appears only once is always the answer', runsFor(GENERATORS.find((g) => g.name === 'signalDifference')).every((p) => deriveSignalDifference(p) === p.answer));

function deriveRotatingSymbol(p) {
  const shown = p.sequence;
  const angles = shown.map((s) => Number(s.split('@')[1].replace('°', '')));
  for (let i = 1; i < angles.length; i++) {
    if (angles[i] - angles[i - 1] !== 90) return Symbol('inconsistent');
  }
  const symbol = shown[0].split('@')[0];
  return `${symbol}@${angles[angles.length - 1] + 90}°`;
}
check('rotatingSymbol: each step rotates exactly 90° further, and the answer is the next rotation', runsFor(GENERATORS.find((g) => g.name === 'rotatingSymbol')).every((p) => p.answer === deriveRotatingSymbol(p)));

function deriveSequenceCompletion(p) {
  const shown = p.prompt.replace(', ?', '').split(',').map((s) => Number(s.trim()));
  for (let i = 2; i < shown.length; i++) {
    if (shown[i] !== shown[i - 1] + shown[i - 2]) return NaN;
  }
  return shown[shown.length - 1] + shown[shown.length - 2];
}
check('sequenceCompletion: each term is the sum of the two before it, and the answer continues that rule', runsFor(GENERATORS.find((g) => g.name === 'sequenceCompletion')).every((p) => Number(p.answer) === deriveSequenceCompletion(p)));

check('matchSignal: the answer is always exactly the symbol named in the prompt', runsFor(GENERATORS.find((g) => g.name === 'matchSignal')).every((p) => p.prompt.includes(p.answer)));

function deriveCodeReconstruction(p) {
  const shown = p.prompt.split(': ')[1];
  const digits = shown.split('').map((c) => (c === '_' ? null : Number(c)));
  const hiddenIndex = digits.indexOf(null);
  // derive the step from any fully-visible adjacent pair not touching the gap
  let step = null;
  for (let i = 0; i < digits.length - 1; i++) {
    if (i !== hiddenIndex && i + 1 !== hiddenIndex) { step = (digits[i + 1] - digits[i] + 10) % 10; break; }
  }
  if (step === null) return Symbol('undeterminable'); // would mean the puzzle itself gives no solvable neighbor pair
  // walk from the nearest visible neighbor to the gap
  const before = hiddenIndex > 0 ? digits[hiddenIndex - 1] : null;
  if (before !== null) return String((before + step) % 10);
  const after = digits[hiddenIndex + 1];
  return String((after - step + 10) % 10);
}
check('codeReconstruction: the missing digit is always derivable from the stated fixed step (regression test for the fixed unsolvable bug)', runsFor(GENERATORS.find((g) => g.name === 'codeReconstruction')).every((p) => p.answer === deriveCodeReconstruction(p)));

function deriveDeductionGrid(p) {
  const [clueA, clueB] = p.prompt.split('Given: ')[1].split(' Exactly')[0].split(/(?<=unstable\.) /);
  const namedUnstable = [clueA, clueB].map((c) => c.split(' is unstable')[0]);
  return p.options.find((item) => !namedUnstable.includes(item));
}
check('deductionGrid: the item never named "unstable" is always the answer, and the other two always are (regression test for the fixed contradiction bug)', runsFor(GENERATORS.find((g) => g.name === 'deductionGrid')).every((p) => {
  const namedUnstable = p.options.filter((item) => p.prompt.includes(`${item} is unstable.`));
  return namedUnstable.length === 2 && !namedUnstable.includes(p.answer);
}));

function deriveBinaryFlip(p) {
  const [, bits, idx] = p.prompt.match(/Flip bit #(\d+) of (\d+)/) ? [null, p.prompt.match(/of (\d+)/)[1], p.prompt.match(/#(\d+)/)[1]] : [null, null, null];
  const arr = bits.split('');
  const i = Number(idx) - 1;
  arr[i] = arr[i] === '0' ? '1' : '0';
  return arr.join('');
}
check('binaryFlip: flipping the stated bit of the stated string always matches the answer', runsFor(GENERATORS.find((g) => g.name === 'binaryFlip')).every((p) => p.answer === deriveBinaryFlip(p)));

check('symbolCount: the answer always equals the actual count of the target symbol in the shown grid', runsFor(GENERATORS.find((g) => g.name === 'symbolCount')).every((p) => {
  const target = p.prompt.match(/How many (\S+) symbols/)[1];
  return Number(p.answer) === p.grid.filter((s) => s === target).length;
}));

check('pathfinding: the answer is consistently derivable from whether the blocked cell sits on the direct diagonal', runsFor(GENERATORS.find((g) => g.name === 'pathfinding')).every((p) => {
  const blockedIsCenter = p.grid[4] === '✕';
  return p.answer === (blockedIsCenter ? 'AROUND' : 'STRAIGHT');
}));

// --- 3. No-repeat-within-3-attempts guarantee still holds after the fixes ---
const { generateRecoveryPuzzle } = await import('../src/engine/recoveryPuzzle.js');
let repeatViolations = 0;
for (let seed = 0; seed < 300; seed++) {
  const kinds = [0, 1, 2].map((attempt) => generateRecoveryPuzzle({ id: 'p' + seed, game_seed: 'prop-seed-' + seed, recovery_attempts: attempt }).kind);
  if (new Set(kinds).size !== 3) repeatViolations++;
}
check('no-repeat guarantee still holds post-fix across 300 simulated teams', repeatViolations === 0);

console.log(`\n${pass} passed, ${fail} failed (property tests: ${N} seeds × ${GENERATORS.length} generators)`);
process.exit(fail > 0 ? 1 : 0);
