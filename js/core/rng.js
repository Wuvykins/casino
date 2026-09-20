// Seedable RNG (mulberry32). Use a seed for reproducible tests; omit for real play.
export function makeRng(seed) {
  if (seed === undefined || seed === null) {
    return {
      next: () => Math.random(),
      int: (n) => Math.floor(Math.random() * n),
      range: (a, b) => a + Math.random() * (b - a),
      pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
      chance: (p) => Math.random() < p,
    };
  }
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

// Approximate normal(0,1) via sum of uniforms.
export function gauss(rng) {
  let s = 0;
  for (let i = 0; i < 6; i++) s += rng.next();
  return (s - 3) / Math.sqrt(0.5);
}
