// Small deterministic PRNG so per-team randomization (object positions, agent
// response variants, level 2's trigger, etc.) is reproducible from gameSeed
// for debugging — spec section 25 (Controlled Randomization).

export function hashSeed(seed, salt = '') {
  const str = `${seed}:${salt}`;
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

// mulberry32 — fast, tiny, deterministic PRNG returning a function () => [0,1)
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
