// Cards are small objects: { r: 2..14, s: 0..3 }  (14 = Ace; suits: 0=spades 1=hearts 2=diamonds 3=clubs)
export const SUITS = ['s', 'h', 'd', 'c'];
export const SUIT_GLYPH = ['♠', '♥', '♦', '♣'];
export const RANK_CHAR = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const RANK_LABEL = { ...RANK_CHAR, 10: '10' };
export const CHAR_RANK = Object.fromEntries(Object.entries(RANK_CHAR).map(([k, v]) => [v, +k]));

export function card(r, s) { return { r, s }; }
export function cardKey(c) { return RANK_CHAR[c.r] + SUITS[c.s].toUpperCase(); }   // e.g. "AS", "TD"
export function cardText(c) { return RANK_LABEL[c.r] + SUIT_GLYPH[c.s]; }
export function isRed(c) { return c.s === 1 || c.s === 2; }
export function parseCard(str) {                 // "As", "Td", "10h"
  const m = /^(10|[2-9TJQKA])([shdc])$/i.exec(str.trim());
  if (!m) throw new Error('bad card ' + str);
  const r = m[1] === '10' ? 10 : CHAR_RANK[m[1].toUpperCase()];
  return card(r, SUITS.indexOf(m[2].toLowerCase()));
}
export function parseCards(str) { return str.trim().split(/\s+/).map(parseCard); }

export function freshDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push(card(r, s));
  return d;
}

export function shuffle(deck, rng) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
  }
  return deck;
}

export function sameCard(a, b) { return a.r === b.r && a.s === b.s; }
