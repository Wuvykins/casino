// Credit card tiers. Your card is re-evaluated every time you cash out at a table (or get bailed out).
export const START_BANK = 1000;

export const TIERS = [
  { id: 1, name: 'Basic',     min: 0,       colors: ['#9aa3ad', '#5d6670'], text: '#1e2a3a' },
  { id: 2, name: 'Silver',    min: 2500,    colors: ['#d9dde3', '#8f98a3'], text: '#22282f' },
  { id: 3, name: 'Gold',      min: 5000,    colors: ['#f2d16b', '#a67c1d'], text: '#2b2000' },
  { id: 4, name: 'Platinum',  min: 25000,   colors: ['#f4f4f6', '#b9bcc6'], text: '#1c2340' },
  { id: 5, name: 'Sovereign', min: 100000,  colors: ['#2a2a2e', '#000000'], text: '#e6d38a' },
];

export function tierFor(bank) {
  let t = TIERS[0];
  for (const tier of TIERS) if (bank >= tier.min) t = tier;
  return t;
}
export function tierById(id) { return TIERS.find((t) => t.id === id) || TIERS[0]; }
export function nextTier(tier) { return TIERS.find((t) => t.id === tier.id + 1) || null; }
