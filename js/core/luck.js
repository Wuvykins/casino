// A little luck for the person holding the phone. Nothing is tied to when they sit down or come back;
// it just happens now and then, in the middle of ordinary play, and only pays off if they stay in.
//
// Hold'em: some hands are dealt from a deck arranged so that the human ends up with the best hand at the
// river while one or more opponents hold genuinely strong second-best hands (so they call and raise for
// real reasons). The human still has to see the flop and stay in; fold and it's just another hand.
// Blackjack: now and then the next card is the one you wanted, or the dealer's draw goes over.
// Everything else is a straight deal, so plenty of hands are still lost the normal way.
import { freshDeck, shuffle } from './cards.js';
import { evaluate, category } from './evaluator.js';
import { preflopStrength } from './ai.js';

export const LUCK = {
  holdemValue: 0.08,    // per hand: you end up best, 1-2 opponents have a real hand to pay you with
  holdemFamily: 0.03,   // per hand: everyone has something, big pot, yours is the best
  goodHoleCards: 0.12,  // per hand: your hole cards are re-drawn to something playable (no other fixing)
  bjDeal: 0.06,         // per round: your first two cards make 20 or 21
  bjHit: 0.15,          // per hit on 12-16: the next card makes 17-21
  bjDealerBust: 0.15,   // per dealer play while you're standing on 12-16: the dealer goes over
};

// ---------- hold'em ----------
// order: player ids in dealing order (left of the button first). Returns a full 52-card deck arranged so
// that Hand.start() deals this scenario (cards are popped from the END of the deck), or null.
export function luckyHoldemDeck(order, humanId, flavor, rng, tries = 400) {
  const n = order.length;
  const hi = order.indexOf(humanId);
  if (hi < 0 || n < 2) return null;
  const need = 2 * n + 8; // hole cards, burn, flop, burn, turn, burn, river
  for (let t = 0; t < tries; t++) {
    const deck = shuffle(freshDeck(), rng);
    const seq = deck.slice(0, need);
    const hole = order.map((_, i) => [seq[i], seq[n + i]]);
    const board = [seq[2 * n + 1], seq[2 * n + 2], seq[2 * n + 3], seq[2 * n + 5], seq[2 * n + 7]];
    const flop = board.slice(0, 3);
    const me = hole[hi];
    const pre = preflopStrength(me);
    if (pre < 0.28 || pre > 0.8) continue;                      // playable, not a monster you'd expect to win anyway
    if (category(evaluate([...me, ...flop])) < 1) continue;     // the flop gives you something to stay with
    const scores = hole.map((hc) => evaluate([...hc, ...board]));
    const mine = scores[hi];
    if (category(mine) < 2) continue;                           // two pair or better at the river
    if (scores.some((s, i) => i !== hi && s >= mine)) continue; // you win outright
    const topBoard = Math.max(...board.map((c) => c.r));
    let strong = 0, decent = 0;
    scores.forEach((s, i) => {
      if (i === hi) return;
      const cat = category(s);
      const topPair = cat === 1 && ((s >> 16) & 15) === topBoard;
      if (cat >= 2 || topPair) strong++;
      if (cat >= 1) decent++;
    });
    if (flavor === 'family') { if (strong < Math.min(2, n - 1) || decent < Math.min(3, n - 1)) continue; }
    else { if (strong < 1) continue; if (n > 3 && strong > 2) continue; }
    // arrange: the rest of the deck underneath, the scenario on top (popped last-in-first-out)
    return [...deck.slice(need), ...seq.slice().reverse()];
  }
  return null;
}

// Just better starting cards for the human, everything else honest: swap the human's two hole cards for
// a playable pair from deeper in the deck. Returns a new deck or null.
export function betterHoleCards(order, humanId, rng, minStrength = 0.45) {
  const n = order.length;
  const hi = order.indexOf(humanId);
  if (hi < 0) return null;
  const deck = shuffle(freshDeck(), rng);
  const top = deck.length - 1;
  const a = top - hi, b = top - (n + hi);                      // positions Hand.start() will deal to the human
  const pool = [];
  for (let i = 0; i < deck.length - 2 * n - 8; i++) pool.push(i); // cards that would never be dealt this hand
  for (let t = 0; t < 60; t++) {
    const i = pool[rng.int(pool.length)], j = pool[rng.int(pool.length)];
    if (i === j) continue;
    if (preflopStrength([deck[i], deck[j]]) >= minStrength) {
      [deck[a], deck[i]] = [deck[i], deck[a]];
      [deck[b], deck[j]] = [deck[j], deck[b]];
      return deck;
    }
  }
  return null;
}

// ---------- blackjack ----------
// shoe.cards is drawn from the END. "position k from the top" = cards[len - 1 - k].
const bjVal = (c) => (c.r >= 10 && c.r <= 13 ? 10 : c.r === 14 ? 11 : c.r);
function total(cards) { let t = 0, a = 0; for (const c of cards) { t += bjVal(c); if (c.r === 14) a++; } while (t > 21 && a > 0) { t -= 10; a--; } return t; }
const at = (shoe, k) => shoe.cards[shoe.cards.length - 1 - k];
function swapTop(shoe, k, j) { const L = shoe.cards.length - 1; [shoe.cards[L - k], shoe.cards[L - j]] = [shoe.cards[L - j], shoe.cards[L - k]]; }

// Before the deal: make the human's two cards total 20 or 21, using cards from the next `window` in the shoe.
export function bjLuckyDeal(shoe, playerCount, humanIndex, rng, window = 18) {
  const p1 = humanIndex, p2 = playerCount + 1 + humanIndex;
  if (shoe.cards.length < window + 4) return false;
  const prefer = rng.chance(0.35) ? 21 : 20;
  for (const want of [prefer, prefer === 21 ? 20 : 21]) {
    const pairs = [];
    for (let i = 0; i < window; i++) for (let j = 0; j < window; j++) if (i !== j && total([at(shoe, i), at(shoe, j)]) === want) pairs.push([i, j]);
    if (!pairs.length) continue;
    const [i, j] = pairs[rng.int(pairs.length)];
    // move i -> p1, j -> p2 (careful when they cross)
    swapTop(shoe, p1, i);
    const jj = j === p1 ? i : j;
    swapTop(shoe, p2, jj);
    return true;
  }
  return false;
}

// On a hit from 12-16: put a card that makes 17-21 on top, from the next few cards.
export function bjLuckyHit(shoe, cards, rng, window = 6) {
  const t = total(cards);
  if (t < 12 || t > 16 || shoe.cards.length < window + 2) return false;
  const good = [];
  for (let k = 0; k < window; k++) { const v = total([...cards, at(shoe, k)]); if (v >= 17 && v <= 21) good.push(k); }
  if (!good.length) return false;
  swapTop(shoe, 0, good[rng.int(good.length)]);
  return true;
}

// Dealer about to play with the human sitting on 12-16: find an order of the next few cards that busts the dealer.
export function bjDealerBusts(shoe, dealerCards, hitsSoft17, rng, window = 6) {
  if (shoe.cards.length < window + 2) return false;
  const top = []; for (let k = 0; k < window; k++) top.push(at(shoe, k));
  const plays = (seq) => {
    const hand = dealerCards.slice(); let i = 0;
    while (true) {
      let t = 0, aces = 0; for (const c of hand) { t += bjVal(c); if (c.r === 14) aces++; }
      let soft = false; while (t > 21 && aces > 0) { t -= 10; aces--; } soft = aces > 0;
      if (t > 21) return true;
      if (t > 17 || (t === 17 && !(soft && hitsSoft17))) return false;
      if (i >= seq.length) return false;
      hand.push(seq[i++]);
    }
  };
  // try a handful of shuffles of the window
  for (let t = 0; t < 30; t++) {
    const seq = top.slice();
    for (let i = seq.length - 1; i > 0; i--) { const j = rng.int(i + 1); [seq[i], seq[j]] = [seq[j], seq[i]]; }
    if (plays(seq)) {
      const L = shoe.cards.length - 1;
      seq.forEach((c, k) => { shoe.cards[L - k] = c; });
      return true;
    }
  }
  return false;
}
