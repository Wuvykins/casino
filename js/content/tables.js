// Hold'em tables. `tier` is the minimum card tier needed to sit down.
// Limit tables are named by bet size ($2/$4 = small bet $2, big bet $4; blinds are $1/$2).
export const HOLDEM_TABLES = [
  { id: 'nl-1-2',     mode: 'nolimit', name: 'No-Limit $1/$2',        sb: 1,   bb: 2,    minBuy: 50,    maxBuy: 200,    tier: 1 },
  { id: 'lim-2-4',    mode: 'limit',   name: 'Limit $2/$4',           sb: 1,   bb: 2,    minBuy: 40,    maxBuy: 200,    tier: 1 },
  { id: 'nl-5-10',    mode: 'nolimit', name: 'No-Limit $5/$10',       sb: 5,   bb: 10,   minBuy: 300,   maxBuy: 1000,   tier: 2 },
  { id: 'lim-10-20',  mode: 'limit',   name: 'Limit $10/$20',         sb: 5,   bb: 10,   minBuy: 200,   maxBuy: 1000,   tier: 2 },
  { id: 'nl-25-50',   mode: 'nolimit', name: 'No-Limit $25/$50',      sb: 25,  bb: 50,   minBuy: 1500,  maxBuy: 5000,   tier: 3 },
  { id: 'lim-50-100', mode: 'limit',   name: 'Limit $50/$100',        sb: 25,  bb: 50,   minBuy: 1000,  maxBuy: 5000,   tier: 3 },
  { id: 'nl-100-200', mode: 'nolimit', name: 'No-Limit $100/$200',    sb: 100, bb: 200,  minBuy: 5000,  maxBuy: 20000,  tier: 4 },
  { id: 'lim-200-400',mode: 'limit',   name: 'Limit $200/$400',       sb: 100, bb: 200,  minBuy: 4000,  maxBuy: 20000,  tier: 4 },
  { id: 'nl-500-1000',mode: 'nolimit', name: 'High Roller $500/$1000',sb: 500, bb: 1000, minBuy: 25000, maxBuy: 100000, tier: 5 },
  { id: 'lim-1000-2000',mode: 'limit', name: 'Limit $1,000/$2,000',   sb: 500, bb: 1000, minBuy: 20000, maxBuy: 100000, tier: 5 },
];

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
export const CRIBBAGE_TABLES = [
  { id: 'crib-10',   game: 'cribbage', name: 'Cribbage $10 a game',    stake: 10,   minBuy: 30,    maxBuy: 200,    tier: 1 },
  { id: 'crib-50',   game: 'cribbage', name: 'Cribbage $50 a game',    stake: 50,   minBuy: 150,   maxBuy: 1000,   tier: 2 },
  { id: 'crib-250',  game: 'cribbage', name: 'Cribbage $250 a game',   stake: 250,  minBuy: 750,   maxBuy: 5000,   tier: 3 },
  { id: 'crib-1000', game: 'cribbage', name: 'Cribbage $1,000 a game', stake: 1000, minBuy: 3000,  maxBuy: 20000,  tier: 4 },
  { id: 'crib-5000', game: 'cribbage', name: 'Cribbage $5,000 a game', stake: 5000, minBuy: 15000, maxBuy: 100000, tier: 5 },
];

// Farkle: everybody puts up the stake, the winner takes the pot. First to 10,000.
export const FARKLE_TABLES = [
  { id: 'fk-10',   game: 'farkle', name: 'Farkle $10 a game',    stake: 10,   minBuy: 30,    maxBuy: 200,    tier: 1 },
  { id: 'fk-50',   game: 'farkle', name: 'Farkle $50 a game',    stake: 50,   minBuy: 150,   maxBuy: 1000,   tier: 2 },
  { id: 'fk-250',  game: 'farkle', name: 'Farkle $250 a game',   stake: 250,  minBuy: 750,   maxBuy: 5000,   tier: 3 },
  { id: 'fk-1000', game: 'farkle', name: 'Farkle $1,000 a game', stake: 1000, minBuy: 3000,  maxBuy: 20000,  tier: 4 },
  { id: 'fk-5000', game: 'farkle', name: 'Farkle $5,000 a game', stake: 5000, minBuy: 15000, maxBuy: 100000, tier: 5 },
];

export const MAX_SEATS = 6; // you + up to 5 opponents

const ALL = () => [...HOLDEM_TABLES, ...BLACKJACK_TABLES, ...CRIBBAGE_TABLES, ...FARKLE_TABLES];
export function cheapestBuyIn() { return Math.min(...ALL().map((t) => t.minBuy)); }
export function tableById(id) { return ALL().find((t) => t.id === id); }
