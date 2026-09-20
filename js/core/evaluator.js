// Fast 5–7 card hand evaluator. evaluate(cards) -> integer score; higher wins.
// Score layout: category << 20 | k0<<16 | k1<<12 | k2<<8 | k3<<4 | k4
import { RANK_LABEL } from './cards.js';

export const CATEGORY = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

function straightHigh(mask) {
  if (mask & (1 << 14)) mask |= 1 << 1;          // wheel: ace plays low
  for (let hi = 14; hi >= 5; hi--) {
    if (((mask >> (hi - 4)) & 0x1f) === 0x1f) return hi;
  }
  return 0;
}
function topN(mask, n, exclude = 0) {
  const out = [];
  for (let r = 14; r >= 2 && out.length < n; r--) {
    if ((mask & (1 << r)) && !(exclude & (1 << r))) out.push(r);
  }
  return out;
}
function pack(cat, ranks) {
  let s = cat << 20;
  for (let i = 0; i < 5; i++) s |= (ranks[i] || 0) << (16 - 4 * i);
  return s;
}

export function evaluate(cards) {
  const rc = new Uint8Array(15);
  const sc = [0, 0, 0, 0];
  const sm = [0, 0, 0, 0];
  let rm = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    rc[c.r]++; sc[c.s]++; rm |= 1 << c.r; sm[c.s] |= 1 << c.r;
  }
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightHigh(sm[flushSuit]);
    if (sf) return pack(8, [sf]);
  }
  let quad = 0; const trips = []; const pairs = [];
  for (let r = 14; r >= 2; r--) {
    const n = rc[r];
    if (n === 4) quad = r; else if (n === 3) trips.push(r); else if (n === 2) pairs.push(r);
  }
  if (quad) return pack(7, [quad, ...topN(rm, 1, 1 << quad)]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    return pack(6, [trips[0], trips.length > 1 ? trips[1] : pairs[0]]);
  }
  if (flushSuit >= 0) return pack(5, topN(sm[flushSuit], 5));
  const st = straightHigh(rm);
  if (st) return pack(4, [st]);
  if (trips.length) return pack(3, [trips[0], ...topN(rm, 2, 1 << trips[0])]);
  if (pairs.length >= 2) return pack(2, [pairs[0], pairs[1], ...topN(rm, 1, (1 << pairs[0]) | (1 << pairs[1]))]);
  if (pairs.length === 1) return pack(1, [pairs[0], ...topN(rm, 3, 1 << pairs[0])]);
  return pack(0, topN(rm, 5));
}

export function category(score) { return score >> 20; }

export function describe(score) {
  const cat = score >> 20;
  const k = [];
  for (let i = 0; i < 5; i++) k.push((score >> (16 - 4 * i)) & 0xf);
  const L = (r) => RANK_LABEL[r];
  const plural = (r) => (r === 6 ? 'Sixes' : L(r) + 's');
  switch (cat) {
    case 8: return k[0] === 14 ? 'Royal Flush' : `Straight Flush, ${L(k[0])} high`;
    case 7: return `Four ${plural(k[0])}`;
    case 6: return `Full House, ${plural(k[0])} full of ${plural(k[1])}`;
    case 5: return `Flush, ${L(k[0])} high`;
    case 4: return `Straight, ${L(k[0])} high`;
    case 3: return `Three ${plural(k[0])}`;
    case 2: return `Two Pair, ${plural(k[0])} and ${plural(k[1])}`;
    case 1: return `Pair of ${plural(k[0])}`;
    default: return `${L(k[0])} high`;
  }
}

// Which of the given cards make up the best five? (for highlighting at showdown)
export function bestFive(cards) {
  if (cards.length <= 5) return cards.slice();
  let best = -1, bestSet = null;
  const n = cards.length;
  const idx = [0, 1, 2, 3, 4];
  const combo = () => idx.map((i) => cards[i]);
  while (true) {
    const set = combo();
    const s = evaluate(set);
    if (s > best) { best = s; bestSet = set; }
    let i = 4;
    while (i >= 0 && idx[i] === n - 5 + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < 5; j++) idx[j] = idx[j - 1] + 1;
  }
  return bestSet;
}
