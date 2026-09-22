// Slots: three reels, one payline, six symbols. A family machine, not a casino one: it pays back around 93 cents
// on the dollar over the long run (see tests/slots.test.mjs), with small wins often enough to stay fun.
//
//   const m = new Machine({ rng });
//   const r = m.spin(bet);         // -> { stops: [i,i,i], symbols: [s,s,s], payout, kind: 'miss'|'win'|'jackpot', name }
//
// Symbols (index = position on the symbols art): 0 VH logo, 1 record, 2 amp, 3 seven, 4 lightning bolt, 5 guitar.
export const SYMBOLS = ['vh', 'record', 'amp', 'seven', 'bolt', 'guitar'];
export const SYMBOL_NAMES = { vh: 'Van Halen', record: 'Record', amp: 'Amp', seven: 'Seven', bolt: 'Bolt', guitar: 'Guitar' };

// One reel strip per reel: 24 stops each; two VH logos per reel (jackpot about one spin in 1,700).
export const STRIPS = [
  [4, 1, 4, 2, 5, 1, 4, 3, 1, 4, 0, 2, 4, 1, 5, 2, 4, 3, 1, 4, 2, 0, 4, 3],
  [4, 2, 1, 4, 3, 1, 5, 4, 2, 1, 4, 0, 2, 4, 1, 3, 4, 5, 1, 2, 4, 3, 1, 0],
  [1, 4, 2, 4, 1, 3, 4, 2, 5, 1, 4, 0, 4, 1, 3, 4, 0, 2, 1, 4, 5, 3, 4, 1],
];
export const STOPS = STRIPS[0].length;

// Payout as a multiple of the bet.
export const PAYTABLE = [
  { name: 'Three Van Halen', test: (s) => s.every((x) => x === 0), mult: 200, jackpot: true },
  { name: 'Three guitars', test: (s) => s.every((x) => x === 5), mult: 50 },
  { name: 'Three sevens', test: (s) => s.every((x) => x === 3), mult: 25 },
  { name: 'Three amps', test: (s) => s.every((x) => x === 2), mult: 15 },
  { name: 'Three records', test: (s) => s.every((x) => x === 1), mult: 10 },
  { name: 'Three bolts', test: (s) => s.every((x) => x === 4), mult: 5 },
  { name: 'Two Van Halen', test: (s) => s.filter((x) => x === 0).length === 2, mult: 3 },
  { name: 'One Van Halen', test: (s) => s.filter((x) => x === 0).length === 1, mult: 1 },
  { name: 'Two alike', test: (s) => new Set(s).size === 2 && !s.includes(0), mult: 0.3 },
];

export function evaluateStops(stops, bet) {
  const symbols = stops.map((st, i) => STRIPS[i][st]);
  for (const row of PAYTABLE) {
    if (row.test(symbols)) {
      const payout = Math.round(bet * row.mult);
      return { symbols, payout, kind: row.jackpot ? 'jackpot' : payout > 0 ? 'win' : 'miss', name: row.name, mult: row.mult };
    }
  }
  return { symbols, payout: 0, kind: 'miss', name: null, mult: 0 };
}

export class Machine {
  constructor({ rng }) { this.rng = rng; }
  spin(bet) {
    const stops = STRIPS.map((strip) => this.rng.int(strip.length));
    return { stops, bet, ...evaluateStops(stops, bet) };
  }
  // for the luck system: a spin that is guaranteed to pay something modest (never the jackpot)
  spinSmallWin(bet, tries = 200) {
    for (let t = 0; t < tries; t++) {
      const r = this.spin(bet);
      if (r.kind === 'win' && r.mult <= 10) return r;
    }
    return this.spin(bet);
  }
}

// Long-run return to player, by brute force over every stop combination.
export function rtp() {
  let total = 0, n = 0, hits = 0;
  for (let a = 0; a < STOPS; a++) for (let b = 0; b < STOPS; b++) for (let c = 0; c < STOPS; c++) {
    const r = evaluateStops([a, b, c], 100); total += r.payout; n++; if (r.payout > 0) hits++;
  }
  return { rtp: total / (n * 100), hitRate: hits / n, combos: n };
}
