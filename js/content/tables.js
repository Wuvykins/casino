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

export const MAX_SEATS = 6; // you + up to 5 opponents

export function cheapestBuyIn() { return Math.min(...HOLDEM_TABLES.map((t) => t.minBuy), ...BLACKJACK_TABLES.map((t) => t.minBuy)); }
export function tableById(id) { return HOLDEM_TABLES.find((t) => t.id === id); }
