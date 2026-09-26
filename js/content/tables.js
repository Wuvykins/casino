// Hold'em. Cash tables (`nolimit`) and tournaments (`tourney`: The Open, The Classic, The Major, High Roller, Championship): everyone buys in for the same amount and
// gets the same stack of tournament chips; blinds rise every few hands; bust and you're out; first and second are
// paid from the prize pool: 4× the entry for first, 2× for second — enough to be worth it, not enough to jump a whole card tier in one go (Nic: 'I don't want to pass up cards'). `tier` is the minimum card tier needed to sit down.
export const HOLDEM_TABLES = [
  { id: 'nl-1-2',     mode: 'nolimit', name: 'No-Limit $1/$2',        sb: 1,   bb: 2,    minBuy: 50,    maxBuy: 200,    tier: 1, nudge: 25 },
  { id: 'nl-5-10',    mode: 'nolimit', name: 'No-Limit $5/$10',       sb: 5,   bb: 10,   minBuy: 300,   maxBuy: 1000,   tier: 2, nudge: 25 },
  { id: 'nl-25-50',   mode: 'nolimit', name: 'No-Limit $25/$50',      sb: 25,  bb: 50,   minBuy: 1500,  maxBuy: 5000,   tier: 3, nudge: 25 },
  { id: 'nl-100-200', mode: 'nolimit', name: 'No-Limit $100/$200',    sb: 100, bb: 200,  minBuy: 5000,  maxBuy: 20000,  tier: 4, nudge: 25 },
  { id: 'nl-500-1000',mode: 'nolimit', name: 'High Roller $500/$1000',sb: 500, bb: 1000, minBuy: 25000, maxBuy: 100000, tier: 5, nudge: 25 },
  // tournaments: minBuy/maxBuy are both the entry fee (the lobby uses them to say what you need in the bank).
  // `nudge` (every hold'em table): how many hands in 100 are dealt in your favour (core/luck.js holdemNudge). 0 = an honest
  // deal. Cash tables 25 (1 in 4); tournaments get harder as they go up — measured with tests/sng.sim.mjs.
  { id: 'sng-200',    mode: 'tourney', name: 'The Open',         buyIn: 200,    prizes: [800, 400],       chips: 1500, nudge: 25, minBuy: 200,    maxBuy: 200,    tier: 1 },
  { id: 'sng-1000',   mode: 'tourney', name: 'The Classic',       buyIn: 1000,   prizes: [4000, 2000],      chips: 1500, nudge: 20, minBuy: 1000,   maxBuy: 1000,   tier: 2 },
  { id: 'sng-5000',   mode: 'tourney', name: 'The Major',       buyIn: 5000,   prizes: [20000, 10000],     chips: 1500, nudge: 15, minBuy: 5000,   maxBuy: 5000,   tier: 3 },
  { id: 'sng-20000',  mode: 'tourney', name: 'High Roller',      buyIn: 20000,  prizes: [80000, 40000],   chips: 1500, nudge: 10, minBuy: 20000,  maxBuy: 20000,  tier: 4 },
  { id: 'sng-100000', mode: 'tourney', name: 'Championship', buyIn: 100000, prizes: [400000, 200000],  chips: 1500, nudge: 5, minBuy: 100000, maxBuy: 100000, tier: 5 },
];
// tournament blind schedule (tournament chips), and how many hands each level lasts
export const TOURNEY_BLINDS = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000], [750, 1500], [1000, 2000], [1500, 3000], [2000, 4000]];
export const TOURNEY_LEVEL_HANDS = 8;

// Blackjack tables: bet limits and the buy-in range for sitting down.
export const BLACKJACK_TABLES = [
  { id: 'bj-5',    game: 'blackjack', name: 'Blackjack $5–$100',        minBet: 5,    maxBet: 100,   minBuy: 50,    maxBuy: 500,    tier: 1 },
  { id: 'bj-25',   game: 'blackjack', name: 'Blackjack $25–$500',       minBet: 25,   maxBet: 500,   minBuy: 250,   maxBuy: 2500,   tier: 2 },
  { id: 'bj-100',  game: 'blackjack', name: 'Blackjack $100–$2,000',    minBet: 100,  maxBet: 2000,  minBuy: 1000,  maxBuy: 10000,  tier: 3 },
  { id: 'bj-500',  game: 'blackjack', name: 'Blackjack $500–$10,000',   minBet: 500,  maxBet: 10000, minBuy: 5000,  maxBuy: 50000,  tier: 4 },
  { id: 'bj-1000', game: 'blackjack', name: 'High Roller $1,000–$50,000', minBet: 1000, maxBet: 50000, minBuy: 20000, maxBuy: 200000, tier: 5 },
];

// Cribbage: a stake per game. A skunk (loser under 91) pays double, a double skunk (under 61) triple.
// You buy in with enough to cover a few games; whatever's left comes back to the bank when you leave.
// nudge = hands in 100 that go your way (a strong six, or a cut that helps you) — see cribNudge in core/luck.js
export const CRIBBAGE_TABLES = [
  { id: 'crib-10',   game: 'cribbage', name: 'Cribbage $10 a game',    stake: 10,   minBuy: 30,    maxBuy: 200,    tier: 1, nudge: 40 },
  { id: 'crib-50',   game: 'cribbage', name: 'Cribbage $50 a game',    stake: 50,   minBuy: 150,   maxBuy: 1000,   tier: 2, nudge: 35 },
  { id: 'crib-250',  game: 'cribbage', name: 'Cribbage $250 a game',   stake: 250,  minBuy: 750,   maxBuy: 5000,   tier: 3, nudge: 30 },
  { id: 'crib-1000', game: 'cribbage', name: 'Cribbage $1,000 a game', stake: 1000, minBuy: 3000,  maxBuy: 20000,  tier: 4, nudge: 25 },
  { id: 'crib-5000', game: 'cribbage', name: 'Cribbage $5,000 a game', stake: 5000, minBuy: 15000, maxBuy: 100000, tier: 5, nudge: 20 },
];

// Farkle: everybody puts up the stake, the winner takes the pot. First to 10,000.
// save = how many of your farkles in 100 quietly come up scoring instead (farkleSave in core/luck.js)
export const FARKLE_TABLES = [
  { id: 'fk-10',   game: 'farkle', name: 'Farkle $10 a game',    stake: 10,   minBuy: 30,    maxBuy: 200,    tier: 1, save: 50 },
  { id: 'fk-50',   game: 'farkle', name: 'Farkle $50 a game',    stake: 50,   minBuy: 150,   maxBuy: 1000,   tier: 2, save: 45 },
  { id: 'fk-250',  game: 'farkle', name: 'Farkle $250 a game',   stake: 250,  minBuy: 750,   maxBuy: 5000,   tier: 3, save: 40 },
  { id: 'fk-1000', game: 'farkle', name: 'Farkle $1,000 a game', stake: 1000, minBuy: 3000,  maxBuy: 20000,  tier: 4, save: 35 },
  { id: 'fk-5000', game: 'farkle', name: 'Farkle $5,000 a game', stake: 5000, minBuy: 15000, maxBuy: 100000, tier: 5, save: 30 },
];

export const SLOT_TABLES = [
  { id: 'slots-vh', game: 'slots', name: 'Van Halen · Hot for Jackpot', minBet: 1, maxBet: 100, minBuy: 20, maxBuy: 2000, tier: 1, bets: [1, 2, 5, 10, 25, 50, 100] },
];

export const MAX_SEATS = 6; // you + up to 5 opponents

const ALL = () => [...HOLDEM_TABLES, ...BLACKJACK_TABLES, ...CRIBBAGE_TABLES, ...FARKLE_TABLES, ...SLOT_TABLES];
export function cheapestBuyIn() { return Math.min(...ALL().map((t) => t.minBuy)); }
export function tableById(id) { return ALL().find((t) => t.id === id); }
